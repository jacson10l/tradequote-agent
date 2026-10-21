import type Database from "better-sqlite3";

export const migrations = [
  {
    version: 1,
    sql: `
CREATE TABLE workspace (slot INTEGER PRIMARY KEY CHECK(slot=1), id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, version INTEGER NOT NULL CHECK(version>0), created_at TEXT NOT NULL);
CREATE TABLE source (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspace(id), artifact_id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('staged','published','rejected')));
CREATE TABLE job (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspace(id), kind TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed','interrupted')), attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT);
CREATE TABLE idempotency (key TEXT PRIMARY KEY, request_hash TEXT NOT NULL, result_json TEXT NOT NULL);
CREATE TABLE outbox (seq INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL UNIQUE, workspace_id TEXT NOT NULL REFERENCES workspace(id), type TEXT NOT NULL, payload_json TEXT NOT NULL, context_json TEXT NOT NULL, created_at TEXT NOT NULL);
`,
  },
];
export function migrate(db: Database.Database, steps = migrations) {
  const current = Number(db.pragma("user_version", { simple: true }));
  const latest = steps.at(-1)?.version ?? 0;
  if (current > latest) throw new Error("DATABASE_NEWER_THAN_APPLICATION");
  db.transaction(() => {
    for (const step of steps) {
      if (step.version <= current) continue;
      db.exec(step.sql);
      db.pragma(`user_version = ${step.version}`);
    }
  })();
}
