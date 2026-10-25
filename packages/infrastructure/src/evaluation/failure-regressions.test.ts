import { type AgentCommand } from "@tradequote/contracts";
import { afterEach, expect, it, vi } from "vitest";
import { AgentRunCoordinator } from "../agent-run-coordinator";
import { DeepSeekProvider } from "../deepseek";
import { instructions, terms } from "./cases";
import { fixtureTransport } from "./fixture-model";
import { board, envelope, evaluationWorkspace } from "./workspace";

// Reconstructed synthetic failure classes, not a replay of unretained real model payloads.
const cases = [
  {
    id: "apparel-de-v1",
    sku: "DEMO-TEE",
    language: "de",
    version: 1,
    fault: "missing_summary",
    total: "900.00",
  },
  {
    id: "panel-en-v2",
    sku: "DEMO-PANEL",
    language: "en",
    version: 2,
    fault: "numeric_quantity",
    total: "1500.00",
  },
  {
    id: "fastener-zh-v1",
    sku: "DEMO-FASTENER",
    language: "zh",
    version: 1,
    fault: "price_clarification",
    total: null,
  },
  {
    id: "fastener-en-v1",
    sku: "DEMO-FASTENER",
    language: "en",
    version: 1,
    fault: "early_complete",
    total: null,
  },
  {
    id: "fastener-de-v2",
    sku: "DEMO-FASTENER",
    language: "de",
    version: 2,
    fault: "early_complete",
    total: null,
  },
  {
    id: "rule-block",
    sku: "DEMO-TEE",
    language: "en",
    version: 1,
    fault: "blocked_complete",
    total: null,
  },
] as const;
const credentials = { key: "synthetic-c04-regression-key", model: "synthetic-c04-model" };
afterEach(() => vi.restoreAllMocks());

it.each(cases)(
  "C04 reconstructed $id preserves business expectations after bounded model correction",
  async (sample) => {
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("EXTERNAL_REQUEST_FORBIDDEN"));
    const f = evaluationWorkspace(sample.sku);
    let version = 1,
      injected = false,
      correctedAction: unknown;
    const transports = new Map<number, ReturnType<typeof fixtureTransport>>();
    const transport: typeof fetch = async (...args) => {
      const messages: { role: string; content: string }[] = JSON.parse(
        String(args[1]?.body),
      ).messages;
      const lastMessage = JSON.parse(messages.at(-1)!.content);
      if (lastMessage.hostFeedback && correctedAction) {
        const action = correctedAction;
        correctedAction = undefined;
        return new Response(
          JSON.stringify({
            choices: [{ finish_reason: "stop", message: { content: JSON.stringify(action) } }],
          }),
        );
      }
      let original = transports.get(version);
      if (!original) {
        original = fixtureTransport({
          product: f.product,
          version,
          language: sample.language,
          blocked: sample.fault === "blocked_complete",
        });
        transports.set(version, original);
      }
      const response = await original(...args);
      const body = await response.json();
      const action = JSON.parse(body.choices[0].message.content);
      if (version === sample.version && !injected) {
        const lastTool = messages
          .filter((m) => m.content.startsWith('{"toolResult":'))
          .map((m) => JSON.parse(m.content).toolResult)
          .at(-1);
        if (
          (sample.fault === "missing_summary" || sample.fault === "numeric_quantity") &&
          action.name === "calculate_quote"
        ) {
          injected = true;
          correctedAction = structuredClone(action);
          if (sample.fault === "missing_summary") delete action.input.proposal.summary;
          else action.input.proposal.patches[0].quantity = 120;
        } else if (sample.fault === "price_clarification" && action.name === "calculate_quote") {
          injected = true;
          correctedAction = structuredClone(action);
          body.choices[0].message.content = JSON.stringify({
            kind: "clarification",
            question: "Synthetic: unit price is unknown. Please provide it.",
          });
          return new Response(JSON.stringify(body));
        } else if (
          (sample.fault === "early_complete" && lastTool?.name === "calculate_quote") ||
          (sample.fault === "blocked_complete" && lastTool?.name === "validate_quote")
        ) {
          injected = true;
          correctedAction = structuredClone(action);
          body.choices[0].message.content = JSON.stringify({
            kind: "complete",
            summary: "Synthetic candidate is pending or blocked; no draft saved yet.",
          });
          return new Response(JSON.stringify(body));
        }
      }
      body.choices[0].message.content = JSON.stringify(action);
      return new Response(JSON.stringify(body));
    };
    const coordinator = new AgentRunCoordinator(
      f.repo,
      () => new DeepSeekProvider(credentials, transport),
    );
    try {
      let baseId = "";
      let firstSnapshot: string | undefined;
      for (version = 1; version <= sample.version; version++) {
        const command: AgentCommand =
          version === 1
            ? {
                ...envelope(),
                method: "agent.understand",
                payload: {
                  executionMode: "tool_loop",
                  scenarioId: f.scenario.id,
                  buyer: "Synthetic regression buyer",
                  inquiry:
                    sample.fault === "blocked_complete"
                      ? `Synthetic: 100 ${f.product.unit} ${f.product.sku}; payment unspecified, delivery 30 days. Do not invent payment.`
                      : instructions(f.product.sku, f.product.unit, sample.language)[0]!,
                },
              }
            : {
                ...envelope(),
                method: "agent.revise",
                payload: {
                  executionMode: "tool_loop",
                  baseId,
                  expectedVersion: 1,
                  instruction: instructions(f.product.sku, f.product.unit, sample.language)[1]!,
                },
              };
        const result = await coordinator.executeLegacy(command, credentials);
        const runs = f.repo.runStore().list({ limit: 100 }).runs;
        const run = runs.find((r) => r.operationKey === command.idempotencyKey)!;
        if (sample.fault === "blocked_complete") {
          expect(result).toMatchObject({ ok: false, error: { code: "RULE_BLOCKED" } });
          expect(
            board(
              f.repo.executeTrade(
                { schemaVersion: 1, requestId: envelope().requestId, method: "trade.get" },
                { actorId: "synthetic-reviewer", origin: "human_ui" },
              ),
            ).quotes,
          ).toHaveLength(0);
          expect(run.validation?.kind).toBe("calculation_preview");
          expect(run.validation?.report.issues.some((i) => i.severity === "block")).toBe(true);
        } else {
          expect(result.ok, `${sample.id}: ${result.ok ? "" : result.error.code}`).toBe(true);
          if (!result.ok) throw new Error("Expected a committed synthetic draft");
          const quote = result.data.quotes.find((q) => q.version === version)!;
          expect(result.data.quotes).toHaveLength(version);
          expect(run).toMatchObject({
            status: "completed",
            attempt: 1,
            committedRevisionId: quote.id,
          });
          expect(quote.status).toBe("draft");
          expect(quote.lines).toHaveLength(1);
          expect(quote.lines[0]?.product).toMatchObject({
            id: f.product.id,
            unit: f.product.unit,
            sourceHash: f.product.sourceHash,
            sourceStatus: "synthetic",
          });
          expect(quote.lines[0]?.quantity).toBe(version === 1 ? "100" : "120");
          expect(quote.payment).toBe(terms[sample.language].payment);
          expect(quote.delivery).toBe(terms[sample.language].delivery);
          expect(run.validation?.kind).toBe("saved_revision");
          expect(run.validation?.report.revisionId).toBe(quote.id);
          expect(run.validation?.report.ruleRevisionIds).toContain(f.source.revisionId);
          expect(quote.goodsTotal).toBe(
            version === sample.version
              ? sample.total
              : sample.sku === "DEMO-PANEL"
                ? "1250.00"
                : null,
          );
          if (firstSnapshot)
            expect(JSON.stringify(result.data.quotes.find((q) => q.id === baseId))).toBe(
              firstSnapshot,
            );
          baseId = quote.id;
          firstSnapshot = JSON.stringify(quote);
        }
      }
      expect(injected).toBe(true);
      expect(network).not.toHaveBeenCalled();
    } finally {
      await coordinator.close();
      f.close();
    }
  },
);

it.each([
  { guard: "repeated_invalid", code: "MODEL_INVALID_OUTPUT", calls: 4 },
  { guard: "extra_price", code: "MODEL_INVALID_OUTPUT", calls: 3 },
  { guard: "correction_network", code: "CAPABILITY_UNAVAILABLE", calls: 4 },
  { guard: "correction_auth", code: "MODEL_AUTH_FAILED", calls: 4 },
  { guard: "correction_cancel", code: "CANCELLED", calls: 4 },
  { guard: "request_budget", code: "ACTION_NOT_ALLOWED", calls: 12 },
  { guard: "genuine_clarification", code: "MISSING_FACTS", calls: 4 },
  { guard: "repeated_complete", code: "ACTION_NOT_ALLOWED", calls: 5 },
] as const)(
  "C04 correction preserves $guard and never saves or automatically retries",
  async (sample) => {
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("EXTERNAL_REQUEST_FORBIDDEN"));
    const f = evaluationWorkspace("DEMO-FASTENER");
    let calls = 0;
    const original = fixtureTransport({ product: f.product, version: 1, language: "en" });
    const transport: typeof fetch = async (...args) => {
      calls++;
      const messages: { content: string }[] = JSON.parse(String(args[1]?.body)).messages;
      const feedback = messages.some((m) => m.content.startsWith('{"hostFeedback":'));
      if (feedback && sample.guard === "correction_network")
        throw new Error("synthetic confidential network stack");
      if (feedback && sample.guard === "correction_auth")
        return new Response("synthetic confidential auth response", { status: 401 });
      if (feedback && sample.guard === "correction_cancel") {
        const run = f.repo.runStore().list().runs[0]!;
        coordinator.execute({
          ...envelope(),
          method: "agent.cancel",
          payload: { runId: run.runId },
        });
      }
      const response = await original(...args);
      const body = await response.json();
      let action = JSON.parse(body.choices[0].message.content);
      if (feedback && sample.guard === "request_budget") {
        action = { kind: "tool", name: "search_catalog", input: { query: f.product.sku } };
      } else if (sample.guard === "repeated_complete") {
        const lastTool = messages.filter((m) => m.content.startsWith('{"toolResult":')).at(-1);
        if (lastTool && JSON.parse(lastTool.content).toolResult.name === "calculate_quote")
          action = { kind: "complete", summary: "Synthetic premature completion" };
      } else if (action.name === "calculate_quote") {
        if (sample.guard === "genuine_clarification")
          action = {
            kind: "clarification",
            question: "Synthetic actual buyer quantity needs confirmation",
          };
        else if (sample.guard === "extra_price") action.input.proposal.goodsTotal = "0.00";
        else delete action.input.proposal.summary;
      }
      body.choices[0].message.content = JSON.stringify(action);
      return new Response(JSON.stringify(body));
    };
    const coordinator = new AgentRunCoordinator(
      f.repo,
      () => new DeepSeekProvider(credentials, transport),
    );
    const command: AgentCommand = {
      ...envelope(),
      method: "agent.understand",
      payload: {
        executionMode: "tool_loop",
        scenarioId: f.scenario.id,
        buyer: "Synthetic regression buyer",
        inquiry: instructions(f.product.sku, f.product.unit, "en")[0]!,
      },
    };
    try {
      const result = await coordinator.executeLegacy(command, credentials);
      expect(result).toMatchObject({ ok: false, error: { code: sample.code } });
      expect(calls).toBe(sample.calls);
      expect(JSON.stringify(result)).not.toContain("confidential");
      const run = f.repo.runStore().list().runs[0]!;
      expect(run.attempt).toBe(1);
      if (sample.guard === "genuine_clarification") expect(run.status).toBe("waiting_input");
      await coordinator.executeLegacy(command, credentials);
      expect(calls).toBe(sample.calls);
      await coordinator.close();
      expect(
        board(
          f.repo.executeTrade(
            { schemaVersion: 1, requestId: envelope().requestId, method: "trade.get" },
            { actorId: "synthetic-reviewer", origin: "human_ui" },
          ),
        ).quotes,
      ).toHaveLength(0);
      expect(network).not.toHaveBeenCalled();
    } finally {
      await coordinator.close();
      f.close();
    }
  },
);
