import type Database from "better-sqlite3";
import {
  capabilityId,
  identifyLineage,
  sqlFingerprint,
  type CapabilityId,
  type CapabilityLineage,
  type ForeignKeyRef,
  type Identification,
  type MigrationLineage,
} from "./migration-lineage";

/**
 * 统一迁移谱系（A 维护号位与执行身份）。
 *
 * C 的 5/6/7 = run 表（agent_run/agent_run_control、agent_write_call、agent_tool_step），
 * A 的 6 = 知识四表，B 的 7 = quote_check_report。相同编号不是同一迁移，因此账本以
 * (lineage, version) 为主键区分 C6 与 A6、C7 与 B7；user_version 只作快速路径与交叉核对，
 * 识别一律以实际 schema 为准（见 migration-lineage.ts）。
 *
 * 历史 SQL 与业务事实不被改写：共同 1~4、C5/6/7、知识四表、检查报告的 DDL 原文保留，
 * 旧 schema_migration 表不删除不改写，新账本用 migration_registry 记录谱系 + 原编号 + 指纹。
 */

export interface MigrationStep {
  lineage: CapabilityLineage;
  version: number;
  sql: string;
}

export const MIGRATION_STEPS: MigrationStep[] = [
  {
    lineage: "common",
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
    lineage: "common",
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
    lineage: "common",
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
    // A01b：知识版本。共同谱系第 4 步，C 的 run 表原样占 5/6/7，不再抢用 4。
    lineage: "common",
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
    // C5：run + 控制回执。原文保留，仅 CRLF→LF。
    lineage: "c-run",
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
    // C6：写调用收据。依赖 C5。
    lineage: "c-run",
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
  {
    // C7：validation_json + 工具步骤。依赖 C6。
    lineage: "c-run",
    version: 7,
    sql: `
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
`,
  },
  {
    // A01c：知识四表。原编号 6，谱系 knowledge-wiki 与 C6 区分。
    lineage: "knowledge-wiki",
    version: 6,
    sql: `
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
`,
  },
  {
    // B7：检查报告不可变产物。原编号 7，谱系 check-report 与 C7 区分。
    lineage: "check-report",
    version: 7,
    sql: `
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
`,
  },
  {
    // A01e：维护 lint 回执。审核/发布/撤回服务的前置不可变事实；lint 成功不自动发布。
    lineage: "knowledge-wiki",
    version: 8,
    sql: `
CREATE TABLE knowledge_lint (
  receipt_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id),
  revision_id TEXT NOT NULL REFERENCES knowledge_wiki(revision_id),
  content_hash TEXT NOT NULL CHECK(length(content_hash)=64),
  source_set_hash TEXT NOT NULL CHECK(length(source_set_hash)=64),
  checked_at TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('passed','blocked','unknown')),
  data_json TEXT NOT NULL,
  UNIQUE(revision_id, content_hash, source_set_hash, checked_at)
);
CREATE INDEX knowledge_lint_revision ON knowledge_lint(revision_id, checked_at DESC);
CREATE TRIGGER knowledge_lint_no_update BEFORE UPDATE ON knowledge_lint BEGIN SELECT RAISE(ABORT,'IMMUTABLE_KNOWLEDGE_LINT'); END;
CREATE TRIGGER knowledge_lint_no_delete BEFORE DELETE ON knowledge_lint BEGIN SELECT RAISE(ABORT,'IMMUTABLE_KNOWLEDGE_LINT'); END;
`,
  },
];

/** 统一目标 user_version。8 不与任何历史谱系编号冲突。 */
export const UNIFIED_USER_VERSION = 8;

/** 可定向向前追加的已知谱系；其余一律安全拒绝。 */
export const UPGRADEABLE_LINEAGES: ReadonlySet<MigrationLineage> = new Set<MigrationLineage>([
  "empty",
  "common-v1",
  "common-v2",
  "common-v3",
  "a01b-v4",
  "c-v5",
  "c-v6",
  "c-v7",
  "a-v6",
  "a-v8",
  "b-v7",
  "unified",
]);

export class MigrationLineageError extends Error {
  readonly lineage: MigrationLineage;
  readonly userVersion: number;
  constructor(lineage: MigrationLineage, userVersion: number) {
    super(`MIGRATION_LINEAGE_REJECTED:${lineage}`);
    this.name = "MigrationLineageError";
    this.lineage = lineage;
    this.userVersion = userVersion;
  }
}

interface SchemaSnapshot {
  userVersion: number;
  objects: { type: string; name: string; tbl_name: string; sql: string | null }[];
  columns: Record<string, string[]>;
  foreignKeys: ForeignKeyRef[];
}

/** 读取 schema 快照（只读，供识别用）。 */
export function snapshotSchema(db: Database.Database): SchemaSnapshot {
  const userVersion = Number(db.pragma("user_version", { simple: true }));
  const objects = db
    .prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('table','index','trigger')")
    .all() as { type: string; name: string; tbl_name: string; sql: string | null }[];
  const columns: Record<string, string[]> = {};
  const foreignKeys: ForeignKeyRef[] = [];
  for (const obj of objects) {
    if (obj.type !== "table") continue;
    if (obj.name.startsWith("sqlite_")) continue;
    columns[obj.name] = (db.pragma(`table_info(${obj.name})`) as { name: string }[]).map(
      (c) => c.name,
    );
    for (const fk of db.pragma(`foreign_key_list(${obj.name})`) as {
      table: string;
      from: string;
      to: string;
    }[]) {
      foreignKeys.push({ table: obj.name, from: fk.from, toTable: fk.table, to: fk.to });
    }
  }
  return { userVersion, objects, columns, foreignKeys };
}

/** 已知能力步骤，按 (lineage, version) 唯一键索引，供账本交叉核对使用。 */
const STEP_BY_ID = new Map<CapabilityId, MigrationStep>(
  MIGRATION_STEPS.map((s) => [capabilityId(s), s]),
);

/**
 * B 旧账本 schema_migration(version, sql_hash) 的 hash 交叉核对（N11、M09-L01/L02）。
 * 旧账本只可能来自 B 谱系（C 无账本），version 到 lineage 的映射固定。
 * 除校验 hash 与已知能力原文一致外，还核对每条“已执行”声明对应的能力确实
 * 存在于当前 schema（N11）。M09-L01：无法解释的未知登记（如 version=99）不得忽略，
 * 必须安全拒绝；M09-L02：账本身份（version）必须唯一，重复登记属账本被重建为无唯一
 * 约束并重复插入，拒绝而非静默去重或改写历史账本。
 */
export function verifyLegacyLedger(db: Database.Database, id: Identification): void {
  const hasLegacy = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migration'")
    .get();
  if (!hasLegacy) return;
  const legacyMap: Record<number, CapabilityLineage> = {
    1: "common",
    2: "common",
    3: "common",
    4: "common",
    6: "knowledge-wiki",
    7: "check-report",
    8: "knowledge-wiki",
  };
  const rows = db.prepare("SELECT version, sql_hash FROM schema_migration").all() as {
    version: number;
    sql_hash: string;
  }[];
  const seenVersions = new Set<number>();
  for (const row of rows) {
    // M09-L02：账本身份（version）必须唯一；重复 version 说明账本被重建为无唯一约束并重复插入，
    // 属异常，拒绝而非静默去重或改写历史账本。
    if (seenVersions.has(row.version))
      throw new MigrationLineageError("tampered", id.expectedUserVersion);
    seenVersions.add(row.version);
    const lineage = legacyMap[row.version];
    // M09-L01：无法解释的未知登记（如 version=99）不得忽略，必须安全拒绝。
    if (!lineage) throw new MigrationLineageError("tampered", id.expectedUserVersion);
    const idKey = capabilityId({ lineage, version: row.version });
    const step = STEP_BY_ID.get(idKey);
    if (!step) throw new MigrationLineageError("tampered", id.expectedUserVersion);
    if (row.sql_hash !== sqlFingerprint(step.sql))
      throw new MigrationLineageError("tampered", id.expectedUserVersion);
    // 执行声明必须与真实 schema 能力一致，否则旧账本被篡改/张冠李戴（N11）。
    if (id.statuses[idKey] !== "present")
      throw new MigrationLineageError("tampered", id.expectedUserVersion);
  }
}

/**
 * 新账本 migration_registry(lineage, version, sql_hash, applied_at) 的前置只读校验（N10）。
 * 在读写真开/WAL 之前判定：每条登记的身份必须是已知能力、hash 必须与原文指纹一致、
 * 且对应能力确实存在于当前 schema。任何不一致先拒绝，不产生读写连接、不改 journal。
 */
export function verifyRegistryLedger(db: Database.Database, id: Identification): void {
  const hasRegistry = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='migration_registry'")
    .get();
  if (!hasRegistry) return;
  const rows = db
    .prepare("SELECT lineage, version, sql_hash FROM migration_registry")
    .all() as { lineage: string; version: number; sql_hash: string }[];
  for (const row of rows) {
    const idKey = capabilityId({ lineage: row.lineage as CapabilityLineage, version: row.version });
    const step = STEP_BY_ID.get(idKey);
    if (!step) throw new MigrationLineageError("tampered", id.expectedUserVersion);
    if (row.sql_hash !== sqlFingerprint(step.sql))
      throw new MigrationLineageError("tampered", id.expectedUserVersion);
    if (id.statuses[idKey] !== "present")
      throw new MigrationLineageError("tampered", id.expectedUserVersion);
  }
}

/**
 * 识别谱系并在非升级谱系/账本矛盾上安全拒绝（只读，不写任何内容）。
 * 旧账本与能力一致性、新账本身份/hash/能力一致性都在此只读阶段判定，
 * 晚于 repository 的 WAL 设置前即被拒绝。
 */
export function identify(db: Database.Database) {
  const snapshot = snapshotSchema(db);
  const id = identifyLineage(snapshot);
  if (!UPGRADEABLE_LINEAGES.has(id.lineage)) {
    throw new MigrationLineageError(id.lineage, snapshot.userVersion);
  }
  verifyLegacyLedger(db, id);
  verifyRegistryLedger(db, id);
  return { ...id, userVersion: snapshot.userVersion };
}

/**
 * 测试/工具辅助：只安装到指定（lineage,version）能力并按该能力置历史 user_version，
 * 用于构造旧库夹具（不写统一版本、不记账本）。仅限测试与受控诊断，不进入生产路径。
 */
export function seedTo(
  db: Database.Database,
  upto: { lineage: CapabilityLineage; version: number },
): void {
  const stop = capabilityId(upto);
  db.transaction(() => {
    for (const step of MIGRATION_STEPS) {
      db.exec(step.sql);
      if (capabilityId(step) === stop) break;
    }
  }).immediate();
  db.pragma(`user_version = ${upto.version}`);
}

/**
 * 定向向前追加到统一目标。识别必须先通过（谱系可升级且账本一致）。
 * 全程单连接、单 IMMEDIATE 事务：先核对已存在能力并补齐账本，再追加缺失能力，
 * 最后把 user_version 置为统一目标 8。任何一步失败整体回滚，不部分建表、不伪记已执行。
 */
export function migrate(db: Database.Database, steps = MIGRATION_STEPS) {
  const id = identify(db);
  const presentSet = new Set(id.present);
  const now = new Date().toISOString();

  db.transaction(() => {
    db.exec(
      "CREATE TABLE IF NOT EXISTS migration_registry(lineage TEXT NOT NULL, version INTEGER NOT NULL, sql_hash TEXT NOT NULL, applied_at TEXT NOT NULL, PRIMARY KEY(lineage, version))",
    );
    const select = db.prepare(
      "SELECT sql_hash FROM migration_registry WHERE lineage=? AND version=?",
    );
    const insert = db.prepare(
      "INSERT INTO migration_registry(lineage,version,sql_hash,applied_at) VALUES (?,?,?,?)",
    );

    // 1. 已存在能力：账本缺则补记，有则校验指纹不变（拒绝改写）。
    for (const step of steps) {
      if (!presentSet.has(capabilityId(step))) continue;
      const existing = select.get(step.lineage, step.version) as { sql_hash: string } | undefined;
      if (existing) {
        if (existing.sql_hash !== sqlFingerprint(step.sql))
          throw new MigrationLineageError("tampered", id.userVersion);
      } else {
        insert.run(step.lineage, step.version, sqlFingerprint(step.sql), now);
      }
    }
    // 2. 缺失能力按依赖顺序追加并记账本。
    for (const step of steps) {
      if (presentSet.has(capabilityId(step))) continue;
      db.exec(step.sql);
      insert.run(step.lineage, step.version, sqlFingerprint(step.sql), now);
    }
    // 3. 统一目标版本。
    db.pragma(`user_version = ${UNIFIED_USER_VERSION}`);
  }).immediate();
}
