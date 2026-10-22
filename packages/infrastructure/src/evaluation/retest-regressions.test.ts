import { mkdirSync, writeFileSync } from "node:fs";
import { type AgentCommand, type FailureDiagnostic } from "@tradequote/contracts";
import { afterAll, expect, it, vi } from "vitest";
import { AgentRunCoordinator } from "../agent-run-coordinator";
import { DeepSeekProvider } from "../deepseek";
import { semanticCases, terms } from "./cases";
import { fixtureTransport } from "./fixture-model";
import { envelope, evaluationWorkspace } from "./workspace";

// Reconstructed synthetic classes for the eight public failed IDs. Real payloads were not retained.
const samples = [
  {
    id: "apparel-zh-v3",
    base: "apparel-zh",
    version: 3,
    fault: "early_complete",
    category: "premature_complete",
  },
  {
    id: "apparel-de-v2",
    base: "apparel-de",
    version: 2,
    fault: "quantity_format",
    category: "quantity_format",
  },
  {
    id: "panel-zh-v1",
    base: "panel-zh",
    version: 1,
    fault: "calculate_first",
    category: "calculate_first",
  },
  {
    id: "panel-en-v1",
    base: "panel-en",
    version: 1,
    fault: "knowledge_first",
    category: "knowledge_first",
  },
  {
    id: "panel-de-v3",
    base: "panel-de",
    version: 3,
    fault: "early_complete",
    category: "premature_complete",
  },
  {
    id: "fastener-zh-v1",
    base: "fastener-zh",
    version: 1,
    fault: "early_complete",
    category: "premature_complete",
  },
  {
    id: "fastener-en-v1",
    base: "fastener-en",
    version: 1,
    fault: "early_complete",
    category: "premature_complete",
  },
  {
    id: "fastener-de-v1",
    base: "fastener-de",
    version: 1,
    fault: "early_complete",
    category: "premature_complete",
  },
] as const;
const credentials = { key: "synthetic-retest-regression-key", model: "synthetic-model" };
const localEvidence: {
  id: string;
  status: "passed" | "failed";
  modelCallsIncludingPrerequisites: number;
  diagnostics: FailureDiagnostic[];
}[] = [];
afterAll(() => {
  mkdirSync(".runtime", { recursive: true });
  writeFileSync(
    ".runtime/c04-eight-reconstructed.json",
    `${JSON.stringify(
      {
        scope: "synthetic_reconstructed_regressions_not_real_payload_replay",
        providerValidation: "fixture_only",
        realRequests: 0,
        plannedCases: 8,
        observedCases: localEvidence.length,
        cases: localEvidence,
      },
      null,
      2,
    )}\n`,
  );
});

it.each(samples)(
  "C04 retest reconstructed $id preserves the original business checks",
  async (sample) => {
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("EXTERNAL_REQUEST_FORBIDDEN"));
    const plan = semanticCases.find((c) => c.id === sample.base)!;
    const f = evaluationWorkspace(plan.category.sku);
    let calls = 0,
      passed = false;
    let version = 1,
      injected = false,
      corrective: unknown;
    const diagnostics: FailureDiagnostic[] = [];
    const transports = new Map<number, ReturnType<typeof fixtureTransport>>();
    const transport: typeof fetch = async (...args) => {
      calls++;
      const messages: { content: string }[] = JSON.parse(String(args[1]?.body)).messages;
      const last = JSON.parse(messages.at(-1)!.content);
      if (last.hostFeedback && corrective) {
        const action = corrective;
        corrective = undefined;
        return new Response(
          JSON.stringify({
            choices: [{ finish_reason: "stop", message: { content: JSON.stringify(action) } }],
          }),
        );
      }
      let original = transports.get(version);
      if (!original) {
        original = fixtureTransport({ product: f.product, version, language: plan.language });
        transports.set(version, original);
      }
      const body = await (await original(...args)).json();
      let action = JSON.parse(body.choices[0].message.content);
      if (!injected && version === sample.version) {
        const isCalc = action.name === "calculate_quote";
        if (
          (isCalc && sample.fault !== "knowledge_first") ||
          (action.name === "search_knowledge" && sample.fault === "knowledge_first")
        ) {
          injected = true;
          corrective = structuredClone(action);
          if (sample.fault === "early_complete")
            action = {
              kind: "complete",
              summary: "Synthetic: read complete but no candidate saved",
            };
          if (sample.fault === "quantity_format")
            action.input.proposal.patches[0].quantity = "120,0";
          if (sample.fault === "calculate_first")
            action = { kind: "tool", name: "search_knowledge", input: {} };
          if (sample.fault === "knowledge_first") {
            const result = messages
              .filter((m) => m.content.startsWith('{"toolResult":'))
              .map((m) => JSON.parse(m.content).toolResult)
              .at(-1);
            action = {
              kind: "tool",
              name: "validate_quote",
              input: { candidateId: result.data.data.candidateId },
            };
          }
        }
      }
      body.choices[0].message.content = JSON.stringify(action);
      return new Response(JSON.stringify(body));
    };
    const coordinator = new AgentRunCoordinator(
      f.repo,
      () => new DeepSeekProvider(credentials, transport),
      (d) => {
        diagnostics.push(d);
        if (sample.id === "apparel-de-v2") throw new Error("SYNTHETIC_OBSERVER_FAILURE");
      },
    );
    try {
      let baseId = "";
      const snapshots = new Map<string, string>();
      for (version = 1; version <= sample.version; version++) {
        const command: AgentCommand =
          version === 1
            ? {
                ...envelope(),
                method: "agent.understand",
                payload: {
                  executionMode: "tool_loop",
                  scenarioId: f.scenario.id,
                  buyer: "Synthetic evaluation buyer",
                  inquiry: plan.instructions[0]!,
                },
              }
            : {
                ...envelope(),
                method: "agent.revise",
                payload: {
                  executionMode: "tool_loop",
                  baseId,
                  expectedVersion: version - 1,
                  instruction: plan.instructions[version - 1]!,
                },
              };
        const result = await coordinator.executeLegacy(command, credentials);
        expect(result.ok, `${sample.id}: ${result.ok ? "" : result.error.code}`).toBe(true);
        if (!result.ok) throw new Error("Expected a synthetic committed draft");
        const q = result.data.quotes.find((q) => q.version === version)!;
        const line = q.lines[0];
        const run = f.repo
          .runStore()
          .list({ limit: 100 })
          .runs.find((r) => r.operationKey === command.idempotencyKey)!;
        const t = terms[plan.language];
        expect(run.status).toBe("completed");
        expect(run.attempt).toBe(1);
        expect(result.data.quotes).toHaveLength(version);
        expect(q.status).toBe("draft");
        expect(q.lines).toHaveLength(1);
        expect(line?.product.id).toBe(f.product.id);
        expect(line?.quantity).toBe(version === 1 ? "100" : "120");
        expect(line?.product.unit).toBe(plan.category.unit);
        expect(q.payment).toBe(version === 3 ? t.nextPayment : t.payment);
        expect(q.delivery).toBe(version === 3 ? t.nextDelivery : t.delivery);
        expect(q.goodsTotal).toBe(plan.category.totals[version - 1]);
        expect(line?.product.sourceHash).toBe(f.product.sourceHash);
        expect(line?.product.sourceStatus).toBe("synthetic");
        expect(run.validation?.kind).toBe("saved_revision");
        expect(run.validation?.report.revisionId).toBe(q.id);
        expect(run.validation?.report.ruleRevisionIds).toContain(f.source.revisionId);
        for (const [id, raw] of snapshots)
          expect(JSON.stringify(result.data.quotes.find((q) => q.id === id))).toBe(raw);
        snapshots.set(q.id, JSON.stringify(q));
        baseId = q.id;
      }
      expect(injected).toBe(true);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({ category: sample.category, disposition: "feedback" });
      expect(network).not.toHaveBeenCalled();
      passed = true;
    } finally {
      localEvidence.push({
        id: sample.id,
        status: passed ? "passed" : "failed",
        modelCallsIncludingPrerequisites: calls,
        diagnostics,
      });
      await coordinator.close();
      f.close();
      network.mockRestore();
    }
  },
);

it.each([
  { guard: "wrong_candidate", code: "ACTION_NOT_ALLOWED", category: "business_failure", calls: 4 },
  { guard: "invalid_identity", code: "MODEL_INVALID_OUTPUT", category: "invalid_value", calls: 3 },
  { guard: "zero_quantity", code: "MODEL_INVALID_OUTPUT", category: "invalid_value", calls: 3 },
  { guard: "amount_and_format", code: "MODEL_INVALID_OUTPUT", category: "unknown_field", calls: 3 },
  { guard: "repeated_order", code: "ACTION_NOT_ALLOWED", category: "calculate_first", calls: 4 },
] as const)(
  "C04 diagnostics preserve $guard without leaking input or automatically replaying",
  async (sample) => {
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("EXTERNAL_REQUEST_FORBIDDEN"));
    const f = evaluationWorkspace("DEMO-TEE"),
      diagnostics: FailureDiagnostic[] = [];
    let calls = 0;
    const original = fixtureTransport({ product: f.product, version: 1, language: "en" });
    const transport: typeof fetch = async (...args) => {
      calls++;
      const messages: { content: string }[] = JSON.parse(String(args[1]?.body)).messages;
      const body = await (await original(...args)).json();
      let action = JSON.parse(body.choices[0].message.content);
      if (sample.guard === "wrong_candidate" && action.name === "search_knowledge")
        action = {
          kind: "tool",
          name: "validate_quote",
          input: { candidateId: envelope().requestId },
        };
      if (action.name === "calculate_quote") {
        if (sample.guard === "invalid_identity")
          action.input.proposal.lines[0].productId = "SYNTHETIC_SECRET_ID";
        if (sample.guard === "zero_quantity") action.input.proposal.lines[0].quantity = "0";
        if (sample.guard === "amount_and_format") {
          action.input.proposal.lines[0].quantity = "100,0";
          action.input.proposal.SYNTHETIC_SECRET_FIELD = "SYNTHETIC_SECRET_VALUE";
        }
        if (sample.guard === "repeated_order")
          action = { kind: "tool", name: "search_knowledge", input: {} };
      }
      if (
        sample.guard === "repeated_order" &&
        messages.at(-1)?.content.startsWith('{"hostFeedback":')
      )
        action = { kind: "tool", name: "search_knowledge", input: {} };
      body.choices[0].message.content = JSON.stringify(action);
      return new Response(JSON.stringify(body));
    };
    const coordinator = new AgentRunCoordinator(
      f.repo,
      () => new DeepSeekProvider(credentials, transport),
      (d) => diagnostics.push(d),
    );
    const command: AgentCommand = {
      ...envelope(),
      method: "agent.understand",
      payload: {
        executionMode: "tool_loop",
        scenarioId: f.scenario.id,
        buyer: "Synthetic evaluation buyer",
        inquiry: semanticCases[0]!.instructions[0]!,
      },
    };
    try {
      expect(await coordinator.executeLegacy(command, credentials)).toMatchObject({
        ok: false,
        error: { code: sample.code },
      });
      expect(diagnostics.at(-1)).toMatchObject({
        category: sample.category,
        disposition: "stopped",
      });
      expect(diagnostics).toHaveLength(sample.guard === "repeated_order" ? 2 : 1);
      expect(calls).toBe(sample.calls);
      await coordinator.executeLegacy(command, credentials);
      expect(calls).toBe(sample.calls);
      expect(f.repo.runStore().list().runs[0]?.committedRevisionId).toBeNull();
      expect(JSON.stringify(diagnostics)).not.toContain("SYNTHETIC_SECRET");
      expect(network).not.toHaveBeenCalled();
    } finally {
      await coordinator.close();
      f.close();
      network.mockRestore();
    }
  },
);
