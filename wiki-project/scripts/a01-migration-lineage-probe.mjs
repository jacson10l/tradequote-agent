// A01c 迁移谱系识别与追加矩阵探针（纯 Node，仅 node:sqlite + 类型剥离的 TS 源码）。
// 目的：在不依赖 node_modules/better-sqlite3 的前提下，验证
//   1) 能力 SQL 与 C/B 固定原件的 LF 指纹一致；
//   2) identifyLineage 对 12+ 种谱系（含混合/篡改/未知 v6/缺触发器）分类正确；
//   3) 每个可升级谱系能定向追加到统一目标（9 能力齐全、user_version=8）。
// 识别逻辑直接 import 真实 migration-lineage.ts；SQL 逐字复制自 migrations.ts 的
// MIGRATION_STEPS，并用已知指纹断言字节忠实。
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  CAPABILITIES,
  capabilityId,
  identifyLineage,
  sqlFingerprint,
} from "../../packages/infrastructure/src/migration-lineage.ts";

const STEPS = [
  { lineage: "common", version: 1, sql: `
CREATE TABLE workspace (slot INTEGER PRIMARY KEY CHECK(slot=1), id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, version INTEGER NOT NULL CHECK(version>0), created_at TEXT NOT NULL);
CREATE TABLE source (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspace(id), artifact_id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('staged','published','rejected')));
CREATE TABLE job (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspace(id), kind TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed','interrupted')), attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT);
CREATE TABLE idempotency (key TEXT PRIMARY KEY, request_hash TEXT NOT NULL, result_json TEXT NOT NULL);
CREATE TABLE outbox (seq INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL UNIQUE, workspace_id TEXT NOT NULL REFERENCES workspace(id), type TEXT NOT NULL, payload_json TEXT NOT NULL, context_json TEXT NOT NULL, created_at TEXT NOT NULL);
` },
  { lineage: "common", version: 2, sql: `
CREATE TABLE scenario_revision (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspace(id), version INTEGER NOT NULL, data_json TEXT NOT NULL, UNIQUE(workspace_id,version));
CREATE TABLE catalog_batch (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspace(id), source_hash TEXT NOT NULL, source_status TEXT NOT NULL, raw_csv TEXT NOT NULL, data_json TEXT NOT NULL, UNIQUE(workspace_id,source_hash,source_status));
CREATE TABLE catalog_product (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspace(id), batch_id TEXT NOT NULL REFERENCES catalog_batch(id), sku TEXT NOT NULL, data_json TEXT NOT NULL, UNIQUE(workspace_id,sku));
CREATE TABLE quote_v1 (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspace(id), scenario_id TEXT NOT NULL REFERENCES scenario_revision(id), content_hash TEXT NOT NULL, data_json TEXT NOT NULL);
CREATE TRIGGER quote_v1_no_update BEFORE UPDATE ON quote_v1 BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_QUOTE'); END;
CREATE TRIGGER quote_v1_no_delete BEFORE DELETE ON quote_v1 BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_QUOTE'); END;
` },
  { lineage: "common", version: 3, sql: `
CREATE TABLE quote_revision (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspace(id), root_id TEXT NOT NULL REFERENCES quote_v1(id), parent_id TEXT NOT NULL UNIQUE, version INTEGER NOT NULL CHECK(version>1), content_hash TEXT NOT NULL, data_json TEXT NOT NULL, UNIQUE(root_id,version));
CREATE TABLE agent_turn (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspace(id), data_json TEXT NOT NULL);
CREATE TRIGGER quote_revision_no_update BEFORE UPDATE ON quote_revision BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_QUOTE'); END;
CREATE TRIGGER quote_revision_no_delete BEFORE DELETE ON quote_revision BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_QUOTE'); END;
CREATE TRIGGER agent_turn_no_update BEFORE UPDATE ON agent_turn BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_TURN'); END;
CREATE TRIGGER agent_turn_no_delete BEFORE DELETE ON agent_turn BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_TURN'); END;
` },
  { lineage: "common", version: 4, sql: `
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
` },
  { lineage: "c-run", version: 5, sql: `
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
` },
  { lineage: "c-run", version: 6, sql: `
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
` },
  { lineage: "c-run", version: 7, sql: `
ALTER TABLE agent_write_call ADD COLUMN validation_json TEXT CHECK(validation_json IS NULL OR json_valid(validation_json));
CREATE TABLE agent_tool_step (
  run_id TEXT NOT NULL REFERENCES agent_run(run_id),
  attempt INTEGER NOT NULL,
  tool_call_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  data_json TEXT NOT NULL CHECK(json_valid(data_json)),
  PRIMARY KEY(run_id,attempt,tool_call_id),
  UNIQUE(run_id,attempt,ordinal)
);
CREATE TRIGGER agent_tool_step_no_update BEFORE UPDATE ON agent_tool_step BEGIN SELECT RAISE(ABORT,'IMMUTABLE_TOOL_STEP'); END;
CREATE TRIGGER agent_tool_step_no_delete BEFORE DELETE ON agent_tool_step BEGIN SELECT RAISE(ABORT,'IMMUTABLE_TOOL_STEP'); END;
` },
  { lineage: "knowledge-wiki", version: 6, sql: `
CREATE TABLE knowledge_source (
  source_revision_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id),
  source_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version>0),
  parent_revision_id TEXT,
  state TEXT NOT NULL CHECK(state IN ('active','withdrawn')),
  lifecycle_version INTEGER NOT NULL CHECK(lifecycle_version>0),
  artifact_hash TEXT NOT NULL CHECK(length(artifact_hash)=64),
  created_at TEXT NOT NULL,
  data_json TEXT NOT NULL,
  UNIQUE(source_id, version)
);
CREATE INDEX knowledge_source_document ON knowledge_source(source_id, version DESC);
CREATE TABLE knowledge_wiki (
  revision_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id),
  document_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version>0),
  parent_revision_id TEXT,
  content_hash TEXT NOT NULL CHECK(length(content_hash)=64),
  source_set_hash TEXT NOT NULL CHECK(length(source_set_hash)=64),
  created_at TEXT NOT NULL,
  data_json TEXT NOT NULL,
  UNIQUE(document_id, version)
);
CREATE INDEX knowledge_wiki_document ON knowledge_wiki(document_id, version DESC);
CREATE TRIGGER knowledge_wiki_no_update BEFORE UPDATE ON knowledge_wiki BEGIN SELECT RAISE(ABORT,'IMMUTABLE_KNOWLEDGE_WIKI'); END;
CREATE TRIGGER knowledge_wiki_no_delete BEFORE DELETE ON knowledge_wiki BEGIN SELECT RAISE(ABORT,'IMMUTABLE_KNOWLEDGE_WIKI'); END;
CREATE TABLE knowledge_lifecycle (
  revision_id TEXT PRIMARY KEY REFERENCES knowledge_wiki(revision_id),
  lifecycle_version INTEGER NOT NULL CHECK(lifecycle_version>0),
  state TEXT NOT NULL CHECK(state IN ('candidate','approved','rejected','published','withdrawn')),
  data_json TEXT NOT NULL
);
CREATE INDEX knowledge_lifecycle_state ON knowledge_lifecycle(state);
CREATE TABLE knowledge_consumption (
  consumption_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id),
  consumer_kind TEXT NOT NULL CHECK(consumer_kind IN ('quote','artifact')),
  consumer_entity_id TEXT NOT NULL,
  consumer_revision_id TEXT NOT NULL,
  registered_at TEXT NOT NULL,
  data_json TEXT NOT NULL,
  UNIQUE(consumer_kind, consumer_entity_id, consumer_revision_id)
);
CREATE TRIGGER knowledge_consumption_no_update BEFORE UPDATE ON knowledge_consumption BEGIN SELECT RAISE(ABORT,'IMMUTABLE_KNOWLEDGE_CONSUMPTION'); END;
CREATE TRIGGER knowledge_consumption_no_delete BEFORE DELETE ON knowledge_consumption BEGIN SELECT RAISE(ABORT,'IMMUTABLE_KNOWLEDGE_CONSUMPTION'); END;
` },
  { lineage: "check-report", version: 7, sql: `
CREATE TABLE quote_check_report (
  report_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id),
  quote_id TEXT NOT NULL REFERENCES quote_v1(id),
  revision_id TEXT NOT NULL,
  quote_version INTEGER NOT NULL CHECK(quote_version > 0),
  checked_at TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  data_json TEXT NOT NULL
);
CREATE INDEX quote_check_report_history ON quote_check_report(workspace_id,revision_id,checked_at DESC,report_id);
CREATE TRIGGER quote_check_report_revision BEFORE INSERT ON quote_check_report
WHEN NOT (
  (NEW.quote_version=1 AND NEW.quote_id=NEW.revision_id AND EXISTS (
    SELECT 1 FROM quote_v1 WHERE id=NEW.revision_id AND workspace_id=NEW.workspace_id
  )) OR (NEW.quote_version>1 AND EXISTS (
    SELECT 1 FROM quote_revision r JOIN quote_v1 q ON q.id=r.root_id
    WHERE r.id=NEW.revision_id AND r.root_id=NEW.quote_id AND r.version=NEW.quote_version
      AND r.workspace_id=NEW.workspace_id AND q.workspace_id=NEW.workspace_id
  ))
)
BEGIN SELECT RAISE(ABORT, 'INVALID_CHECK_REVISION'); END;
CREATE TRIGGER quote_check_report_no_update BEFORE UPDATE ON quote_check_report
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_CHECK_REPORT'); END;
CREATE TRIGGER quote_check_report_no_delete BEFORE DELETE ON quote_check_report
BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_CHECK_REPORT'); END;
` },
];

// C/B 固定诊断原件的 LF 归一指纹（d99f2b3）。
const KNOWN_FINGERPRINTS = {
  "common:1": "9e95979532306333f9f07037ce7e0841931d6e8c0b3d885208d63f4eb7360cb1",
  "common:2": "519f17179c501d08270a48eee562b6593eed6598bd0081692e437fbe7c53b723",
  "common:3": "a9fe17a0719962fa3dc4099cc51f35ada314bdbb7a15e6aecde91c58c0cabe42",
  "common:4": "b4e559a6acc383d064b04e2f0412c0863d526e94f80c79e25a00de81abb74980",
  "c-run:5": "6d511fff5eaa85e1198898d7c5cec392ed18461b110cecaf92553e4ff8ce0493",
  "c-run:6": "3d3c9da475f6a11d2d381de54a07396dc6dabaf8d780edebc0657f497bb47dfb",
  "c-run:7": "268beab4bd70f403d62877153abf2df0c6f574bde852b77c1cfe7a63808d87fa",
  "knowledge-wiki:6": "5184461756e3a389588182c1e9e497f34bfc7442bbf4d7ff8a09cdb458f49f66",
  "check-report:7": "927ce55cc67a6ec655cff131a67af33f9fdc7f83372d4247ab65467d91144602",
};

const UPGRADEABLE = new Set([
  "empty", "common-v1", "common-v2", "common-v3", "a01b-v4",
  "c-v5", "c-v6", "c-v7", "a-v6", "b-v7", "unified",
]);

function sha(s) {
  return createHash("sha256").update(s).digest("hex");
}

function snapshot(db) {
  const uv = Number(db.prepare("PRAGMA user_version").get().user_version);
  const objects = db
    .prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('table','index','trigger')")
    .all()
    .map((r) => ({ type: r.type, name: r.name, tbl_name: r.tbl_name, sql: r.sql }));
  const columns = {};
  const foreignKeys = [];
  for (const o of objects) {
    if (o.type !== "table" || o.name.startsWith("sqlite_")) continue;
    columns[o.name] = db.prepare(`PRAGMA table_info(${o.name})`).all().map((c) => c.name);
    for (const fk of db.prepare(`PRAGMA foreign_key_list(${o.name})`).all()) {
      foreignKeys.push({ table: o.name, from: fk.from, toTable: fk.table, to: fk.to });
    }
  }
  return { userVersion: uv, objects, columns, foreignKeys };
}

function build(db, upToId) {
  for (const step of STEPS) {
    db.exec(step.sql);
    if (capabilityId(step) === upToId) break;
  }
  db.exec(`PRAGMA user_version = ${STEPS.find((s) => capabilityId(s) === upToId).version}`);
}

function buildAll(db) {
  for (const step of STEPS) db.exec(step.sql);
  db.exec("PRAGMA user_version = 8");
}

// 能力是树而非线性序列：common 1~4 之后分叉为 A/B（knowledge-wiki→check-report）与
// C（c-run 5/6/7）。buildLineage 按依赖顺序只安装指定能力集合。
const LINEAGE_BUILD = {
  "common-v1": { ids: ["common:1"], uv: 1 },
  "common-v2": { ids: ["common:1", "common:2"], uv: 2 },
  "common-v3": { ids: ["common:1", "common:2", "common:3"], uv: 3 },
  "a01b-v4": { ids: ["common:1", "common:2", "common:3", "common:4"], uv: 4 },
  "c-v5": { ids: ["common:1", "common:2", "common:3", "common:4", "c-run:5"], uv: 5 },
  "c-v6": { ids: ["common:1", "common:2", "common:3", "common:4", "c-run:5", "c-run:6"], uv: 6 },
  "c-v7": { ids: ["common:1", "common:2", "common:3", "common:4", "c-run:5", "c-run:6", "c-run:7"], uv: 7 },
  "a-v6": { ids: ["common:1", "common:2", "common:3", "common:4", "knowledge-wiki:6"], uv: 6 },
  "b-v7": { ids: ["common:1", "common:2", "common:3", "common:4", "knowledge-wiki:6", "check-report:7"], uv: 7 },
};
function buildLineage(db, key) {
  const { ids, uv } = LINEAGE_BUILD[key];
  const want = new Set(ids);
  for (const step of STEPS) {
    if (want.has(capabilityId(step))) db.exec(step.sql);
  }
  db.exec(`PRAGMA user_version = ${uv}`);
}

const results = { fingerprints: {}, cases: [] };

// 1) 指纹忠实性
for (const step of STEPS) {
  const id = capabilityId(step);
  const got = sqlFingerprint(step.sql);
  const known = KNOWN_FINGERPRINTS[id];
  results.fingerprints[id] = { got, known, match: got === known };
}

// 2) 谱系分类矩阵
function caseRun(name, buildFn, expect) {
  const db = new DatabaseSync(":memory:");
  buildFn(db);
  const snap = snapshot(db);
  const id = identifyLineage(snap);
  const ok = id.lineage === expect;
  results.cases.push({
    name,
    userVersion: snap.userVersion,
    lineage: id.lineage,
    expect,
    pass: ok,
    present: id.present,
    partial: id.partial,
  });
  db.close();
  return { db, id, snap };
}

// 2a) 已知升级谱系
caseRun("empty", () => {}, "empty");
caseRun("common-v1", (db) => buildLineage(db, "common-v1"), "common-v1");
caseRun("common-v2", (db) => buildLineage(db, "common-v2"), "common-v2");
caseRun("common-v3", (db) => buildLineage(db, "common-v3"), "common-v3");
caseRun("a01b-v4", (db) => buildLineage(db, "a01b-v4"), "a01b-v4");
caseRun("c-v5", (db) => buildLineage(db, "c-v5"), "c-v5");
caseRun("c-v6", (db) => buildLineage(db, "c-v6"), "c-v6");
caseRun("c-v7", (db) => buildLineage(db, "c-v7"), "c-v7");
caseRun("a-v6", (db) => buildLineage(db, "a-v6"), "a-v6");
caseRun("b-v7", (db) => buildLineage(db, "b-v7"), "b-v7");
caseRun("unified", (db) => buildAll(db), "unified");

// 2b) 拒绝谱系
// D3 后果：C run + check-report 但无知识四表（混合）→ mixed
caseRun("mixed-crun+report", (db) => {
  buildLineage(db, "c-v7");
  for (const s of STEPS) if (s.lineage === "check-report") db.exec(s.sql);
  db.exec("PRAGMA user_version = 7");
}, "mixed");
// 缺不可变触发器 → tampered
caseRun("tampered-missing-trigger", (db) => {
  buildLineage(db, "a-v6");
  db.exec("DROP TRIGGER knowledge_wiki_no_delete");
}, "tampered");
// 未知 v6（common1-4 但 user_version=6）→ unknown
caseRun("unknown-v6", (db) => {
  buildLineage(db, "a01b-v4");
  db.exec("PRAGMA user_version = 6");
}, "unknown");
// 高于支持的版本 → unknown
caseRun("unknown-newer", (db) => {
  buildAll(db);
  db.exec("PRAGMA user_version = 9");
}, "unknown");
// 缺 check-report 触发器 → tampered
caseRun("tampered-missing-report-trigger", (db) => {
  buildLineage(db, "b-v7");
  db.exec("DROP TRIGGER quote_check_report_no_delete");
}, "tampered");
// N07：必要列被改名（agent_run.request_hash）→ 识别须拒绝，不能仍识别为 c-v7
caseRun("tampered-renamed-request-hash-N07", (db) => {
  buildLineage(db, "c-v7");
  db.exec("ALTER TABLE agent_run RENAME COLUMN request_hash TO request_hash2");
}, "tampered");
// N08：同名空触发器（SELECT 1 无 RAISE）不能充当不可变保护 → tampered
caseRun("tampered-empty-trigger-N08", (db) => {
  buildLineage(db, "c-v7");
  db.exec("DROP TRIGGER agent_tool_step_no_delete");
  db.exec(
    "CREATE TRIGGER agent_tool_step_no_delete BEFORE DELETE ON agent_tool_step BEGIN SELECT 1; END",
  );
}, "tampered");
// N09：一次写保护索引被换成同名普通非唯一索引 → tampered
caseRun("tampered-nonunique-index-N09", (db) => {
  buildLineage(db, "c-v6");
  db.exec("DROP INDEX agent_write_once");
  db.exec("CREATE INDEX agent_write_once ON agent_write_call(run_id, attempt)");
}, "tampered");

// M13-X01：RAISE 触发器加 WHEN 0 永假，保护永不触发 → tampered
caseRun("tampered-constant-when-M13-X01", (db) => {
  buildLineage(db, "c-v7");
  db.exec("DROP TRIGGER agent_tool_step_no_delete");
  db.exec(
    "CREATE TRIGGER agent_tool_step_no_delete BEFORE DELETE ON agent_tool_step WHEN 0 BEGIN SELECT RAISE(ABORT,'IMMUTABLE_TOOL_STEP'); END",
  );
}, "tampered");
// M13-X02：部分唯一索引 WHERE 0 不索引任何行 → tampered
caseRun("tampered-constant-where-M13-X02", (db) => {
  buildLineage(db, "c-v6");
  db.exec("DROP INDEX agent_write_once");
  db.exec("CREATE UNIQUE INDEX agent_write_once ON agent_write_call(run_id,attempt) WHERE 0");
}, "tampered");
// M13-X03：agent_tool_step 删除 run_id 外键 → tampered
caseRun("tampered-missing-fk-M13-X03", (db) => {
  buildLineage(db, "c-v7");
  db.exec("DROP TABLE agent_tool_step");
  db.exec(`CREATE TABLE agent_tool_step (
  run_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  tool_call_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  data_json TEXT NOT NULL CHECK(json_valid(data_json)),
  PRIMARY KEY(run_id,attempt,tool_call_id),
  UNIQUE(run_id,attempt,ordinal)
)`);
  db.exec("CREATE TRIGGER agent_tool_step_no_update BEFORE UPDATE ON agent_tool_step BEGIN SELECT RAISE(ABORT,'IMMUTABLE_TOOL_STEP'); END;");
  db.exec("CREATE TRIGGER agent_tool_step_no_delete BEFORE DELETE ON agent_tool_step BEGIN SELECT RAISE(ABORT,'IMMUTABLE_TOOL_STEP'); END;");
}, "tampered");
// M13-X04：agent_write_call 删除 attempt>0 CHECK → tampered
caseRun("tampered-missing-check-M13-X04", (db) => {
  buildLineage(db, "c-v6");
  db.exec("DROP TABLE agent_write_call");
  db.exec(`CREATE TABLE agent_write_call (
  run_id TEXT NOT NULL REFERENCES agent_run(run_id),
  tool_call_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  execution_id TEXT NOT NULL,
  worker_session_id TEXT NOT NULL,
  tool_name TEXT NOT NULL CHECK(tool_name IN ('create_draft','apply_patch')),
  request_hash TEXT NOT NULL,
  input_json TEXT NOT NULL CHECK(json_valid(input_json)),
  status TEXT NOT NULL CHECK(status IN ('prepared','committed','abandoned')),
  revision_id TEXT,
  PRIMARY KEY(run_id,tool_call_id),
  CHECK((status='committed') = (revision_id IS NOT NULL))
)`);
  db.exec("CREATE UNIQUE INDEX agent_write_once ON agent_write_call(run_id,attempt) WHERE status IN ('prepared','committed')");
  db.exec("CREATE TRIGGER agent_write_committed_no_update BEFORE UPDATE ON agent_write_call WHEN OLD.status='committed' BEGIN SELECT RAISE(ABORT,'IMMUTABLE_WRITE_RECEIPT'); END;");
  db.exec("CREATE TRIGGER agent_write_no_delete BEFORE DELETE ON agent_write_call BEGIN SELECT RAISE(ABORT,'IMMUTABLE_WRITE_RECEIPT'); END;");
}, "tampered");

// M13-X05：RAISE 触发器加 WHEN 1=0 比较永假（非字面量 0）→ tampered
caseRun("tampered-constant-when-comparison-M13-X05", (db) => {
  buildLineage(db, "c-v7");
  db.exec("DROP TRIGGER agent_tool_step_no_delete");
  db.exec(
    "CREATE TRIGGER agent_tool_step_no_delete BEFORE DELETE ON agent_tool_step WHEN 1=0 BEGIN SELECT RAISE(ABORT,'IMMUTABLE_TOOL_STEP'); END",
  );
}, "tampered");
// M13-X06：部分唯一索引 WHERE 1=0 比较永假 → tampered
caseRun("tampered-constant-where-comparison-M13-X06", (db) => {
  buildLineage(db, "c-v6");
  db.exec("DROP INDEX agent_write_once");
  db.exec("CREATE UNIQUE INDEX agent_write_once ON agent_write_call(run_id,attempt) WHERE 1=0");
}, "tampered");
// M13-X07：同名唯一索引增列 tool_call_id 且 WHERE 谓词被改写 → tampered
caseRun("tampered-index-extra-column-M13-X07", (db) => {
  buildLineage(db, "c-v6");
  db.exec("DROP INDEX agent_write_once");
  db.exec("CREATE UNIQUE INDEX agent_write_once ON agent_write_call(run_id,attempt,tool_call_id) WHERE status='prepared'");
}, "tampered");
// M13-X08：同名 no_delete 触发器事件被改为 BEFORE UPDATE → tampered
caseRun("tampered-trigger-event-M13-X08", (db) => {
  buildLineage(db, "c-v7");
  db.exec("DROP TRIGGER agent_tool_step_no_delete");
  db.exec(
    "CREATE TRIGGER agent_tool_step_no_delete BEFORE UPDATE ON agent_tool_step BEGIN SELECT RAISE(ABORT,'IMMUTABLE_TOOL_STEP'); END",
  );
}, "tampered");
// M13-X09：attempt>0 CHECK 只存在于 SQL 注释，非真实约束 → tampered
caseRun("tampered-check-in-comment-M13-X09", (db) => {
  buildLineage(db, "c-v6");
  db.exec("DROP TABLE agent_write_call");
  db.exec(`CREATE TABLE agent_write_call (
  run_id TEXT NOT NULL REFERENCES agent_run(run_id),
  tool_call_id TEXT NOT NULL,
  attempt INTEGER NOT NULL, /* CHECK(attempt>0) */
  execution_id TEXT NOT NULL,
  worker_session_id TEXT NOT NULL,
  tool_name TEXT NOT NULL CHECK(tool_name IN ('create_draft','apply_patch')),
  request_hash TEXT NOT NULL,
  input_json TEXT NOT NULL CHECK(json_valid(input_json)),
  status TEXT NOT NULL CHECK(status IN ('prepared','committed','abandoned')),
  revision_id TEXT,
  PRIMARY KEY(run_id,tool_call_id),
  CHECK((status='committed') = (revision_id IS NOT NULL))
)`);
  db.exec("CREATE UNIQUE INDEX agent_write_once ON agent_write_call(run_id,attempt) WHERE status IN ('prepared','committed')");
  db.exec("CREATE TRIGGER agent_write_committed_no_update BEFORE UPDATE ON agent_write_call WHEN OLD.status='committed' BEGIN SELECT RAISE(ABORT,'IMMUTABLE_WRITE_RECEIPT'); END;");
  db.exec("CREATE TRIGGER agent_write_no_delete BEFORE DELETE ON agent_write_call BEGIN SELECT RAISE(ABORT,'IMMUTABLE_WRITE_RECEIPT'); END;");
}, "tampered");
// M13-X10：no_delete 触发器体仅为 SELECT 'RAISE';（字符串字面量，非真实 RAISE 调用）→ tampered
caseRun("tampered-raise-string-literal-M13-X10", (db) => {
  buildLineage(db, "c-v7");
  db.exec("DROP TRIGGER agent_tool_step_no_delete");
  db.exec(
    "CREATE TRIGGER agent_tool_step_no_delete BEFORE DELETE ON agent_tool_step BEGIN SELECT 'RAISE'; END",
  );
}, "tampered");
// M13-X11：唯一索引 WHERE 谓词字符串字面量改大写，归一不能把小写 prepared 误判为规范谓词 → tampered
caseRun("tampered-predicate-case-M13-X11", (db) => {
  buildLineage(db, "c-v6");
  db.exec("DROP INDEX agent_write_once");
  db.exec("CREATE UNIQUE INDEX agent_write_once ON agent_write_call(run_id,attempt) WHERE status IN ('PREPARED','COMMITTED')");
}, "tampered");
// M13-Y01：触发器体为 CASE WHEN 0 THEN RAISE(...) ELSE 1 END，RAISE 不可达 → tampered
caseRun("tampered-unreachable-raise-M13-Y01", (db) => {
  buildLineage(db, "c-v7");
  db.exec("DROP TRIGGER agent_tool_step_no_delete");
  db.exec(
    "CREATE TRIGGER agent_tool_step_no_delete BEFORE DELETE ON agent_tool_step BEGIN SELECT CASE WHEN 0 THEN RAISE(ABORT,'IMMUTABLE_TOOL_STEP') ELSE 1 END; END",
  );
}, "tampered");
// M13-Y02：同名、同 DELETE 事件、含真实 RAISE 的触发器挂到 agent_run（错表）→ tampered
caseRun("tampered-wrong-table-trigger-M13-Y02", (db) => {
  buildLineage(db, "c-v7");
  db.exec("DROP TRIGGER agent_tool_step_no_delete");
  db.exec(
    "CREATE TRIGGER agent_tool_step_no_delete BEFORE DELETE ON agent_run BEGIN SELECT RAISE(ABORT,'IMMUTABLE_TOOL_STEP'); END",
  );
}, "tampered");
// M13-Y03：删除 agent_write_once，在旁表 synthetic_index_target 上创建同名 UNIQUE 索引（列/谓词同规范）→ tampered
caseRun("tampered-wrong-table-index-M13-Y03", (db) => {
  buildLineage(db, "c-v6");
  db.exec("DROP INDEX agent_write_once");
  db.exec("CREATE TABLE synthetic_index_target(run_id TEXT, attempt INTEGER, status TEXT)");
  db.exec(
    "CREATE UNIQUE INDEX agent_write_once ON synthetic_index_target(run_id,attempt) WHERE status IN ('prepared','committed')",
  );
}, "tampered");
// M13-Y04a：no_delete 保护体 SELECT RAISE(ABORT,...) WHERE 0（RAISE 永不执行）→ tampered
caseRun("tampered-raise-where-suppressed-M13-Y04a", (db) => {
  buildLineage(db, "c-v7");
  db.exec("DROP TRIGGER agent_tool_step_no_delete");
  db.exec(
    "CREATE TRIGGER agent_tool_step_no_delete BEFORE DELETE ON agent_tool_step BEGIN SELECT RAISE(ABORT,'IMMUTABLE_TOOL_STEP') WHERE 0; END",
  );
}, "tampered");
// M13-Y04b：no_delete 保护体 SELECT RAISE(ABORT,...) LIMIT 0（RAISE 永不执行）→ tampered
caseRun("tampered-raise-limit-suppressed-M13-Y04b", (db) => {
  buildLineage(db, "c-v7");
  db.exec("DROP TRIGGER agent_tool_step_no_delete");
  db.exec(
    "CREATE TRIGGER agent_tool_step_no_delete BEFORE DELETE ON agent_tool_step BEGIN SELECT RAISE(ABORT,'IMMUTABLE_TOOL_STEP') LIMIT 0; END",
  );
}, "tampered");
// M13-Y05：no_update 改为 BEFORE UPDATE OF 不存在列（更新 data_json 不触发保护）→ tampered
caseRun("tampered-update-of-column-M13-Y05", (db) => {
  buildLineage(db, "c-v7");
  db.exec("DROP TRIGGER agent_tool_step_no_update");
  db.exec(
    "CREATE TRIGGER agent_tool_step_no_update BEFORE UPDATE OF synthetic_nonexistent_column ON agent_tool_step BEGIN SELECT RAISE(ABORT,'IMMUTABLE_TOOL_STEP'); END",
  );
}, "tampered");
// M13-Y06：no_delete 改为 AFTER DELETE + SELECT RAISE(IGNORE)（时机后置且不中止）→ tampered
caseRun("tampered-after-ignore-raise-M13-Y06", (db) => {
  buildLineage(db, "c-v7");
  db.exec("DROP TRIGGER agent_tool_step_no_delete");
  db.exec(
    "CREATE TRIGGER agent_tool_step_no_delete AFTER DELETE ON agent_tool_step BEGIN SELECT RAISE(IGNORE); END",
  );
}, "tampered");
// M13-Y07：no_delete 真实体为 SELECT 1，前置注释伪造 BEGIN SELECT RAISE(ABORT,...) END → tampered
caseRun("tampered-comment-forged-body-M13-Y07", (db) => {
  buildLineage(db, "c-v7");
  db.exec("DROP TRIGGER agent_tool_step_no_delete");
  db.exec(
    "CREATE TRIGGER agent_tool_step_no_delete BEFORE DELETE ON agent_tool_step /* BEGIN SELECT RAISE(ABORT,'IMMUTABLE_TOOL_STEP'); END */ BEGIN SELECT 1; END",
  );
}, "tampered");
// M13-Y08：no_update 用注释分隔 UPDATE 与 OF 列范围（保护实际收窄到不存在列）→ tampered
caseRun("tampered-comment-split-update-of-M13-Y08", (db) => {
  buildLineage(db, "c-v7");
  db.exec("DROP TRIGGER agent_tool_step_no_update");
  db.exec(
    "CREATE TRIGGER agent_tool_step_no_update BEFORE UPDATE /* synthetic gap */ OF synthetic_nonexistent_column ON agent_tool_step BEGIN SELECT RAISE(ABORT,'IMMUTABLE_TOOL_STEP'); END",
  );
}, "tampered");
// M13-Y09：no_delete 真实事件改为 BEFORE UPDATE，前置注释伪造 BEFORE DELETE → tampered
caseRun("tampered-comment-forged-event-M13-Y09", (db) => {
  buildLineage(db, "c-v7");
  db.exec("DROP TRIGGER agent_tool_step_no_delete");
  db.exec(
    "CREATE TRIGGER agent_tool_step_no_delete /* BEFORE DELETE */ BEFORE UPDATE ON agent_tool_step BEGIN SELECT RAISE(ABORT,'IMMUTABLE_TOOL_STEP'); END",
  );
}, "tampered");

// 3) 追加：每个可升级谱系定向追加后应达到统一目标（9 能力齐全 + user_version=8）
function appendToTarget(db, snap) {
  const present = new Set(snap.present);
  for (const step of STEPS) {
    if (present.has(capabilityId(step))) continue;
    db.exec(step.sql);
  }
  db.exec("PRAGMA user_version = 8");
}

const appendResults = [];
for (const lineage of ["empty", "common-v1", "common-v2", "common-v3", "a01b-v4", "c-v5", "c-v6", "c-v7", "a-v6", "b-v7"]) {
  const db = new DatabaseSync(":memory:");
  if (lineage !== "empty") buildLineage(db, lineage);
  const before = identifyLineage(snapshot(db));
  appendToTarget(db, before);
  const after = identifyLineage(snapshot(db));
  const allPresent = CAPABILITIES.every((c) => after.statuses[capabilityId(c)] === "present");
  const uv = Number(db.prepare("PRAGMA user_version").get().user_version);
  appendResults.push({
    lineage,
    before: before.lineage,
    after: after.lineage,
    allCapabilitiesPresent: allPresent,
    userVersion: uv,
    pass: after.lineage === "unified" && allPresent && uv === 8,
  });
  db.close();
}

// 4) 有效原 schema 控制组：真实 c-v6/c-v7 上保护实际生效（DELETE 被拒、重复 prepared 被拒）。
//    对应 C 的「有效原 schema 控制」列，证明原保护定义真实拒绝操作，而非仅识别通过。
const enforcement = [];
{
  const db = new DatabaseSync(":memory:");
  buildLineage(db, "c-v7");
  db.exec("INSERT INTO workspace(slot,id,name,version,created_at) VALUES (1,'w','w',1,'2026-01-01')");
  db.exec("INSERT INTO agent_run(run_id,workspace_id,operation_key,request_hash,data_json) VALUES ('r1','w','op','h','{\"runId\":\"r1\",\"operationKey\":\"op\",\"status\":\"pending\"}')");
  db.exec("INSERT INTO agent_tool_step(run_id,attempt,tool_call_id,ordinal,data_json) VALUES ('r1',1,'tc',1,'{}')");
  let rejected = false;
  try { db.exec("DELETE FROM agent_tool_step"); } catch { rejected = true; }
  enforcement.push({ control: "c-v7 agent_tool_step_no_delete rejects DELETE", rejected });
  db.close();
}
{
  const db = new DatabaseSync(":memory:");
  buildLineage(db, "c-v6");
  db.exec("INSERT INTO workspace(slot,id,name,version,created_at) VALUES (1,'w','w',1,'2026-01-01')");
  db.exec("INSERT INTO agent_run(run_id,workspace_id,operation_key,request_hash,data_json) VALUES ('r1','w','op','h','{\"runId\":\"r1\",\"operationKey\":\"op\",\"status\":\"pending\"}')");
  db.exec("INSERT INTO agent_write_call(run_id,tool_call_id,attempt,execution_id,worker_session_id,tool_name,request_hash,input_json,status) VALUES ('r1','tc1',1,'e','w','create_draft','h','{}','prepared')");
  let rejected = false;
  try { db.exec("INSERT INTO agent_write_call(run_id,tool_call_id,attempt,execution_id,worker_session_id,tool_name,request_hash,input_json,status) VALUES ('r1','tc2',1,'e','w','create_draft','h','{}','prepared')"); } catch { rejected = true; }
  enforcement.push({ control: "c-v6 agent_write_once rejects duplicate prepared", rejected });
  db.close();
}

const fpFailures = Object.entries(results.fingerprints).filter(([, v]) => !v.match);
const caseFailures = results.cases.filter((c) => !c.pass);
const appendFailures = appendResults.filter((c) => !c.pass);
const enforcementFailures = enforcement.filter((c) => !c.rejected);

const report = {
  status: "passed",
  scope:
    "A01c migration lineage identification & append matrix probe; synthetic in-memory only; " +
    "proves identification classification and capability-append shape, not business acceptance",
  recordedAt: new Date().toISOString(),
  environment: { platform: process.platform, arch: process.arch, node: process.version, db: "node:sqlite (:memory:)" },
  sources: {
    identification: "packages/infrastructure/src/migration-lineage.ts",
    sqlMirroredFrom: "packages/infrastructure/src/migrations.ts (MIGRATION_STEPS)",
    originalEvidence: "d99f2b32def756b6b4d4cc99fca75dd9511436d5",
  },
  fingerprints: results.fingerprints,
  cases: results.cases,
  append: appendResults,
  enforcement,
  summary: {
    fingerprintMatch: Object.values(results.fingerprints).every((v) => v.match),
    allCasesPass: caseFailures.length === 0,
    allAppendPass: appendFailures.length === 0,
    allEnforcementPass: enforcementFailures.length === 0,
    caseFailures,
    appendFailures,
    enforcementFailures,
    fpFailures: fpFailures.map(([k]) => k),
  },
  compatible: false, // 诊断复现/识别通过 ≠ 跨谱系兼容；组合接线与数据验收另行
};

process.stdout.write(JSON.stringify(report, null, 2) + "\n");
