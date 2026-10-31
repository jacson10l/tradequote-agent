import { randomUUID } from "node:crypto";
import { type AgentRun, RunResultSchema } from "@tradequote/contracts";
import { afterEach, expect, it, vi } from "vitest";
import { AgentRunCoordinator } from "./agent-run-coordinator";
import { CodexHarness } from "./codex-harness";
import { runFixture } from "./testing/run-fixture";

const cleanups: (() => void)[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});
const credentials = { key: "synthetic-session-key", model: "synthetic-session-model" };
const envelope = () => ({
  schemaVersion: 1 as const,
  requestId: randomUUID(),
  idempotencyKey: randomUUID(),
});
const read = () => ({
  ...envelope(),
  method: "agent.start" as const,
  payload: {
    method: "agent.read" as const,
    payload: {
      executionMode: "codex_harness" as const,
      instruction: "查询商品资料",
      quoteRevisionIds: [],
    },
  },
});
function data(value: unknown): AgentRun {
  const parsed = RunResultSchema.parse(value);
  if (!parsed.ok) throw Error(parsed.error.message);
  return parsed.data;
}
async function settled(c: AgentRunCoordinator, id: string) {
  for (let i = 0; i < 80; i++) {
    const run = data(
      c.execute({
        schemaVersion: 1,
        requestId: randomUUID(),
        method: "agent.get",
        payload: { runId: id },
      }),
    );
    if (!["queued", "running"].includes(run.status)) return run;
    await new Promise((r) => setImmediate(r));
  }
  throw Error("completion barrier");
}
it("continues with host-preserved context, resolves ancestors only after success, and replays without another version", async () => {
  const f = runFixture(cleanups);
  let release: (v: unknown) => void = () => {};
  const json = vi
    .fn()
    .mockResolvedValueOnce({ clarification: "请确认数量" })
    .mockImplementation(
      () =>
        new Promise((r) => {
          release = r;
        }),
    );
  const c = new AgentRunCoordinator(f.repo, () => ({ json }));
  const parent = data(c.execute(f.start(), credentials));
  await settled(c, parent.runId);
  const command = {
    ...envelope(),
    method: "agent.continue" as const,
    payload: { runId: parent.runId, supplement: "数量100件" },
  };
  const child = data(c.execute(command, credentials));
  expect(child.continuationOf).toBe(parent.runId);
  expect(f.store.get(parent.runId).status).toBe("waiting_input");
  await Promise.resolve();
  release(f.proposal);
  const done = await settled(c, child.runId);
  expect(done.status).toBe("completed");
  expect(f.store.get(parent.runId)).toMatchObject({
    status: "resolved",
    resolvedByRunId: child.runId,
    clarification: "请确认数量",
    committedRevisionId: null,
  });
  expect(data(c.execute(command, credentials)).runId).toBe(child.runId);
  expect(f.counts().quote_v1).toBe(1);
  await c.close();
  f.reopen();
  expect(f.store.get(parent.runId).status).toBe("resolved");
  expect(json).toHaveBeenCalledTimes(2);
});
it("requires saved settings before native execution rather than using the local Codex connection", async () => {
  const f = runFixture(cleanups);
  const harness = new CodexHarness();
  const invoke = vi.spyOn(harness, "run");
  const c = new AgentRunCoordinator(f.repo, undefined, undefined, harness);
  const original = f.start();
  const command = {
    ...original,
    payload: {
      ...original.payload,
      payload: { ...original.payload.payload, executionMode: "codex_harness" as const },
    },
  };
  const run = data(c.execute(command));
  expect((await settled(c, run.runId)).error?.code).toBe("MODEL_AUTH_FAILED");
  expect(invoke).not.toHaveBeenCalled();
  await c.close();
});
it("persists read progress, cancels before abort, ignores late output and restores/retries without a quotation write", async () => {
  const f = runFixture(cleanups);
  const harness = new CodexHarness();
  let signal: AbortSignal | undefined;
  let release: (v: { outcome: "completed"; summary: string; toolCalls: number }) => void = () => {};
  vi.spyOn(harness, "run").mockImplementation(async (task) => {
    signal = task.cancellation;
    await task.tools
      .find((t) => t.name === "search_catalog")!
      .invoke({ query: "", limit: 10, afterId: null }, signal);
    return await new Promise((r) => {
      release = r;
    });
  });
  const c = new AgentRunCoordinator(f.repo, undefined, undefined, harness);
  const run = data(c.execute(read(), credentials));
  for (let i = 0; i < 30 && !f.store.get(run.runId).toolSteps?.length; i++)
    await new Promise((r) => setImmediate(r));
  expect(f.store.get(run.runId).readObservations).toHaveLength(1);
  signal?.addEventListener("abort", () => expect(f.store.get(run.runId).status).toBe("cancelled"));
  expect(data(c.execute(f.control(run.runId, "agent.cancel"))).status).toBe("cancelled");
  expect(signal?.aborted).toBe(true);
  release({ outcome: "completed", summary: "晚到", toolCalls: 1 });
  await settled(c, run.runId);
  await c.close();
  f.reopen();
  const c2 = new AgentRunCoordinator(f.repo, undefined, undefined, harness);
  expect(f.store.get(run.runId).status).toBe("cancelled");
  const retry = data(c2.execute(f.control(run.runId, "agent.retry"), credentials));
  for (let i = 0; i < 30 && !f.store.get(run.runId).toolSteps?.length; i++)
    await new Promise((r) => setImmediate(r));
  release({ outcome: "completed", summary: "已查到商品", toolCalls: 1 });
  const done = await settled(c2, retry.runId);
  expect(done).toMatchObject({
    status: "completed",
    committedRevisionId: null,
    attempt: 2,
    readResult: { outcome: "completed", summary: "已查到商品" },
  });
  expect(f.counts().quote_v1).toBe(0);
  expect(f.counts().agent_turn).toBe(0);
  await c2.close();
});
it("keeps clarification open after a failed/cancelled continuation, then resolves the whole successful chain", async () => {
  const f = runFixture(cleanups);
  let release: (v: unknown) => void = () => {};
  const json = vi
    .fn()
    .mockResolvedValueOnce({ clarification: "请确认数量" })
    .mockImplementation(
      () =>
        new Promise((r) => {
          release = r;
        }),
    );
  const c = new AgentRunCoordinator(f.repo, () => ({ json }));
  const parent = data(c.execute(f.start(), credentials));
  await settled(c, parent.runId);
  const follow = (runId: string, supplement: string) => ({
    ...envelope(),
    method: "agent.continue" as const,
    payload: { runId, supplement },
  });
  const cancelled = data(c.execute(follow(parent.runId, "取消这次补充"), credentials));
  await Promise.resolve();
  c.execute(f.control(cancelled.runId, "agent.cancel"));
  release(f.proposal);
  await settled(c, cancelled.runId);
  expect(f.store.get(parent.runId).status).toBe("waiting_input");
  const middle = data(c.execute(follow(parent.runId, "还需要确认单位"), credentials));
  await Promise.resolve();
  release({ clarification: "请补充单位" });
  await settled(c, middle.runId);
  expect(c.execute(follow(parent.runId, "另一条并发补充"), credentials)).toMatchObject({
    ok: false,
    error: { code: "ACTION_NOT_ALLOWED" },
  });
  const child = data(c.execute(follow(middle.runId, "100 piece"), credentials));
  await Promise.resolve();
  release(f.proposal);
  await settled(c, child.runId);
  expect(f.store.get(parent.runId)).toMatchObject({
    status: "resolved",
    resolvedByRunId: child.runId,
  });
  expect(f.store.get(middle.runId)).toMatchObject({
    status: "resolved",
    resolvedByRunId: child.runId,
  });
  expect(
    c.execute(
      { ...follow(parent.runId, "新内容"), idempotencyKey: child.operationKey },
      credentials,
    ),
  ).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_CONFLICT" } });
  expect(f.counts().quote_v1).toBe(1);
  await c.close();
});
it("restores completed read results, discovers an interrupted read and never replays it on reopen", async () => {
  const f = runFixture(cleanups);
  const harness = new CodexHarness();
  const invoke = vi
    .spyOn(harness, "run")
    .mockResolvedValue({ outcome: "completed", summary: "未匹配到商品", toolCalls: 0 });
  const c = new AgentRunCoordinator(f.repo, undefined, undefined, harness);
  const first = data(c.execute(read(), credentials));
  const done = await settled(c, first.runId);
  expect(done.readResult?.outcome).toBe("completed");
  await c.close();
  // A separately claimed run simulates a previous worker exiting before completion.
  const lost = f.store.start(read()).run;
  f.claim(lost.runId);
  f.reopen();
  const restored = new AgentRunCoordinator(f.repo, undefined, undefined, harness);
  expect(f.store.get(first.runId).readResult).toEqual(done.readResult);
  expect(f.store.get(lost.runId).status).toBe("interrupted");
  expect(invoke).toHaveBeenCalledOnce();
  const retry = f.control(lost.runId, "agent.retry");
  const next = data(restored.execute(retry, credentials));
  restored.execute(retry, credentials);
  expect((await settled(restored, next.runId)).status).toBe("completed");
  expect(invoke).toHaveBeenCalledTimes(2);
  expect(f.counts().quote_v1).toBe(0);
  await restored.close();
});
it("rejects unconfigured read requests before native launch", async () => {
  const f = runFixture(cleanups);
  const harness = new CodexHarness();
  const invoke = vi.spyOn(harness, "run");
  const c = new AgentRunCoordinator(f.repo, undefined, undefined, harness);
  const run = data(c.execute(read()));
  expect((await settled(c, run.runId)).error?.code).toBe("MODEL_AUTH_FAILED");
  expect(invoke).not.toHaveBeenCalled();
  await c.close();
});
it("prevents retrying a superseded continuation while its replacement runs or after it resolves the parent", async () => {
  const f = runFixture(cleanups);
  let release: (v: unknown) => void = () => {};
  const json = vi
    .fn()
    .mockResolvedValueOnce({ clarification: "请确认数量" })
    .mockImplementation(
      () =>
        new Promise((r) => {
          release = r;
        }),
    );
  const c = new AgentRunCoordinator(f.repo, () => ({ json }));
  const parent = data(c.execute(f.start(), credentials));
  await settled(c, parent.runId);
  const follow = () => ({
    ...envelope(),
    method: "agent.continue" as const,
    payload: { runId: parent.runId, supplement: "100件" },
  });
  const first = data(c.execute(follow(), credentials));
  await Promise.resolve();
  c.execute(f.control(first.runId, "agent.cancel"));
  release(f.proposal);
  await settled(c, first.runId);
  const second = data(c.execute(follow(), credentials));
  await Promise.resolve();
  expect(c.execute(f.control(first.runId, "agent.retry"), credentials)).toMatchObject({
    ok: false,
    error: { code: "ACTION_NOT_ALLOWED" },
  });
  release(f.proposal);
  await settled(c, second.runId);
  expect(c.execute(f.control(first.runId, "agent.retry"), credentials)).toMatchObject({
    ok: false,
    error: { code: "ACTION_NOT_ALLOWED" },
  });
  expect(f.counts().quote_v1).toBe(1);
  await c.close();
});
it("retains the assistant question and supports a short supplement to a maximum-length original inquiry", async () => {
  const f = runFixture(cleanups);
  let release: (v: unknown) => void = () => {};
  const json = vi
    .fn()
    .mockResolvedValueOnce({ clarification: "请选择100件或200件" })
    .mockImplementation(
      () =>
        new Promise((r) => {
          release = r;
        }),
    );
  const c = new AgentRunCoordinator(f.repo, () => ({ json }));
  const original = f.start();
  original.payload.payload.inquiry = "询".repeat(8000);
  const parent = data(c.execute(original, credentials));
  await settled(c, parent.runId);
  const child = data(
    c.execute(
      {
        ...envelope(),
        method: "agent.continue",
        payload: { runId: parent.runId, supplement: "第二个" },
      },
      credentials,
    ),
  );
  expect(child.clarificationHistory).toEqual([
    { question: "请选择100件或200件", answer: "第二个" },
  ]);
  expect(child.continuationMessage).toBe("第二个");
  await Promise.resolve();
  release(f.proposal);
  await settled(c, child.runId);
  await c.close();
});
it("refuses cancelling a clarification node with an active descendant and prevents replacing its branch", async () => {
  const f = runFixture(cleanups);
  let release: (v: unknown) => void = () => {};
  const json = vi
    .fn()
    .mockResolvedValueOnce({ clarification: "数量？" })
    .mockResolvedValueOnce({ clarification: "单位？" })
    .mockImplementation(
      () =>
        new Promise((r) => {
          release = r;
        }),
    );
  const c = new AgentRunCoordinator(f.repo, () => ({ json }));
  const p = data(c.execute(f.start(), credentials));
  await settled(c, p.runId);
  const follow = (runId: string) => ({
    ...envelope(),
    method: "agent.continue" as const,
    payload: { runId, supplement: "请继续" },
  });
  const a = data(c.execute(follow(p.runId), credentials));
  await settled(c, a.runId);
  const g = data(c.execute(follow(a.runId), credentials));
  await Promise.resolve();
  expect(c.execute(f.control(a.runId, "agent.cancel"))).toMatchObject({
    ok: false,
    error: { code: "ACTION_NOT_ALLOWED" },
  });
  expect(c.execute(follow(p.runId), credentials)).toMatchObject({
    ok: false,
    error: { code: "ACTION_NOT_ALLOWED" },
  });
  release(f.proposal);
  await settled(c, g.runId);
  expect(f.store.get(p.runId).status).toBe("resolved");
  expect(f.counts().quote_v1).toBe(1);
  await c.close();
});
it("replays cancellation rather than an obsolete read clarification through the compatibility API", async () => {
  const f = runFixture(cleanups);
  const harness = new CodexHarness();
  vi.spyOn(harness, "run").mockResolvedValue({
    outcome: "waiting_input",
    clarification: "请选择商品",
    toolCalls: 0,
  });
  const c = new AgentRunCoordinator(f.repo, undefined, undefined, harness);
  const operation = read();
  const command = {
    schemaVersion: 1 as const,
    requestId: operation.requestId,
    method: "agent.read" as const,
    payload: operation.payload.payload,
  };
  expect(await c.executeReadLegacy(command, credentials)).toMatchObject({
    ok: true,
    data: { outcome: "waiting_input" },
  });
  const current = f.store.list().runs[0]!;
  c.execute(f.control(current.runId, "agent.cancel"));
  expect(await c.executeReadLegacy(command, credentials)).toMatchObject({
    ok: false,
    error: { code: "CANCELLED" },
  });
  await c.close();
});
