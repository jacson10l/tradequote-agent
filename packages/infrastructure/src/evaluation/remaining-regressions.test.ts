import { mkdirSync, writeFileSync } from "node:fs";
import { type AgentCommand, type FailureDiagnostic } from "@tradequote/contracts";
import { afterAll, expect, it, vi } from "vitest";
import { AgentRunCoordinator } from "../agent-run-coordinator";
import { DeepSeekProvider } from "../deepseek";
import { ToolLoopRuntime } from "../read-tool-runtime";
import { semanticCases, terms } from "./cases";
import * as fixtureModule from "./fixture-model";
import { markdownReport } from "./report";
import { evaluateC04 } from "./runner";
import { envelope, evaluationWorkspace } from "./workspace";

// Synthetic boundary reconstructions only. No real model payloads were retained.
const credentials = { key: "synthetic-remaining-key", model: "synthetic-model" };
const evidence: { id: string; passed: boolean; diagnostics: FailureDiagnostic[] }[] = [];
afterAll(() => {
  mkdirSync(".runtime", { recursive: true });
  writeFileSync(
    ".runtime/c04-three-reconstructed.json",
    `${JSON.stringify(
      {
        scope: "synthetic_boundary_reconstructions_not_real_payload_replay",
        providerValidation: "fixture_only",
        realRequests: 0,
        cases: evidence,
      },
      null,
      2,
    )}\n`,
  );
});

it("apparel-zh-v1: terms drift still fails the original checks but exposes only field classifications", async () => {
  const network = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("EXTERNAL_REQUEST_FORBIDDEN"));
  const original = fixtureModule.fixtureTransport;
  const changed = vi.spyOn(fixtureModule, "fixtureTransport").mockImplementation((options) => {
    const transport = original(options);
    if (
      options.product.sku !== "DEMO-TEE" ||
      options.version !== 1 ||
      options.language !== "zh" ||
      options.failure ||
      options.clarification ||
      options.blocked
    )
      return transport;
    return async (...args) => {
      const body = await (await transport(...args)).json();
      const action = JSON.parse(body.choices[0].message.content);
      if (action.name === "calculate_quote") {
        action.input.proposal.payment = "SYNTHETIC_PRIVATE_PAYMENT";
        action.input.proposal.delivery = "SYNTHETIC_PRIVATE_DELIVERY";
        body.choices[0].message.content = JSON.stringify(action);
      }
      return new Response(JSON.stringify(body));
    };
  });
  let passed = false;
  let diagnostics: FailureDiagnostic[] = [];
  try {
    const r = await evaluateC04({ mode: "fixture" });
    const row = r.rows.find((v) => v.id === "apparel-zh-v1")!;
    diagnostics = row.diagnostics ?? [];
    expect(row).toMatchObject({ status: "failed", errorCode: null });
    expect(row.checks.filter((v) => !v.passed).map((v) => v.id)).toEqual(["terms"]);
    expect(r.rows.find((v) => v.id === "apparel-zh-v2")).toMatchObject({
      status: "not_run",
      reason: "prior_step_failed",
      modelCalls: 0,
    });
    expect(diagnostics).toEqual([
      {
        stage: "evaluation_check",
        tool: null,
        category: "payment_mismatch",
        disposition: "stopped",
        modelCall: 6,
        errorCode: "VALIDATION_ERROR",
      },
      {
        stage: "evaluation_check",
        tool: null,
        category: "delivery_mismatch",
        disposition: "stopped",
        modelCall: 6,
        errorCode: "VALIDATION_ERROR",
      },
    ]);
    expect(JSON.stringify(r) + markdownReport(r)).not.toContain("SYNTHETIC_PRIVATE");
    expect(r.realRequests).toBe(0);
    expect(network).not.toHaveBeenCalled();
    passed = true;
  } finally {
    evidence.push({ id: "apparel-zh-v1", passed, diagnostics });
    changed.mockRestore();
    network.mockRestore();
  }
}, 20000);

it.each([
  {
    id: "panel-de-v2-empty-response",
    response: () => new Response(null),
    category: "empty_response",
  },
  {
    id: "panel-de-v2-encoding",
    response: () => new Response(new Uint8Array([255])),
    category: "response_encoding",
  },
  {
    id: "panel-de-v2-shape",
    response: () => new Response(JSON.stringify({ choices: [] })),
    category: "response_envelope",
  },
  {
    id: "panel-de-v2-empty-content",
    response: () =>
      new Response(
        JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: " " } }] }),
      ),
    category: "empty_content",
  },

  {
    id: "panel-de-v2-content",
    response: () =>
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: "stop", message: { content: "SYNTHETIC_PRIVATE_CONTENT" } }],
        }),
      ),
    category: "content_json",
  },
  {
    id: "panel-de-v2-truncated",
    response: () =>
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: "length", message: { content: "SYNTHETIC_PRIVATE_CONTENT" } }],
        }),
      ),
    category: "response_truncated",
  },
  {
    id: "panel-de-v2-envelope",
    response: () => new Response("SYNTHETIC_PRIVATE_ENVELOPE"),
    category: "response_json",
  },
])("$id: enum provider cause, original public code and first-fault stop", async (sample) => {
  const network = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("EXTERNAL_REQUEST_FORBIDDEN"));
  const transport = vi.fn<typeof fetch>().mockImplementation(async () => sample.response());
  const diagnostics: FailureDiagnostic[] = [];
  let passed = false;
  try {
    const runtime = new ToolLoopRuntime(
      new DeepSeekProvider(credentials, transport),
      [],
      {},
      undefined,
      "read",
      undefined,
      (d) => diagnostics.push(d),
    );
    await expect(runtime.run("Synthetic JSON boundary probe")).rejects.toMatchObject({
      code: "MODEL_INVALID_OUTPUT",
    });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(diagnostics).toEqual([
      {
        stage: "provider",
        tool: null,
        category: sample.category,
        disposition: "stopped",
        modelCall: 1,
        errorCode: "MODEL_INVALID_OUTPUT",
      },
    ]);
    expect(JSON.stringify(diagnostics)).not.toContain("SYNTHETIC_PRIVATE");
    expect(network).not.toHaveBeenCalled();
    passed = true;
  } finally {
    evidence.push({ id: sample.id, passed, diagnostics });
    network.mockRestore();
  }
});

it("provider cleanup cannot replace the first output fault", async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(131073));
        },
        cancel() {
          throw new Error("SYNTHETIC_PRIVATE_CLEANUP");
        },
      }),
    ),
  );
  await expect(
    new DeepSeekProvider(credentials, transport).json([
      { role: "user", content: "Synthetic JSON probe" },
    ]),
  ).rejects.toMatchObject({ code: "MODEL_INVALID_OUTPUT", category: "response_oversized" });
  expect(transport).toHaveBeenCalledTimes(1);
});

it("fastener-de-v1: one clarification feedback then host-stage tool menu completes without expanding correction budget", async () => {
  const network = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("EXTERNAL_REQUEST_FORBIDDEN"));
  const plan = semanticCases.find((v) => v.id === "fastener-de")!;
  const f = evaluationWorkspace(plan.category.sku);
  const diagnostics: FailureDiagnostic[] = [];
  let calls = 0,
    version = 1,
    injected = false,
    passed = false;
  const original = fixtureModule.fixtureTransport;
  const transport: typeof fetch = async (...args) => {
    calls++;
    const messages: { role: string; content: string }[] = JSON.parse(
      String(args[1]?.body),
    ).messages;
    const body = await (
      await original({ product: f.product, version, language: "de" })(...args)
    ).json();
    let action = JSON.parse(body.choices[0].message.content);
    if (version === 1 && action.name === "calculate_quote" && !injected) {
      injected = true;
      action = { kind: "clarification", question: "Synthetic unknown price question" };
    } else if (version === 1 && JSON.parse(messages.at(-1)!.content).hostFeedback) {
      // A model choosing a currently advertised knowledge tool reproduces the observed second fault.
      const menu = JSON.parse(messages[0]!.content.split("工具清单：")[1]!);
      if (menu.some((tool: { name: string }) => tool.name === "search_knowledge"))
        action = { kind: "tool", name: "search_knowledge", input: {} };
    }
    body.choices[0].message.content = JSON.stringify(action);
    return new Response(JSON.stringify(body));
  };
  const coordinator = new AgentRunCoordinator(
    f.repo,
    () => new DeepSeekProvider(credentials, transport),
    (d) => diagnostics.push(d),
  );
  try {
    let baseId = "";
    const snapshots = new Map<string, string>();
    for (version = 1; version <= 3; version++) {
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
      expect(result.ok, result.ok ? "" : result.error.code).toBe(true);
      if (!result.ok) throw Error("Synthetic draft expected");
      const q = result.data.quotes.find((v) => v.version === version)!;
      const run = f.repo
        .runStore()
        .list()
        .runs.find((v) => v.operationKey === command.idempotencyKey)!;
      expect(run).toMatchObject({ status: "completed", attempt: 1 });
      expect(result.data.quotes).toHaveLength(version);
      expect(q).toMatchObject({
        status: "draft",
        goodsTotal: null,
        payment: version === 3 ? terms.de.nextPayment : terms.de.payment,
        delivery: version === 3 ? terms.de.nextDelivery : terms.de.delivery,
      });
      expect(q.lines).toHaveLength(1);
      expect(q.lines[0]).toMatchObject({
        quantity: version === 1 ? "100" : "120",
        unitPrice: null,
        product: {
          id: f.product.id,
          unit: "kg",
          sourceHash: f.product.sourceHash,
          sourceStatus: "synthetic",
        },
      });
      expect(run.validation).toMatchObject({
        kind: "saved_revision",
        report: { revisionId: q.id },
      });
      for (const [id, raw] of snapshots)
        expect(JSON.stringify(result.data.quotes.find((v) => v.id === id))).toBe(raw);
      snapshots.set(q.id, JSON.stringify(q));
      baseId = q.id;
      const before = calls;
      await coordinator.executeLegacy(command, credentials);
      expect(calls).toBe(before);
    }
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ category: "missing_facts", disposition: "feedback" });
    expect(network).not.toHaveBeenCalled();
    passed = true;
  } finally {
    evidence.push({ id: "fastener-de-v1", passed, diagnostics });
    await coordinator.close();
    f.close();
    network.mockRestore();
  }
});

it("ignoring the stage menu after clarification still stops at the shared one-correction boundary", async () => {
  const f = evaluationWorkspace("DEMO-FASTENER");
  const plan = semanticCases.find((v) => v.id === "fastener-de")!;
  const diagnostics: FailureDiagnostic[] = [];
  let calls = 0;
  const original = fixtureModule.fixtureTransport({
    product: f.product,
    version: 1,
    language: "de",
  });
  const transport: typeof fetch = async (...args) => {
    calls++;
    const body = await (await original(...args)).json();
    if (calls === 3)
      body.choices[0].message.content = JSON.stringify({
        kind: "clarification",
        question: "Synthetic unknown price",
      });
    if (calls === 4)
      body.choices[0].message.content = JSON.stringify({
        kind: "tool",
        name: "search_knowledge",
        input: {},
      });
    return new Response(JSON.stringify(body));
  };
  const coordinator = new AgentRunCoordinator(
    f.repo,
    () => new DeepSeekProvider(credentials, transport),
    (d) => diagnostics.push(d),
  );
  try {
    const command: AgentCommand = {
      ...envelope(),
      method: "agent.understand",
      payload: {
        executionMode: "tool_loop",
        scenarioId: f.scenario.id,
        buyer: "Synthetic buyer",
        inquiry: plan.instructions[0]!,
      },
    };
    expect(await coordinator.executeLegacy(command, credentials)).toMatchObject({
      ok: false,
      error: { code: "ACTION_NOT_ALLOWED" },
    });
    expect(diagnostics.map(({ category, disposition }) => ({ category, disposition }))).toEqual([
      { category: "missing_facts", disposition: "feedback" },
      { category: "calculate_first", disposition: "stopped" },
    ]);
    expect(calls).toBe(4);
    expect(f.repo.runStore().list().runs[0]?.committedRevisionId).toBeNull();
    await coordinator.executeLegacy(command, credentials);
    expect(calls).toBe(4);
  } finally {
    await coordinator.close();
    f.close();
  }
});
