// Synthetic subprocess probe only. Never imported by the application or exposed by IPC.

import { randomUUID } from "node:crypto";
import { readFileSync, writeSync } from "node:fs";
import type Database from "better-sqlite3";
import {
  SqliteWorkspaceRepository,
  WorkerOwnership,
} from "../../packages/infrastructure/src/index";

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
store.prepareWrite(ticket, id, proposal, "synthetic-crash-model");
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
        : null;
if (trigger)
  db.exec(
    `CREATE TEMP TRIGGER synthetic_crash ${trigger} BEGIN SELECT synthetic_checkpoint(); END`,
  );
store.commitWrite(ticket, id, proposal, "synthetic-crash-model");
checkpoint("committed");
repo.close();
ownership.close();
