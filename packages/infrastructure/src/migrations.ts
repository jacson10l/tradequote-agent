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
  {
    version: 2,
    sql: `
CREATE TABLE scenario_revision (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspace(id), version INTEGER NOT NULL, data_json TEXT NOT NULL, UNIQUE(workspace_id,version));
CREATE TABLE catalog_batch (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspace(id), source_hash TEXT NOT NULL, source_status TEXT NOT NULL, raw_csv TEXT NOT NULL, data_json TEXT NOT NULL, UNIQUE(workspace_id,source_hash,source_status));
CREATE TABLE catalog_product (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspace(id), batch_id TEXT NOT NULL REFERENCES catalog_batch(id), sku TEXT NOT NULL, data_json TEXT NOT NULL, UNIQUE(workspace_id,sku));
CREATE TABLE quote_v1 (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspace(id), scenario_id TEXT NOT NULL REFERENCES scenario_revision(id), content_hash TEXT NOT NULL, data_json TEXT NOT NULL);
CREATE TRIGGER quote_v1_no_update BEFORE UPDATE ON quote_v1 BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_QUOTE'); END;
CREATE TRIGGER quote_v1_no_delete BEFORE DELETE ON quote_v1 BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_QUOTE'); END;
`,
  },
  {
    version: 3,
    sql: `
CREATE TABLE quote_revision (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspace(id), root_id TEXT NOT NULL REFERENCES quote_v1(id), parent_id TEXT NOT NULL UNIQUE, version INTEGER NOT NULL CHECK(version>1), content_hash TEXT NOT NULL, data_json TEXT NOT NULL, UNIQUE(root_id,version));
CREATE TABLE agent_turn (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspace(id), data_json TEXT NOT NULL);
CREATE TRIGGER quote_revision_no_update BEFORE UPDATE ON quote_revision BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_QUOTE'); END;
CREATE TRIGGER quote_revision_no_delete BEFORE DELETE ON quote_revision BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_QUOTE'); END;
CREATE TRIGGER agent_turn_no_update BEFORE UPDATE ON agent_turn BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_TURN'); END;
CREATE TRIGGER agent_turn_no_delete BEFORE DELETE ON agent_turn BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_TURN'); END;
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
