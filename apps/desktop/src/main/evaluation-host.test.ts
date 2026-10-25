import { EventEmitter } from "node:events";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EvaluationReportSchema,
  ModelEvaluationCommandSchema,
  ModelEvaluationResultSchema,
  RuntimeCommandSchema,
  WorkerRequestSchema,
} from "@tradequote/contracts";
import { afterEach, expect, it, vi } from "vitest";
import { ModelEvaluationHost } from "./evaluation-host";

class Child extends EventEmitter {
  postMessage = vi.fn();
  kill = vi.fn();
}
const dirs: string[] = [];
afterEach(() => {
  vi.useRealTimers();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const env = () => ({ schemaVersion: 1 as const, requestId: crypto.randomUUID() });
const start = (mode: "fixture" | "deepseek" = "fixture") =>
  ModelEvaluationCommandSchema.parse({
    ...env(),
    idempotencyKey: crypto.randomUUID(),
    method: "modelEvaluation.start",
    payload:
      mode === "fixture" ? { mode } : { mode, model: "synthetic-model", confirmedPaid: true },
  });
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "c04-host-test-"));
  dirs.push(dir);
  const child = new Child(),
    fork = vi.fn(() => child),
    credentials = vi.fn(() => ({ key: "synthetic-private-key", model: "synthetic-model" }));
  return { dir, child, fork, credentials, host: new ModelEvaluationHost(dir, fork, credentials) };
}
const list = () => ({ ...env(), method: "modelEvaluation.list", payload: {} });
function runs(result: unknown) {
  const parsed = ModelEvaluationResultSchema.parse(result);
  if (!parsed.ok || parsed.data.kind !== "runs") throw new Error("Expected run state");
  return parsed.data.runs;
}
const savedReport = () =>
  EvaluationReportSchema.parse(
    JSON.parse(readFileSync("wiki-project/raw/c04-fixture-report.json", "utf8")),
  );

it("requires exact consent/configuration, rejects injected authority and leaves legacy transports closed", () => {
  const f = fixture();
  expect(runs(f.host.execute(list()))).toEqual([]);
  expect(f.fork).not.toHaveBeenCalled();
  expect(f.credentials).not.toHaveBeenCalled();
  const command = start("deepseek");
  expect(
    f.host.execute({
      ...command,
      payload: { mode: "deepseek", model: "synthetic-model", confirmedPaid: false },
    }),
  ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  expect(
    f.host.execute({ ...command, credentials: { key: "injected", model: "synthetic-model" } }),
  ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  expect(RuntimeCommandSchema.safeParse(command).success).toBe(false);
  expect(WorkerRequestSchema.safeParse({ id: crypto.randomUUID(), command }).success).toBe(false);
  f.credentials.mockReturnValue({ key: "synthetic-private-key", model: "changed-model" });
  expect(f.host.execute(command)).toMatchObject({
    ok: false,
    error: { code: "MODEL_AUTH_FAILED" },
  });
  expect(f.fork).not.toHaveBeenCalled();
});
it("persists before dispatch, snapshots credentials only on new real starts, and replays keys without charging", async () => {
  const f = fixture(),
    command = start("deepseek");
  const run = runs(f.host.execute(command))[0]!;
  expect(readdirSync(f.dir)).toContain(`${run.runId}.json`);
  expect(f.child.postMessage).not.toHaveBeenCalled();
  expect(runs(f.host.execute({ ...command, requestId: crypto.randomUUID() }))[0]?.runId).toBe(
    run.runId,
  );
  expect(f.credentials).toHaveBeenCalledTimes(1);
  expect(f.fork).toHaveBeenCalledTimes(1);
  f.child.emit("message", { type: "ready" });
  f.child.emit("message", { type: "ready" });
  expect(f.child.postMessage).toHaveBeenCalledTimes(1);
  expect(f.child.postMessage.mock.calls[0]?.[0]).toMatchObject({
    type: "start",
    mode: "deepseek",
    credentials: { key: "synthetic-private-key" },
  });
  expect(
    JSON.stringify(f.host.execute(list())) + readFileSync(join(f.dir, `${run.runId}.json`), "utf8"),
  ).not.toContain("synthetic-private-key");
  const closing = f.host.close();
  f.child.emit("exit", 0);
  await closing;
});
it("preserves completion/exports, accepts no late cancel rewrite and reopens without model work", async () => {
  const f = fixture();
  const run = runs(f.host.execute(start()))[0]!;
  f.child.emit("message", { type: "ready" });
  f.child.emit("message", { type: "report", report: savedReport() });
  expect(
    runs(
      f.host.execute({
        ...env(),
        method: "modelEvaluation.cancel",
        idempotencyKey: crypto.randomUUID(),
        payload: { runId: run.runId },
      }),
    )[0]?.status,
  ).toBe("completed");
  const exported = ModelEvaluationResultSchema.parse(
    f.host.execute({
      ...env(),
      method: "modelEvaluation.export",
      payload: { runId: run.runId, format: "markdown" },
    }),
  );
  expect(exported.ok && exported.data.kind === "export" && exported.data.content).toContain(
    "fixture_only",
  );
  expect(JSON.stringify(exported)).not.toContain("synthetic-private-key");
  f.child.emit("exit", 0);
  await f.host.close();
  const reopened = new ModelEvaluationHost(f.dir, f.fork, f.credentials);
  expect(runs(reopened.execute(list()))[0]?.report?.status).toBe("passed");
  expect(f.fork).toHaveBeenCalledTimes(1);
  expect(f.credentials).not.toHaveBeenCalled();
  await reopened.close();
});
it("cancels admission immediately, fences late reports and waits for actual exit before a new child", async () => {
  const f = fixture();
  const run = runs(f.host.execute(start()))[0]!;
  f.child.emit("message", { type: "ready" });
  const cancel = {
    ...env(),
    method: "modelEvaluation.cancel" as const,
    idempotencyKey: crypto.randomUUID(),
    payload: { runId: run.runId },
  };
  expect(runs(f.host.execute(cancel))[0]?.status).toBe("cancelled");
  const sends = f.child.postMessage.mock.calls.length;
  expect(runs(f.host.execute({ ...cancel, requestId: crypto.randomUUID() }))[0]?.status).toBe(
    "cancelled",
  );
  expect(f.child.postMessage).toHaveBeenCalledTimes(sends);
  expect(f.host.execute({ ...start(), idempotencyKey: cancel.idempotencyKey })).toMatchObject({
    ok: false,
    error: { code: "IDEMPOTENCY_CONFLICT" },
  });
  expect(f.host.execute({ ...cancel, idempotencyKey: run.operationKey })).toMatchObject({
    ok: false,
    error: { code: "IDEMPOTENCY_CONFLICT" },
  });
  f.child.emit("message", { type: "report", report: savedReport() });
  expect(runs(f.host.execute(list()))[0]?.report).toBeNull();
  expect(f.host.execute(start())).toMatchObject({
    ok: false,
    error: { code: "CAPABILITY_UNAVAILABLE" },
  });
  f.child.emit("exit", 0);
  await f.host.close();
});
it("discovers interrupted facts on restart, fails closed on corrupt history and never auto-restarts", async () => {
  const f = fixture();
  const command = start(),
    run = runs(f.host.execute(command))[0]!;
  const closing = f.host.close();
  f.child.emit("exit", 0);
  await closing;
  const reopened = new ModelEvaluationHost(f.dir, f.fork, f.credentials);
  expect(runs(reopened.execute(command))[0]?.status).toBe("interrupted");
  expect(f.fork).toHaveBeenCalledTimes(1);
  await reopened.close();
  writeFileSync(join(f.dir, `${run.runId}.json`), "not-json");
  const broken = new ModelEvaluationHost(f.dir, f.fork, f.credentials);
  expect(broken.execute(start())).toMatchObject({ ok: false, error: { code: "STORAGE_ERROR" } });
  expect(f.fork).toHaveBeenCalledTimes(1);
});
it("enforces ten-minute suite deadline and never labels an HTTP acceptance fixture as real DeepSeek", async () => {
  vi.useFakeTimers();
  const f = fixture();
  const host = new ModelEvaluationHost(
    join(f.dir, "http"),
    f.fork,
    f.credentials,
    "http://127.0.0.1:12345",
  );
  const run = runs(host.execute(start("deepseek")))[0]!;
  expect(run).toMatchObject({
    requestedMode: "deepseek",
    mode: "fixture",
    transport: "http_fixture",
  });
  f.child.emit("message", { type: "ready" });
  expect(f.child.postMessage.mock.calls[0]?.[0]).toMatchObject({
    type: "start",
    mode: "fixture",
    httpFixture: { endpoint: "http://127.0.0.1:12345" },
  });
  await vi.advanceTimersByTimeAsync(600000);
  expect(runs(host.execute(list()))[0]?.status).toBe("interrupted");
  expect(f.child.kill).toHaveBeenCalled();
  f.child.emit("exit", 0);
  await host.close();
  await f.host.close();
});
