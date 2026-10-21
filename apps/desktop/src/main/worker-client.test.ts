import { type AgentReadCommand } from "@tradequote/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BusinessWorker } from "./worker-client";

const mock = vi.hoisted(() => ({
  callbacks: new Map<string, (value?: unknown) => void>(),
  postMessage: vi.fn(),
  kill: vi.fn(),
  fork: vi.fn(),
}));
vi.mock("electron", () => ({
  utilityProcess: {
    fork: (...args: unknown[]) => {
      mock.fork(...args);
      return {
        on: (event: string, callback: (value?: unknown) => void) =>
          mock.callbacks.set(event, callback),
        postMessage: mock.postMessage,
        kill: mock.kill,
      };
    },
  },
}));
const command = (): AgentReadCommand => ({
  schemaVersion: 1,
  requestId: crypto.randomUUID(),
  method: "agent.read",
  payload: { instruction: "查询", quoteRevisionIds: [] },
});
beforeEach(() => {
  vi.useFakeTimers();
  mock.callbacks.clear();
  vi.clearAllMocks();
});
afterEach(() => vi.useRealTimers());

it("waits longer than the read runtime deadline, validates replies, and resolves a read result", async () => {
  const worker = new BusinessWorker("fixture.js", "synthetic.sqlite");
  mock.callbacks.get("message")?.({ type: "ready" });
  let settled = false;
  const pending = worker.request(command()).then((result) => {
    settled = true;
    return result;
  });
  await vi.advanceTimersByTimeAsync(60000);
  expect(settled).toBe(false);
  const id = mock.postMessage.mock.calls[0]?.[0]?.id;
  mock.callbacks.get("message")?.({ id, result: { ok: true, data: { approved: true } } });
  expect(settled).toBe(false);
  const result = {
    ok: true,
    data: {
      workspaceId: crypto.randomUUID(),
      asOf: "2026-10-21T00:00:00.000Z",
      outcome: "completed",
      summary: "未保存报价",
      toolCalls: 0,
      observations: [],
    },
    warnings: [],
    evidenceIds: [],
  };
  mock.callbacks.get("message")?.({ id, result });
  expect(await pending).toEqual(result);
  worker.close();
});
it("does not replay after transport timeout or process exit", async () => {
  const worker = new BusinessWorker("fixture.js", "synthetic.sqlite");
  mock.callbacks.get("message")?.({ type: "ready" });
  const pending = worker.request(command());
  await vi.advanceTimersByTimeAsync(135000);
  expect(await pending).toMatchObject({
    ok: false,
    error: { message: "只读任务等待超时，未保存报价；重新运行会再次调用模型" },
  });
  expect(mock.postMessage).toHaveBeenCalledTimes(1);
  const second = worker.request(command());
  await Promise.resolve();
  mock.callbacks.get("exit")?.();
  expect(await second).toMatchObject({ ok: false, error: { code: "CAPABILITY_UNAVAILABLE" } });
  expect(mock.fork).toHaveBeenCalledTimes(1);
  const query = worker.request(command());
  expect(mock.fork).toHaveBeenCalledTimes(2);
  mock.callbacks.get("message")?.({ type: "ready" });
  await Promise.resolve();
  expect(mock.postMessage).toHaveBeenCalledTimes(3);
  mock.callbacks.get("exit")?.();
  expect(await query).toMatchObject({ ok: false });
});

it("waits for ready and actual exit before allowing restart or completing close", async () => {
  const worker = new BusinessWorker("fixture.js", "synthetic.sqlite");
  mock.callbacks.get("message")?.({ type: "ready" });
  const pending = worker.request(command());
  await Promise.resolve();
  let closed = false;
  const closing = worker.close().then(() => {
    closed = true;
  });
  expect(await pending).toMatchObject({ ok: false });
  expect(closed).toBe(false);
  expect(await worker.request(command())).toMatchObject({ ok: false });
  expect(mock.fork).toHaveBeenCalledTimes(1);
  mock.callbacks.get("exit")?.();
  await closing;
  expect(closed).toBe(true);
});
