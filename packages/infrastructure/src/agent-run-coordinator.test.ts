import { randomUUID } from "node:crypto";
import { type AgentRun, RunResultSchema } from "@tradequote/contracts";
import { TradeFault } from "@tradequote/domain";
import { afterEach, expect, it, vi } from "vitest";
import { AgentRunCoordinator } from "./agent-run-coordinator";
import { runFixture } from "./testing/run-fixture";
import { WorkerOwnership } from "./worker-ownership";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});
const credentials = { key: "synthetic-key-coordinator", model: "synthetic-model" };
function run(result: unknown): AgentRun {
  const parsed = RunResultSchema.parse(result);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.data;
}
async function terminal(coordinator: AgentRunCoordinator, runId: string) {
  for (let i = 0; i < 50; i++) {
    const current = run(
      coordinator.execute({
        schemaVersion: 1,
        requestId: randomUUID(),
        method: "agent.get",
        payload: { runId },
      }),
    );
    if (!["queued", "running"].includes(current.status)) return current;
    await new Promise((r) => setImmediate(r));
  }
  throw new Error("synthetic completion barrier not reached");
}
it("R02/R17 unifies simultaneous legacy/new starts, conflicts and lost completion replies", async () => {
  const f = runFixture(cleanups);
  let release: (value: unknown) => void = () => {};
  const json = vi.fn(
    () =>
      new Promise<unknown>((resolve) => {
        release = resolve;
      }),
  );
  const coordinator = new AgentRunCoordinator(f.repo, () => ({ json }));
  const command = f.start(),
    legacy = { ...command, ...command.payload };
  const first = coordinator.executeLegacy(legacy, credentials);
  const same = run(coordinator.execute({ ...command, requestId: randomUUID() }, credentials));
  const duplicate = coordinator.executeLegacy({ ...legacy, requestId: randomUUID() }, credentials);
  expect(
    coordinator.execute({
      ...command,
      payload: { ...command.payload, payload: { ...command.payload.payload, buyer: "different" } },
    }),
  ).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_CONFLICT" } });
  await Promise.resolve();
  expect(json).toHaveBeenCalledTimes(1);
  release(f.proposal);
  expect((await first).ok).toBe(true);
  expect(await duplicate).toEqual(await first);
  const done = await terminal(coordinator, same.runId);
  expect(done.status).toBe("completed");
  expect(await coordinator.executeLegacy(legacy)).toEqual(await first);
  expect(f.db.prepare("SELECT status,revision_id,tool_name FROM agent_write_call").all()).toEqual([
    { status: "committed", revision_id: done.committedRevisionId, tool_name: "create_draft" },
  ]);
  expect(f.counts().quote_v1).toBe(1);
  expect(JSON.stringify(f.db.prepare("SELECT * FROM agent_write_call").all())).not.toContain(
    credentials.key,
  );
  await coordinator.close();
});
it("R03/R05 persists cancel before abort, ignores late provider output and retry replay only dispatches once", async () => {
  const f = runFixture(cleanups);
  const releases: ((value: unknown) => void)[] = [],
    signals: AbortSignal[] = [];
  const json = vi.fn((_messages: unknown, signal?: AbortSignal) => {
    if (signal) signals.push(signal);
    return new Promise<unknown>((resolve) => releases.push(resolve));
  });
  const coordinator = new AgentRunCoordinator(f.repo, () => ({ json }));
  const command = f.start(),
    start = run(coordinator.execute(command, credentials));
  await Promise.resolve();
  signals[0]?.addEventListener("abort", () =>
    expect(f.store.get(start.runId).status).toBe("cancelled"),
  );
  const cancel = f.control(start.runId, "agent.cancel");
  expect(run(coordinator.execute(cancel)).status).toBe("cancelled");
  const retry = f.control(start.runId, "agent.retry");
  expect(run(coordinator.execute(retry, credentials)).attempt).toBe(2);
  await Promise.resolve();
  releases[0]?.(f.proposal);
  await Promise.resolve();
  expect(signals[0]?.aborted).toBe(true);
  expect(signals[1]?.aborted).toBe(false);
  coordinator.execute(cancel);
  coordinator.execute(retry, credentials);
  expect(signals[1]?.aborted).toBe(false);
  releases[1]?.(f.proposal);
  expect((await terminal(coordinator, start.runId)).status).toBe("completed");
  expect(json).toHaveBeenCalledTimes(2);
  expect(f.counts().quote_v1).toBe(1);
  expect(f.counts().agent_turn).toBe(1);
  await coordinator.close();
});
it("R14 a failed cancel transaction never aborts the network or reports success", async () => {
  const f = runFixture(cleanups);
  let release: (value: unknown) => void = () => {},
    signal: AbortSignal | undefined;
  const coordinator = new AgentRunCoordinator(f.repo, () => ({
    json: (_messages, cancellation) => {
      signal = cancellation;
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  }));
  const start = run(coordinator.execute(f.start(), credentials));
  await Promise.resolve();
  f.db.exec(
    "CREATE TRIGGER fail_cancel BEFORE INSERT ON agent_run_control BEGIN SELECT RAISE(ABORT,'synthetic-private-sql'); END",
  );
  expect(coordinator.execute(f.control(start.runId, "agent.cancel"))).toMatchObject({
    ok: false,
    error: { code: "STORAGE_ERROR" },
  });
  expect(signal?.aborted).toBe(false);
  expect(f.store.get(start.runId).status).toBe("running");
  f.db.exec("DROP TRIGGER fail_cancel");
  release(f.proposal);
  expect((await terminal(coordinator, start.runId)).status).toBe("completed");
  await coordinator.close();
});
it("R06/R07 preserves clarification and public provider causes, requiring explicit retry", async () => {
  const f = runFixture(cleanups);
  const json = vi
    .fn()
    .mockResolvedValueOnce({ clarification: "请补充数量" })
    .mockRejectedValueOnce(new TradeFault("MODEL_RATE_LIMITED", "synthetic-private-provider"));
  const coordinator = new AgentRunCoordinator(f.repo, () => ({ json }));
  const waiting = run(coordinator.execute(f.start(), credentials));
  expect(await terminal(coordinator, waiting.runId)).toMatchObject({
    status: "waiting_input",
    clarification: "请补充数量",
  });
  expect(coordinator.execute(f.control(waiting.runId, "agent.retry"), credentials)).toMatchObject({
    ok: false,
  });
  const command = f.start(),
    failed = run(coordinator.execute(command, credentials));
  expect(await terminal(coordinator, failed.runId)).toMatchObject({
    status: "failed",
    error: { code: "MODEL_RATE_LIMITED" },
  });
  await coordinator.executeLegacy({ ...command, ...command.payload }, credentials);
  expect(json).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(f.db.prepare("SELECT * FROM agent_run").all())).not.toContain(
    "synthetic-private",
  );
  await coordinator.close();
});
it("R08 close aborts even an uncooperative provider, then recovery never invokes the model", async () => {
  const f = runFixture(cleanups),
    json = vi.fn(() => new Promise<unknown>(() => {}));
  const coordinator = new AgentRunCoordinator(f.repo, () => ({ json }));
  const start = run(coordinator.execute(f.start(), credentials));
  await Promise.resolve();
  await coordinator.close();
  expect(coordinator.execute(f.start(), credentials)).toMatchObject({ ok: false });
  f.reopen();
  const recovered = new AgentRunCoordinator(f.repo, () => ({ json }));
  expect(f.store.get(start.runId)).toMatchObject({ status: "interrupted", attempt: 1 });
  expect(json).toHaveBeenCalledTimes(1);
  await recovered.close();
});
it("R16 exclusive ownership refuses another live owner and can be released and reacquired", () => {
  const f = runFixture(cleanups),
    owner = new WorkerOwnership(f.file);
  try {
    expect(() => new WorkerOwnership(f.file)).toThrow("旧业务进程");
  } finally {
    owner.close();
  }
  const next = new WorkerOwnership(f.file);
  next.close();
});
it("write ledger replays exact receipts, rejects changed arguments and fences stale attempts", () => {
  const f = runFixture(cleanups),
    start = f.store.start(f.start()).run,
    ticket = f.claim(start.runId),
    id = randomUUID();
  expect(f.store.prepareWrite(ticket, id, f.proposal, "synthetic")).toBe(true);
  expect(f.store.prepareWrite(ticket, id, f.proposal, "synthetic")).toBe(true);
  expect(() =>
    f.store.prepareWrite(ticket, id, { ...f.proposal, payment: "different" }, "synthetic"),
  ).toThrow("不同参数");
  f.store.control(f.control(start.runId, "agent.cancel"));
  expect(f.db.prepare("SELECT status FROM agent_write_call").get()).toEqual({
    status: "abandoned",
  });
  f.store.control(f.control(start.runId, "agent.retry"));
  const next = f.claim(start.runId, 2),
    nextId = randomUUID();
  expect(f.store.commitWrite(ticket, id, f.proposal, "synthetic").status).toBe("running");
  f.store.prepareWrite(next, nextId, f.proposal, "synthetic");
  const done = f.store.commitWrite(next, nextId, f.proposal, "synthetic");
  expect(f.store.commitWrite(next, nextId, f.proposal, "synthetic")).toEqual(done);
  expect(f.counts().quote_v1).toBe(1);
  expect(() => f.db.exec("DELETE FROM agent_write_call")).toThrow("IMMUTABLE");
});
it("receipt failure rolls back quote/run/turn/idempotency while leaving a retryable prepared call", () => {
  const f = runFixture(cleanups),
    start = f.store.start(f.start()).run,
    ticket = f.claim(start.runId),
    id = randomUUID();
  f.store.prepareWrite(ticket, id, f.proposal, "synthetic");
  const before = f.counts();
  f.db.exec(
    "CREATE TRIGGER fail_receipt AFTER UPDATE ON agent_write_call WHEN NEW.status='committed' BEGIN SELECT RAISE(ABORT,'synthetic'); END",
  );
  expect(() => f.store.commitWrite(ticket, id, f.proposal, "synthetic")).toThrow();
  expect(f.counts()).toEqual(before);
  expect(f.store.get(start.runId).status).toBe("running");
  expect(f.db.prepare("SELECT status FROM agent_write_call").get()).toEqual({ status: "prepared" });
  f.db.exec("DROP TRIGGER fail_receipt");
  expect(f.store.commitWrite(ticket, id, f.proposal, "synthetic").status).toBe("completed");
});
