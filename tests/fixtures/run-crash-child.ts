// Synthetic subprocess probe only. Never imported by the application or exposed by IPC.

import { randomUUID } from "node:crypto";
import { readFileSync, writeSync } from "node:fs";
import type Database from "better-sqlite3";
import {
  SqliteWorkspaceRepository,
  WorkerOwnership,
} from "../../packages/infrastructure/src/index";

import {
  type DraftAuthorization,
  draftPlan,
  knowledgeStamp,
} from "../../packages/infrastructure/src/quote-draft-plan";

const [file, fixturePath, point] = process.argv.slice(2);
if (!file || !fixturePath || !point) throw new Error("synthetic args");
const ownership = new WorkerOwnership(file);
const repo = new SqliteWorkspaceRepository(file);
const { command, proposal } = JSON.parse(readFileSync(fixturePath, "utf8"));
const store = repo.runStore();
let runId = "";
function checkpoint(name: string) {
  if (name !== point) return;
  writeSync(1, `${JSON.stringify({ point, runId, pid: process.pid })}\n`);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
}
checkpoint("owned");
const run = store.start(command).run;
runId = run.runId;
checkpoint("queued");
const ticket = store.claim(runId, 1, randomUUID()).ticket;
if (!ticket) throw new Error("synthetic ticket");
checkpoint("running");
// Proposal is an explicit synthetic response; the separate Electron test kills a
// real HTTP request. This checkpoint covers response received, before transaction.
checkpoint("proposal");
const id = randomUUID();
const validated =
  point.startsWith("validated-") || point === "inside-final-step" || point === "inside-validation";
let proof: DraftAuthorization | undefined;
if (validated) {
  const at = new Date().toISOString();
  const board = repo.executeTrade(
    { schemaVersion: 1, requestId: randomUUID(), method: "trade.get" },
    { actorId: "synthetic", origin: "agent_tool" },
  );
  if (!board.ok) throw new Error("synthetic board");
  proof = {
    asOf: at,
    calculated: draftPlan(board.data, run.command, proposal, repo.read()!.id, at, randomUUID()),
    knowledgeStamp: knowledgeStamp([]),
  };
  store.prepareValidatedWrite(ticket, id, proposal, "synthetic-crash-model", proof);
} else store.prepareWrite(ticket, id, proposal, "synthetic-crash-model");
checkpoint("validated-prepared");
checkpoint("prepared");
if (point === "cancelled" || point === "retry-queued") {
  const envelope = () => ({
    schemaVersion: 1 as const,
    requestId: randomUUID(),
    idempotencyKey: randomUUID(),
  });
  store.control({ ...envelope(), method: "agent.cancel", payload: { runId } });
  checkpoint("cancelled");
  store.control({ ...envelope(), method: "agent.retry", payload: { runId } });
  checkpoint("retry-queued");
}
// Fault injection is strictly in this test fixture; register on the actual private
// connection so SQLite blocks while its business transaction is still open.
const db = Reflect.get(repo, "db") as Database.Database;
db.function("synthetic_checkpoint", () => {
  checkpoint(point);
  return 1;
});
const trigger =
  point === "inside-quote"
    ? "AFTER INSERT ON quote_v1"
    : point === "inside-run"
      ? "AFTER UPDATE ON agent_run WHEN json_extract(NEW.data_json,'$.status')='completed'"
      : point === "inside-receipt"
        ? "AFTER UPDATE ON agent_write_call WHEN NEW.status='committed'"
        : point === "inside-final-step"
          ? "AFTER INSERT ON agent_tool_step"
          : point === "inside-validation"
            ? "AFTER UPDATE ON agent_run WHEN json_extract(NEW.data_json,'$.validation.kind')='saved_revision'"
            : point === "validated-inside-receipt"
              ? "AFTER UPDATE ON agent_write_call WHEN NEW.status='committed'"
              : null;
if (trigger)
  db.exec(
    `CREATE TEMP TRIGGER synthetic_crash ${trigger} BEGIN SELECT synthetic_checkpoint(); END`,
  );
if (proof) store.commitValidatedWrite(ticket, id, proposal, "synthetic-crash-model", proof);
else store.commitWrite(ticket, id, proposal, "synthetic-crash-model");
checkpoint("validated-committed");
checkpoint("committed");
repo.close();
ownership.close();
