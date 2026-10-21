import { readdirSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { WorkerOwnership } from "@tradequote/infrastructure";
import { EvaluationWorkerInputSchema, evaluateC04 } from "@tradequote/infrastructure/evaluation";

if (!process.parentPort) throw new Error("EVALUATION_REQUIRES_HOST");
const controller = new AbortController();
let started = false;
let ownership: WorkerOwnership | undefined;
let heartbeat = performance.now();
const lease = setInterval(() => {
  if (started && performance.now() - heartbeat > 5000) controller.abort();
}, 1000);
process.on("exit", () => clearInterval(lease));
process.on("exit", () => ownership?.close());
process.parentPort.on("message", (event: { data: unknown }) => {
  const parsed = EvaluationWorkerInputSchema.safeParse(event.data);
  if (!parsed.success) return;
  if (parsed.data.type === "heartbeat") {
    heartbeat = performance.now();
    return;
  }
  if (parsed.data.type === "cancel") {
    controller.abort();
    return;
  }
  if (started) return;
  started = true;
  heartbeat = performance.now();
  const input = parsed.data;
  try {
    ownership = new WorkerOwnership(
      join(dirname(dirname(input.workspaceRoot)), "evaluation-process"),
    );
    for (const entry of readdirSync(dirname(input.workspaceRoot), { withFileTypes: true }))
      if (
        entry.isDirectory() &&
        entry.name !== basename(input.workspaceRoot) &&
        /^[a-f0-9-]{36}$/.test(entry.name)
      )
        rmSync(join(dirname(input.workspaceRoot), entry.name), { recursive: true, force: true });
  } catch {
    process.parentPort?.postMessage({ type: "failed", code: "CAPABILITY_UNAVAILABLE" });
    setTimeout(() => process.exit(1), 50);
    return;
  }
  void evaluateC04({
    mode: input.mode,
    workspaceRoot: input.workspaceRoot,
    ...(input.credentials ? { credentials: input.credentials } : {}),
    ...(input.httpFixture ? { httpFixture: input.httpFixture } : {}),
    cancellation: controller.signal,
    onProgress: (observedRows) =>
      process.parentPort?.postMessage({ type: "progress", observedRows }),
  })
    .then((report) => process.parentPort?.postMessage({ type: "report", report }))
    .catch(() => process.parentPort?.postMessage({ type: "failed", code: "STORAGE_ERROR" }))
    .finally(() => setTimeout(() => process.exit(0), 50));
});
process.parentPort.postMessage({ type: "ready" });
