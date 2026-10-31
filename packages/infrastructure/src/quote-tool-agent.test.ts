import { randomUUID } from "node:crypto";
import {
  type AgentCommand,
  type KnowledgeDraftInput,
  RunResultSchema,
} from "@tradequote/contracts";
import { afterEach, expect, it, vi } from "vitest";
import { AgentRunCoordinator } from "./agent-run-coordinator";
import { type ModelMessage } from "./deepseek";
import { common, data, runFixture } from "./testing/run-fixture";

const cleanups: (() => void)[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});
const credentials = { key: "synthetic-multistep-key", model: "synthetic-model" };
const actor = { actorId: "synthetic-human", origin: "human_ui" as const };
function published(f: ReturnType<typeof runFixture>, change: Partial<KnowledgeDraftInput> = {}) {
  const text = "合成测试：付款须非空，交期不得宣称全部合规。不是实际平台政策。";
  const content: KnowledgeDraftInput = {
    documentId: randomUUID(),
    expectedVersion: 0,
    title: "合成规则",
    scope: {
      platforms: [f.scenario.platform],
      markets: [f.scenario.market],
      categories: [f.product.category],
    },
    sourceStatus: "synthetic",
    sourceLabel: "合成规则原文",
    sourceText: text,
    location: { kind: "text", start: 0, end: text.length },
    rules: [
      {
        ruleId: randomUUID(),
        category: "commercial_terms",
        title: "付款",
        message: "付款需补充",
        suggestedAction: "按实际需求补充付款",
        field: "payment",
        condition: { kind: "required" },
        failureSeverity: "block",
      },
      {
        ruleId: randomUUID(),
        category: "platform_guidance",
        title: "交期",
        message: "不可宣称全部合规",
        suggestedAction: "删除该承诺",
        field: "delivery",
        condition: { kind: "forbidden_literal", literal: "全部合规" },
        failureSeverity: "warning",
      },
    ],
    ...change,
  };
  const staged = f.repo.executeKnowledge(
    { ...common(), method: "knowledge.stage", payload: content },
    actor,
  );
  if (!staged.ok || staged.data.kind !== "revision") throw new Error("synthetic stage");
  const revision = staged.data.revision;
  const result = f.repo.executeKnowledge(
    {
      ...common(),
      method: "knowledge.publish",
      payload: { revisionId: revision.revisionId, sourceHash: revision.sourceHash },
    },
    actor,
  );
  if (!result.ok || result.data.kind !== "revision") throw new Error("synthetic publish");
  return result.data.revision;
}
function start(f: ReturnType<typeof runFixture>) {
  const input = f.start();
  return {
    ...input,
    payload: {
      ...input.payload,
      payload: {
        ...input.payload.payload,
        executionMode: "tool_loop" as const,
        inquiry: "100单位合成商品，付款T/T，30天交货",
      },
    },
  };
}
function observations(messages: ModelMessage[]) {
  return messages
    .filter((m) => m.role === "user" && m.content.startsWith('{"toolResult":'))
    .map((m) => {
      const value = JSON.parse(m.content).toolResult;
      return { name: value.name, result: value.data };
    });
}
function script(f: ReturnType<typeof runFixture>, proposal?: unknown) {
  return (messages: ModelMessage[]) => {
    const context = JSON.parse(
      messages.find((m) => m.content.startsWith('{"hostContext":'))!.content,
    ).hostContext;
    const seen = observations(messages),
      last = seen.at(-1);
    const tool = (name: string, input: unknown) => ({ kind: "tool", name, input });
    if (!last)
      return tool(
        context.mode === "revise" ? "get_quote" : "search_catalog",
        context.mode === "revise"
          ? { revisionId: context.operation.payload.baseId }
          : { query: f.product.sku },
      );
    if (last.name === "search_catalog")
      return tool("get_product_revisions", { productIds: [f.product.id] });
    if (last.name === "get_product_revisions" || last.name === "get_quote")
      return tool("calculate_quote", {
        proposal: proposal ?? { ...f.proposal, payment: "T/T", delivery: "30天" },
      });
    if (last.name === "calculate_quote") return tool("search_knowledge", {});
    const calculation = seen.filter((o) => o.name === "calculate_quote").at(-1);
    if (!calculation) throw new Error("synthetic calculation missing");
    if (last.name === "search_knowledge")
      return tool("validate_quote", { candidateId: calculation.result.data.candidateId });
    if (last.name === "validate_quote")
      return tool(context.mode === "revise" ? "apply_patch" : "create_draft", {
        candidateId: calculation.result.data.candidateId,
        validationId: last.result.data.validationId,
      });
    throw new Error("model called after terminal write");
  };
}
async function finish(coordinator: AgentRunCoordinator, runId: string) {
  for (let i = 0; i < 100; i++) {
    const result = RunResultSchema.parse(
      coordinator.execute({
        schemaVersion: 1,
        requestId: randomUUID(),
        method: "agent.get",
        payload: { runId },
      }),
    );
    if (!result.ok) throw new Error(result.error.message);
    if (!["queued", "running"].includes(result.data.status)) return result.data;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error("synthetic completion barrier");
}
for (const [category, sku, total, next] of [
  ["服装", "DEMO-TEE", "900.00", "1080.00"],
  ["板材", "DEMO-PANEL", "1250.00", "1500.00"],
  ["紧固件", "DEMO-FASTENER", null, null],
] as const)
  it(`full loop uses real A knowledge and deterministic B00 checks for ${category}, V1/V2/V3 remain immutable`, async () => {
    const f = runFixture(cleanups, { category, sku });
    const source = published(f);
    let proposal: unknown;
    const json = vi.fn(async (messages: ModelMessage[]) => script(f, proposal)(messages));
    const coordinator = new AgentRunCoordinator(f.repo, () => ({ json }));
    const command = start(f);
    const first = await coordinator.executeLegacy({ ...command, ...command.payload }, credentials);
    expect(first.ok, JSON.stringify({ result: first, run: f.store.list().runs[0] })).toBe(true);
    if (!first.ok) throw new Error(first.error.message);
    const v1 = first.data.quotes[0]!;
    expect(v1.goodsTotal).toBe(total);
    expect(f.store.list().runs[0]?.calculationPreview?.goodsTotal).toBe(total);
    const rows = f.store.list().runs;
    const run = rows[0]!;
    expect(run.toolSteps?.map((step) => step.tool)).toEqual([
      "search_catalog",
      "get_product_revisions",
      "calculate_quote",
      "search_knowledge",
      "validate_quote",
      "create_draft",
    ]);
    expect(run.validation).toMatchObject({
      kind: "saved_revision",
      report: { revisionId: v1.id, ruleRevisionIds: [source.revisionId] },
    });
    expect(json).toHaveBeenCalledTimes(6);
    proposal = {
      patches: [{ op: "setQuantity", productId: f.product.id, quantity: "120" }],
      summary: "120单位",
    };
    const revise: AgentCommand = {
      ...common(),
      method: "agent.revise",
      payload: {
        executionMode: "tool_loop",
        baseId: v1.id,
        expectedVersion: 1,
        instruction: "改120单位",
      },
    };
    const second = await coordinator.executeLegacy(revise, credentials);
    if (!second.ok) throw new Error(second.error.message);
    const v2 = second.data.quotes[0]!;
    expect(v2.goodsTotal).toBe(next);
    proposal = { patches: [{ op: "setPayment", value: "T/T发货前付" }], summary: "实际付款要求" };
    const third = await coordinator.executeLegacy(
      {
        ...common(),
        method: "agent.revise",
        payload: {
          executionMode: "tool_loop",
          baseId: v2.id,
          expectedVersion: 2,
          instruction: "T/T发货前付",
        },
      },
      credentials,
    );
    if (!third.ok) throw new Error(third.error.message);
    expect(third.data.quotes.find((q) => q.id === v1.id)).toEqual(v1);
    expect(third.data.quotes.find((q) => q.id === v2.id)).toEqual(v2);
    expect(third.data.quotes[0]?.goodsTotal).toBe(next);
    expect(f.db.prepare("SELECT status FROM agent_write_call").all()).toEqual(
      Array.from({ length: 3 }, () => ({ status: "committed" })),
    );
    const calls = json.mock.calls.length;
    expect(await coordinator.executeLegacy(revise, credentials)).toEqual(second);
    expect(json).toHaveBeenCalledTimes(calls);
    await coordinator.close();
    f.reopen();
    expect(f.store.get(run.runId).validation).toEqual(run.validation);
    expect(
      data(
        f.repo.executeTrade(
          { schemaVersion: 1, requestId: randomUUID(), method: "trade.get" },
          actor,
        ),
      ).quotes,
    ).toHaveLength(3);
    expect(JSON.stringify(f.db.prepare("SELECT * FROM agent_run").all())).not.toContain(
      credentials.key,
    );
  });
it("missing rule coverage remains pending on a saved draft and never claims all checks passed", async () => {
  const f = runFixture(cleanups),
    json = vi.fn(async (messages: ModelMessage[]) => script(f)(messages)),
    coordinator = new AgentRunCoordinator(f.repo, () => ({ json }));
  const input = start(f);
  const result = await coordinator.executeLegacy({ ...input, ...input.payload }, credentials);
  expect(result.ok).toBe(true);
  const run = f.store.list().runs[0]!;
  expect(run.validation?.report.coverage.every((item) => item.status === "pending")).toBe(true);
  expect(run.validation?.report.issues).toHaveLength(2);
  await coordinator.close();
});
it("blocking rules reject the actual write and retain the exact preview report without a quote", async () => {
  const f = runFixture(cleanups);
  published(f);
  const json = vi.fn(async (messages: ModelMessage[]) => script(f, f.proposal)(messages)),
    coordinator = new AgentRunCoordinator(f.repo, () => ({ json }));
  const input = start(f);
  const result = await coordinator.executeLegacy({ ...input, ...input.payload }, credentials);
  expect(result).toMatchObject({ ok: false, error: { code: "RULE_BLOCKED" } });
  const run = f.store.list().runs[0]!;
  expect(run.validation?.kind).toBe("calculation_preview");
  expect(run.validation?.report.issues[0]?.severity).toBe("block");
  expect(f.counts().quote_v1).toBe(0);
  expect(f.db.prepare("SELECT * FROM agent_write_call").all()).toHaveLength(0);
  expect(run.toolSteps?.at(-1)).toMatchObject({
    tool: "create_draft",
    ok: false,
    errorCode: "RULE_BLOCKED",
  });
  await coordinator.close();
});
it("freshly published rules between validation and write invalidate the authorization in the transaction", async () => {
  const f = runFixture(cleanups);
  const previous = published(f);
  let changed = false;
  const json = vi.fn(async (messages: ModelMessage[]) => {
    if (observations(messages).at(-1)?.name === "validate_quote" && !changed) {
      changed = true;
      published(f, { documentId: previous.documentId, expectedVersion: 1 });
    }
    return script(f)(messages);
  });
  const coordinator = new AgentRunCoordinator(f.repo, () => ({ json }));
  const input = start(f);
  expect(
    await coordinator.executeLegacy({ ...input, ...input.payload }, credentials),
  ).toMatchObject({ ok: false, error: { code: "SOURCE_CONFLICT" } });
  expect(f.counts().quote_v1).toBe(0);
  expect(f.db.prepare("SELECT status FROM agent_write_call").all()).toEqual([
    { status: "abandoned" },
  ]);
  await coordinator.close();
});
it("failure inserting the committed write step rolls back quote, receipt, turn and run together", async () => {
  const f = runFixture(cleanups);
  published(f);
  f.db.exec(
    "CREATE TRIGGER fail_final_step AFTER INSERT ON agent_tool_step WHEN json_extract(NEW.data_json,'$.tool')='create_draft' AND json_extract(NEW.data_json,'$.ok')=1 BEGIN SELECT RAISE(ABORT,'synthetic-private'); END",
  );
  const json = vi.fn(async (messages: ModelMessage[]) => script(f)(messages)),
    coordinator = new AgentRunCoordinator(f.repo, () => ({ json })),
    input = start(f);
  expect(
    await coordinator.executeLegacy({ ...input, ...input.payload }, credentials),
  ).toMatchObject({ ok: false, error: { code: "STORAGE_ERROR" } });
  expect(f.counts().quote_v1).toBe(0);
  expect(f.counts().agent_turn).toBe(0);
  expect(f.repo.agentReplay({ ...input, ...input.payload })).toBeNull();
  expect(f.db.prepare("SELECT status FROM agent_write_call").all()).toEqual([
    { status: "abandoned" },
  ]);
  expect(f.store.list().runs[0]?.toolSteps?.at(-1)).toMatchObject({
    tool: "create_draft",
    ok: false,
  });
  await coordinator.close();
});
it.each(["approve_quote", "publish_knowledge", "create_draft"])(
  "never grants an unknown or unvalidated %s action",
  async (name) => {
    const f = runFixture(cleanups),
      json = vi.fn(async () => ({
        kind: "tool",
        name,
        input:
          name === "create_draft" ? { candidateId: randomUUID(), validationId: randomUUID() } : {},
      })),
      coordinator = new AgentRunCoordinator(f.repo, () => ({ json })),
      input = start(f);
    expect(
      await coordinator.executeLegacy({ ...input, ...input.payload }, credentials),
    ).toMatchObject({ ok: false, error: { code: "ACTION_NOT_ALLOWED" } });
    expect(json).toHaveBeenCalledTimes(1);
    expect(f.counts().quote_v1).toBe(0);
    await coordinator.close();
  },
);
it("tool budget stops before a thirteenth model request, and complete cannot fake a saved result", async () => {
  const f = runFixture(cleanups),
    json = vi.fn(async () => ({ kind: "tool", name: "search_catalog", input: {} })),
    coordinator = new AgentRunCoordinator(f.repo, () => ({ json })),
    input = start(f);
  expect(
    await coordinator.executeLegacy({ ...input, ...input.payload }, credentials),
  ).toMatchObject({ ok: false, error: { code: "ACTION_NOT_ALLOWED" } });
  expect(json).toHaveBeenCalledTimes(12);
  expect(f.store.list().runs[0]?.toolSteps).toHaveLength(12);
  await coordinator.close();
  const fake = new AgentRunCoordinator(f.repo, () => ({
      json: async () => ({ kind: "complete", summary: "已审批并保存" }),
    })),
    other = start(f);
  expect(await fake.executeLegacy({ ...other, ...other.payload }, credentials)).toMatchObject({
    ok: false,
    error: { code: "ACTION_NOT_ALLOWED" },
  });
  expect(f.counts().quote_v1).toBe(0);
  await fake.close();
});
it("cancellation between tools prevents all later model/write steps; explicit retry starts a fresh attempt", async () => {
  const f = runFixture(cleanups);
  published(f);
  let release: (value: unknown) => void = () => {};
  const json = vi.fn((messages: ModelMessage[]) =>
    json.mock.calls.length === 1
      ? new Promise<unknown>((resolve) => {
          release = resolve;
        })
      : Promise.resolve(script(f)(messages)),
  );
  const coordinator = new AgentRunCoordinator(f.repo, () => ({ json })),
    input = start(f);
  const initial = RunResultSchema.parse(coordinator.execute(input, credentials));
  if (!initial.ok) throw new Error("synthetic start");
  await Promise.resolve();
  const cancel = f.control(initial.data.runId, "agent.cancel");
  expect(coordinator.execute(cancel)).toMatchObject({ ok: true, data: { status: "cancelled" } });
  release({ kind: "tool", name: "search_catalog", input: {} });
  expect((await finish(coordinator, initial.data.runId)).status).toBe("cancelled");
  expect(f.counts().quote_v1).toBe(0);
  const retry = f.control(initial.data.runId, "agent.retry");
  coordinator.execute(retry, credentials);
  coordinator.execute(retry, credentials);
  const done = await finish(coordinator, initial.data.runId);
  expect(done.status).toBe("completed");
  expect(done.attempt).toBe(2);
  expect(done.toolSteps?.every((step) => step.attempt === 2)).toBe(true);
  expect(json).toHaveBeenCalledTimes(7);
  await coordinator.close();
});

it("rejects model-supplied prices before any draft calculation or write", async () => {
  const f = runFixture(cleanups),
    json = vi.fn(async (messages: ModelMessage[]) => {
      const action = script(f)(messages);
      if (action.name === "calculate_quote")
        return { ...action, input: { proposal: { ...f.proposal, goodsTotal: "0" } } };
      return action;
    }),
    coordinator = new AgentRunCoordinator(f.repo, () => ({ json })),
    input = start(f);
  expect(
    await coordinator.executeLegacy({ ...input, ...input.payload }, credentials),
  ).toMatchObject({ ok: false, error: { code: "MODEL_INVALID_OUTPUT" } });
  expect(f.counts().quote_v1).toBe(0);
  expect(json).toHaveBeenCalledTimes(3);
  await coordinator.close();
});
it("a new calculation invalidates the previous validation identity even for the same product", async () => {
  const f = runFixture(cleanups);
  published(f);
  let old: { candidateId: string; validationId: string } | undefined;
  const json = vi.fn(async (messages: ModelMessage[]) => {
    const last = observations(messages).at(-1);
    if (last?.name === "validate_quote" && !old) {
      old = {
        candidateId: last.result.data.candidateId,
        validationId: last.result.data.validationId,
      };
      return {
        kind: "tool",
        name: "calculate_quote",
        input: { proposal: { ...f.proposal, payment: "T/T", delivery: "30天" } },
      };
    }
    if (last?.name === "calculate_quote" && old)
      return { kind: "tool", name: "create_draft", input: old };
    return script(f)(messages);
  });
  const coordinator = new AgentRunCoordinator(f.repo, () => ({ json })),
    input = start(f);
  expect(
    await coordinator.executeLegacy({ ...input, ...input.payload }, credentials),
  ).toMatchObject({ ok: false, error: { code: "ACTION_NOT_ALLOWED" } });
  expect(f.counts().quote_v1).toBe(0);
  await coordinator.close();
});
it("rechecks the latest quote baseline after model latency instead of appending an extra revision", async () => {
  const f = runFixture(cleanups);
  published(f);
  const firstInput = f.start();
  const first = f.repo.commitAgent(
    { ...firstInput, ...firstInput.payload },
    { ...f.proposal, payment: "T/T" },
    "synthetic",
  );
  if (!first.ok) throw new Error("synthetic V1");
  const original = first.data.quotes[0]!;
  const proposal = {
    patches: [{ op: "setPayment" as const, value: "T/T发货前付" }],
    summary: "付款",
  };
  let changed = false;
  const json = vi.fn(async (messages: ModelMessage[]) => {
    if (observations(messages).at(-1)?.name === "validate_quote" && !changed) {
      changed = true;
      const other = f.repo.commitAgent(
        {
          ...common(),
          method: "agent.revise",
          payload: { baseId: original.id, expectedVersion: 1, instruction: "先保存新交期" },
        },
        { patches: [{ op: "setDelivery", value: "21天" }], summary: "交期" },
        "synthetic",
      );
      expect(other.ok).toBe(true);
    }
    return script(f, proposal)(messages);
  });
  const coordinator = new AgentRunCoordinator(f.repo, () => ({ json }));
  expect(
    await coordinator.executeLegacy(
      {
        ...common(),
        method: "agent.revise",
        payload: {
          executionMode: "tool_loop",
          baseId: original.id,
          expectedVersion: 1,
          instruction: "T/T发货前付",
        },
      },
      credentials,
    ),
  ).toMatchObject({ ok: false, error: { code: "REVISION_CONFLICT" } });
  const board = data(
    f.repo.executeTrade({ schemaVersion: 1, requestId: randomUUID(), method: "trade.get" }, actor),
  );
  expect(board.quotes).toHaveLength(2);
  expect(board.quotes.find((quote) => quote.id === original.id)).toEqual(original);
  await coordinator.close();
});
it("whole-run deadline stops an uncooperative provider without any later tool or automatic request", async () => {
  const f = runFixture(cleanups),
    deadline = new AbortController();
  vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
  const json = vi.fn(() => new Promise<unknown>(() => {})),
    coordinator = new AgentRunCoordinator(f.repo, () => ({ json })),
    input = start(f);
  const pending = coordinator.executeLegacy({ ...input, ...input.payload }, credentials);
  await Promise.resolve();
  deadline.abort(new DOMException("synthetic deadline", "TimeoutError"));
  expect(await pending).toMatchObject({ ok: false, error: { code: "MODEL_TIMEOUT" } });
  expect(json).toHaveBeenCalledTimes(1);
  expect(f.counts().quote_v1).toBe(0);
  await coordinator.close();
});
it("large real knowledge hits the context budget before any subsequent model request or write", async () => {
  const f = runFixture(cleanups);
  for (let i = 0; i < 3; i++) published(f, { sourceText: "合成来源".repeat(7000) });
  const json = vi.fn(async (messages: ModelMessage[]) => script(f)(messages)),
    coordinator = new AgentRunCoordinator(f.repo, () => ({ json })),
    input = start(f);
  expect(
    await coordinator.executeLegacy({ ...input, ...input.payload }, credentials),
  ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  expect(json).toHaveBeenCalledTimes(4);
  expect(f.counts().quote_v1).toBe(0);
  await coordinator.close();
});
it("persists clarification with its preview facts and refuses automatic retry of the same incomplete input", async () => {
  const f = runFixture(cleanups);
  published(f);
  const json = vi.fn(async (messages: ModelMessage[]) =>
    observations(messages).at(-1)?.name === "validate_quote"
      ? { kind: "clarification", question: "请补充实际付款要求" }
      : script(f, f.proposal)(messages),
  );
  const coordinator = new AgentRunCoordinator(f.repo, () => ({ json })),
    input = start(f);
  expect(
    await coordinator.executeLegacy({ ...input, ...input.payload }, credentials),
  ).toMatchObject({ ok: false, error: { code: "MISSING_FACTS" } });
  const run = f.store.list().runs[0]!;
  expect(run).toMatchObject({ status: "waiting_input", clarification: "请补充实际付款要求" });
  expect(coordinator.execute(f.control(run.runId, "agent.retry"), credentials)).toMatchObject({
    ok: false,
  });
  await coordinator.close();
  f.reopen();
  expect(f.store.get(run.runId).clarification).toBe(run.clarification);
});
it("reopening detects forged report bodies and tool-step projections instead of trusting a false success", async () => {
  const f = runFixture(cleanups);
  published(f);
  const json = vi.fn(async (messages: ModelMessage[]) => script(f)(messages)),
    coordinator = new AgentRunCoordinator(f.repo, () => ({ json })),
    input = start(f);
  const result = await coordinator.executeLegacy({ ...input, ...input.payload }, credentials);
  expect(result.ok).toBe(true);
  const run = f.store.list().runs[0]!;
  await coordinator.close();
  const original = (
    f.db.prepare("SELECT data_json FROM agent_run WHERE run_id=?").get(run.runId) as {
      data_json: string;
    }
  ).data_json;
  const forged = JSON.parse(original);
  forged.validation.report.coverage[0].appliedRuleIds.push(randomUUID());
  f.db
    .prepare("UPDATE agent_run SET data_json=? WHERE run_id=?")
    .run(JSON.stringify(forged), run.runId);
  expect(() => f.store.get(run.runId)).toThrow("检查报告");
  f.db.prepare("UPDATE agent_run SET data_json=? WHERE run_id=?").run(original, run.runId);
  const badSteps = JSON.parse(original);
  badSteps.toolSteps[0].evidenceIds = [];
  f.db
    .prepare("UPDATE agent_run SET data_json=? WHERE run_id=?")
    .run(JSON.stringify(badSteps), run.runId);
  expect(() => f.store.get(run.runId)).toThrow("步骤");
});

it("refuses mixed actual product categories rather than checking an unrelated single-category scope", async () => {
  const f = runFixture(cleanups, { sku: "DEMO-PANEL" });
  published(f);
  const board = data(
    f.repo.executeTrade({ schemaVersion: 1, requestId: randomUUID(), method: "trade.get" }, actor),
  );
  const tee = board.products.find((product) => product.sku === "DEMO-TEE")!;
  const mixed = {
    ...f.proposal,
    lines: [...f.proposal.lines, { productId: tee.id, quantity: "100", unit: tee.unit }],
  };
  const json = vi.fn(async (messages: ModelMessage[]) => {
    const action = script(f, mixed)(messages);
    return action.name === "search_catalog" ? { ...action, input: {} } : action;
  });
  const coordinator = new AgentRunCoordinator(f.repo, () => ({ json })),
    input = start(f);
  expect(
    await coordinator.executeLegacy({ ...input, ...input.payload }, credentials),
  ).toMatchObject({ ok: false, error: { code: "MISSING_FACTS" } });
  expect(f.counts().quote_v1).toBe(0);
  await coordinator.close();
});

it("uses rule feedback to correct a candidate within the same bounded loop and saves only the final validated draft", async () => {
  const f = runFixture(cleanups);
  published(f);
  let corrected = false;
  const json = vi.fn(async (messages: ModelMessage[]) => {
    const last = observations(messages).at(-1);
    if (last?.name === "validate_quote" && !last.result.data.allowed && !corrected) {
      corrected = true;
      return {
        kind: "tool",
        name: "calculate_quote",
        input: { proposal: { ...f.proposal, payment: "T/T", delivery: "30天" } },
      };
    }
    return script(
      f,
      corrected ? { ...f.proposal, payment: "T/T", delivery: "30天" } : f.proposal,
    )(messages);
  });
  const coordinator = new AgentRunCoordinator(f.repo, () => ({ json })),
    input = start(f);
  expect((await coordinator.executeLegacy({ ...input, ...input.payload }, credentials)).ok).toBe(
    true,
  );
  const run = f.store.list().runs[0]!;
  expect(run.toolSteps?.filter((step) => step.tool === "calculate_quote")).toHaveLength(2);
  expect(run.toolSteps?.filter((step) => step.tool === "validate_quote")).toHaveLength(2);
  expect(run.validation?.report.issues.some((issue) => issue.severity === "block")).toBe(false);
  expect(f.counts().quote_v1).toBe(1);
  expect(f.counts().agent_turn).toBe(1);
  expect(json).toHaveBeenCalledTimes(9);
  await coordinator.close();
});

it("stage menus hide stale validation and write tools after a new calculation until knowledge is refreshed", async () => {
  const f = runFixture(cleanups);
  published(f);
  let recalculated = false;
  const json = vi.fn(async (messages: ModelMessage[]) => {
    const last = observations(messages).at(-1);
    const menu: { name: string }[] = JSON.parse(messages[0]!.content.split("工具清单：")[1]!);
    const names = menu.map((v) => v.name);
    if (!last) expect(names).not.toContain("calculate_quote");
    if (last?.name === "calculate_quote") {
      expect(names).toContain("search_knowledge");
      expect(names).not.toContain("validate_quote");
      expect(names).not.toContain("create_draft");
    }
    if (last?.name === "search_knowledge") {
      expect(names).toContain("validate_quote");
      expect(names).not.toContain("create_draft");
    }
    if (last?.name === "validate_quote" && !recalculated) {
      expect(names).toContain("create_draft");
      recalculated = true;
      return {
        kind: "tool",
        name: "calculate_quote",
        input: { proposal: { ...f.proposal, payment: "T/T", delivery: "30天" } },
      };
    }
    return script(f)(messages);
  });
  const coordinator = new AgentRunCoordinator(f.repo, () => ({ json }));
  try {
    const input = start(f);
    expect(
      await coordinator.executeLegacy({ ...input, ...input.payload }, credentials),
    ).toMatchObject({ ok: true });
    const steps = f.store.list().runs[0]?.toolSteps!;
    expect(steps.filter((v) => v.tool === "search_knowledge")).toHaveLength(2);
    expect(steps.filter((v) => v.tool === "create_draft")).toHaveLength(1);
    expect(json).toHaveBeenCalledTimes(9);
  } finally {
    await coordinator.close();
  }
});
