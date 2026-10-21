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
  {
    // A01b: knowledge revisions. A owns the migration sequence; C's run tables must
    // register as version 5 after this and never renumber 4.
    version: 4,
    sql: `
CREATE TABLE knowledge_revision (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id),
  document_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version>0),
  status TEXT NOT NULL CHECK(status IN ('staged','published')),
  source_hash TEXT NOT NULL CHECK(length(source_hash)=64),
  created_at TEXT NOT NULL,
  published_at TEXT,
  data_json TEXT NOT NULL
);
CREATE INDEX knowledge_revision_document ON knowledge_revision(document_id, version DESC);
CREATE TRIGGER knowledge_revision_no_update BEFORE UPDATE ON knowledge_revision WHEN OLD.status='published' BEGIN SELECT RAISE(ABORT,'IMMUTABLE_KNOWLEDGE'); END;
CREATE TRIGGER knowledge_revision_no_delete BEFORE DELETE ON knowledge_revision BEGIN SELECT RAISE(ABORT,'IMMUTABLE_KNOWLEDGE'); END;
`,
  },
  {
    version: 5,
    sql: `
CREATE TABLE agent_run (
  run_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id),
  operation_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  data_json TEXT NOT NULL CHECK(json_valid(data_json)),
  execution_id TEXT,
  worker_session_id TEXT,
  UNIQUE(workspace_id, operation_key),
  CHECK(json_extract(data_json, '$.runId') = run_id),
  CHECK(json_extract(data_json, '$.operationKey') = operation_key),
  CHECK((json_extract(data_json, '$.status') = 'running') = (execution_id IS NOT NULL AND worker_session_id IS NOT NULL))
);
CREATE INDEX agent_run_discovery ON agent_run(workspace_id, json_extract(data_json, '$.createdAt'), run_id);
CREATE TABLE agent_run_control (
  workspace_id TEXT NOT NULL REFERENCES workspace(id),
  control_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  result_json TEXT NOT NULL CHECK(json_valid(result_json)),
  PRIMARY KEY(workspace_id, control_key)
);
`,
  },
  {
    version: 6,
    sql: `
CREATE TABLE agent_write_call (
  run_id TEXT NOT NULL REFERENCES agent_run(run_id),
  tool_call_id TEXT NOT NULL,
  attempt INTEGER NOT NULL CHECK(attempt>0),
  execution_id TEXT NOT NULL,
  worker_session_id TEXT NOT NULL,
  tool_name TEXT NOT NULL CHECK(tool_name IN ('create_draft','apply_patch')),
  request_hash TEXT NOT NULL,
  input_json TEXT NOT NULL CHECK(json_valid(input_json)),
  status TEXT NOT NULL CHECK(status IN ('prepared','committed','abandoned')),
  revision_id TEXT,
  PRIMARY KEY(run_id,tool_call_id),
  CHECK((status='committed') = (revision_id IS NOT NULL))
);
CREATE UNIQUE INDEX agent_write_once ON agent_write_call(run_id,attempt) WHERE status IN ('prepared','committed');
CREATE TRIGGER agent_write_committed_no_update BEFORE UPDATE ON agent_write_call WHEN OLD.status='committed' BEGIN SELECT RAISE(ABORT,'IMMUTABLE_WRITE_RECEIPT'); END;
CREATE TRIGGER agent_write_no_delete BEFORE DELETE ON agent_write_call BEGIN SELECT RAISE(ABORT,'IMMUTABLE_WRITE_RECEIPT'); END;
`,
  },
];
export function migrate(db: Database.Database, steps = migrations) {
  // Validate the complete lineage before touching user_version or executing any DDL.
  if (steps.some((step, index) => step.version !== index + 1))
    throw new Error("INVALID_MIGRATION_SEQUENCE");
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
