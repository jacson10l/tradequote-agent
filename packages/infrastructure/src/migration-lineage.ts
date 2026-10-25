import { createHash } from "node:crypto";

/**
 * A01c 迁移谱系识别（纯函数，不依赖 better-sqlite3）。
 *
 * 背景：C 的迁移 5/6/7 是 run 表（agent_run/agent_run_control、agent_write_call、
 * agent_tool_step），A/B 的迁移 6/7 是知识四表与 quote_check_report。两边 user_version
 * 都是 7 时 schema 不同，且单个 version 无法同时表达 C6 与 A6、C7 与 B7。
 *
 * 因此识别只以实际 schema（表/索引/触发器/列及其有效定义）为准，user_version 仅作交叉核对，
 * 绝不单独依据编号判定谱系。除对象名称外，还核对必要列、真实唯一/部分索引和含 RAISE 的
 * 不可变触发器有效定义，以及外键与 CHECK 的真实存在。对“有效定义”按规范参考结构核对而非
 * 常量黑名单：触发器事件必须匹配规范事件（X08/Y09 注释伪造事件）、触发器/索引必须挂在规范目标表（Y02/Y03）、
 * WHEN 必须匹配规范 WHEN 或必须无 WHEN（X01/X05 永假/加 WHEN）、保护体必须是裸
 * `SELECT RAISE(ABORT, ...)`（动作 ABORT、无 WHERE/LIMIT/CASE 等可抑制执行的尾随子句）而非字符串
 * 字面量 'RAISE'（X10）、CASE 包裹的不可达 RAISE（Y01）、WHERE/LIMIT 0 抑制（Y04）或 IGNORE 不中止（Y06）、
 * 触发时机必须 BEFORE（Y06/Y09）、UPDATE 触发器不得限定 OF 列范围（Y05/Y08）——以上结构识别先经
 * `stripComments` 剥离注释（注释补空格保持词法边界）再匹配，防 Y07 注释伪造保护体、Y08 注释分隔
 * UPDATE OF、Y09 注释伪造事件；部分索引列与 WHERE 谓词必须匹配规范
 * （X02/X06/X07）、归一保留字符串字面量大小写语义（X11）、CHECK 按去注释/字符串/方括号引号标识符后的
 * 表原文匹配（X04/X09 注释伪 CHECK、Y10 方括号列名伪 CHECK）——封死 D2 静默缺表、D3 按 v6 误记知识迁移、
 * “未知 v6 被误接受”、“缺不可变触发器仍被接受”，以及 C 四轮/五轮/六轮/七轮/八轮核验的
 * N07/N08/N09 与 M13-X01～X11、M13-Y01～Y10（旧账本 M09-L01/L02 见 migrations.ts）。
 */

export type CapabilityLineage = "common" | "c-run" | "knowledge-wiki" | "check-report";

export type MigrationLineage =
  | "empty"
  | "common-v1"
  | "common-v2"
  | "common-v3"
  | "a01b-v4"
  | "c-v5"
  | "c-v6"
  | "c-v7"
  | "a-v6"
  | "b-v7"
  | "unified"
  | "mixed"
  | "tampered"
  | "unknown";

export interface SchemaObject {
  type: "table" | "index" | "trigger" | string;
  name: string;
  tbl_name: string;
  sql: string | null;
}

/** 索引要求：名称 + 目标表 + 是否必须唯一/部分 + 规范列与谓词（结构核对，非关键词黑名单）。 */
export interface IndexRequirement {
  name: string;
  /** 索引必须建在的规范目标表（防 M13-Y03 旁表同名索引）。 */
  table: string;
  /** 必须是唯一索引（如 agent_write_once 的一次写保护）。 */
  unique?: boolean;
  /** 必须是部分索引（CREATE INDEX 含 WHERE 子句）。 */
  partial?: boolean;
  /** 规范索引列（空白归一后精确匹配，如 "run_id,attempt"）；防 X07 增列。 */
  columns?: string;
  /** 规范 WHERE 谓词（空白归一后精确匹配）；仅 partial 索引需要，防 X06 永假/改写。 */
  where?: string;
}

/** 触发器要求：名称 + 目标表 + 事件/WHEN + 是否必须含 RAISE 的有效不可变保护（结构核对）。 */
export interface TriggerRequirement {
  name: string;
  /** 触发器必须挂在的规范目标表（防 M13-Y02 错表触发器）。 */
  table: string;
  /** 必须包含裸 `SELECT RAISE(ABORT, ...)` 有效不可变保护体（动作 ABORT、无 WHERE/LIMIT/CASE 抑制；同名 SELECT 1 空触发器、SELECT 'RAISE' 字符串字面量、CASE 包裹不可达 RAISE、WHERE/LIMIT 0 抑制或 RAISE(IGNORE) 不算，M13-X10/Y01/Y04/Y06）。 */
  raises?: boolean;
  /** 规范事件（DELETE/UPDATE/INSERT）；防 X08 事件篡改。 */
  event: "DELETE" | "UPDATE" | "INSERT";
  /** 规范 WHEN 条件（空白归一后精确匹配）；`null`=必须无 WHEN（防 X05 永假/加 WHEN）；省略=不核对 WHEN（复杂校验触发器）。 */
  when?: string | null;
}

/** 外键引用：子表列 -> 父表列。收集自 PRAGMA foreign_key_list，证明参照完整性真实存在。 */
export interface ForeignKeyRef {
  table: string; // 子表
  from: string; // 子表列
  toTable: string; // 父表
  to: string; // 父表列
}

/** CHECK 要求：CREATE TABLE 原文（去注释/字符串/方括号引号标识符后）必须命中该正则，证明某 CHECK 约束真实存在（M13-X04/X09/Y10）。 */
export interface CheckRequirement {
  table: string;
  /** SQLite 无 CHECK 专用 PRAGMA，只能从 sqlite_master 的表原文判定；去注释/字符串/方括号标识符避免命中注释、字符串或 `[CHECK(...)]` 列名中的伪 CHECK。 */
  pattern: RegExp;
}

/** 一个能力切片对 schema 对象的最低要求。 */
export interface CapabilitySpec {
  lineage: CapabilityLineage;
  version: number;
  /** 必须存在的表。 */
  tables: string[];
  /** 必须存在的索引及属性。 */
  indexes: IndexRequirement[];
  /** 必须存在的触发器及有效性。 */
  triggers: TriggerRequirement[];
  /** 必须存在的必要列：table -> column[]（防改名/缺失，如 N07 request_hash）。 */
  columns: Record<string, string[]>;
  /** 必须存在的外键（防 M13-X03 静默删除 run_id 参照）。 */
  foreignKeys?: ForeignKeyRef[];
  /** 必须存在的 CHECK 约束（防 M13-X04 静默删除 attempt>0）。 */
  checks?: CheckRequirement[];
}

/** 统一目标 = 共同 1~4 + C run 5/6/7 + 知识四表 + 检查报告。 */
export const CAPABILITIES: CapabilitySpec[] = [
  {
    lineage: "common",
    version: 1,
    tables: ["workspace", "source", "job", "idempotency", "outbox"],
    indexes: [],
    triggers: [],
    columns: {
      workspace: ["slot", "id", "name", "version", "created_at"],
      source: ["id", "workspace_id", "artifact_id", "status"],
      job: ["id", "workspace_id", "kind", "status", "attempts", "next_attempt_at"],
      idempotency: ["key", "request_hash", "result_json"],
      outbox: ["seq", "event_id", "workspace_id", "type", "payload_json", "context_json", "created_at"],
    },
  },
  {
    lineage: "common",
    version: 2,
    tables: ["scenario_revision", "catalog_batch", "catalog_product", "quote_v1"],
    indexes: [],
    triggers: [
      { name: "quote_v1_no_update", table: "quote_v1", raises: true, event: "UPDATE", when: null },
      { name: "quote_v1_no_delete", table: "quote_v1", raises: true, event: "DELETE", when: null },
    ],
    columns: {
      scenario_revision: ["id", "workspace_id", "version", "data_json"],
      catalog_batch: ["id", "workspace_id", "source_hash", "source_status", "raw_csv", "data_json"],
      catalog_product: ["id", "workspace_id", "batch_id", "sku", "data_json"],
      quote_v1: ["id", "workspace_id", "scenario_id", "content_hash", "data_json"],
    },
  },
  {
    lineage: "common",
    version: 3,
    tables: ["quote_revision", "agent_turn"],
    indexes: [],
    triggers: [
      { name: "quote_revision_no_update", table: "quote_revision", raises: true, event: "UPDATE", when: null },
      { name: "quote_revision_no_delete", table: "quote_revision", raises: true, event: "DELETE", when: null },
      { name: "agent_turn_no_update", table: "agent_turn", raises: true, event: "UPDATE", when: null },
      { name: "agent_turn_no_delete", table: "agent_turn", raises: true, event: "DELETE", when: null },
    ],
    columns: {
      quote_revision: ["id", "workspace_id", "root_id", "parent_id", "version", "content_hash", "data_json"],
      agent_turn: ["id", "workspace_id", "data_json"],
    },
  },
  {
    lineage: "common",
    version: 4,
    tables: ["knowledge_revision"],
    indexes: [{ name: "knowledge_revision_document", table: "knowledge_revision" }],
    triggers: [
      { name: "knowledge_revision_no_update", table: "knowledge_revision", raises: true, event: "UPDATE", when: "OLD.status='published'" },
      { name: "knowledge_revision_no_delete", table: "knowledge_revision", raises: true, event: "DELETE", when: null },
    ],
    columns: {
      knowledge_revision: [
        "id",
        "workspace_id",
        "document_id",
        "version",
        "status",
        "source_hash",
        "created_at",
        "published_at",
        "data_json",
      ],
    },
  },
  {
    lineage: "c-run",
    version: 5,
    tables: ["agent_run", "agent_run_control"],
    indexes: [{ name: "agent_run_discovery", table: "agent_run" }],
    triggers: [],
    columns: {
      agent_run: [
        "run_id",
        "workspace_id",
        "operation_key",
        "request_hash",
        "data_json",
        "execution_id",
        "worker_session_id",
      ],
      agent_run_control: ["workspace_id", "control_key", "request_hash", "result_json"],
    },
  },
  {
    lineage: "c-run",
    version: 6,
    tables: ["agent_write_call"],
    indexes: [{ name: "agent_write_once", table: "agent_write_call", unique: true, partial: true, columns: "run_id,attempt", where: "status IN ('prepared','committed')" }],
    triggers: [
      { name: "agent_write_committed_no_update", table: "agent_write_call", raises: true, event: "UPDATE", when: "OLD.status='committed'" },
      { name: "agent_write_no_delete", table: "agent_write_call", raises: true, event: "DELETE", when: null },
    ],
    columns: {
      agent_write_call: [
        "run_id",
        "tool_call_id",
        "attempt",
        "execution_id",
        "worker_session_id",
        "tool_name",
        "request_hash",
        "input_json",
        "status",
        "revision_id",
      ],
    },
    foreignKeys: [
      { table: "agent_write_call", from: "run_id", toTable: "agent_run", to: "run_id" },
    ],
    checks: [{ table: "agent_write_call", pattern: /CHECK\s*\(\s*attempt\s*>\s*0\s*\)/i }],
  },
  {
    lineage: "c-run",
    version: 7,
    tables: ["agent_tool_step"],
    indexes: [],
    triggers: [
      { name: "agent_tool_step_no_update", table: "agent_tool_step", raises: true, event: "UPDATE", when: null },
      { name: "agent_tool_step_no_delete", table: "agent_tool_step", raises: true, event: "DELETE", when: null },
    ],
    columns: {
      agent_tool_step: ["run_id", "attempt", "tool_call_id", "ordinal", "data_json"],
      agent_write_call: ["validation_json"],
    },
    foreignKeys: [
      { table: "agent_tool_step", from: "run_id", toTable: "agent_run", to: "run_id" },
    ],
  },
  {
    lineage: "knowledge-wiki",
    version: 6,
    tables: ["knowledge_source", "knowledge_wiki", "knowledge_lifecycle", "knowledge_consumption"],
    indexes: [
      { name: "knowledge_source_document", table: "knowledge_source" },
      { name: "knowledge_wiki_document", table: "knowledge_wiki" },
      { name: "knowledge_lifecycle_state", table: "knowledge_lifecycle" },
    ],
    triggers: [
      { name: "knowledge_wiki_no_update", table: "knowledge_wiki", raises: true, event: "UPDATE", when: null },
      { name: "knowledge_wiki_no_delete", table: "knowledge_wiki", raises: true, event: "DELETE", when: null },
      { name: "knowledge_consumption_no_update", table: "knowledge_consumption", raises: true, event: "UPDATE", when: null },
      { name: "knowledge_consumption_no_delete", table: "knowledge_consumption", raises: true, event: "DELETE", when: null },
    ],
    columns: {
      knowledge_source: [
        "source_revision_id",
        "workspace_id",
        "source_id",
        "version",
        "parent_revision_id",
        "state",
        "lifecycle_version",
        "artifact_hash",
        "created_at",
        "data_json",
      ],
      knowledge_wiki: [
        "revision_id",
        "workspace_id",
        "document_id",
        "version",
        "parent_revision_id",
        "content_hash",
        "source_set_hash",
        "created_at",
        "data_json",
      ],
      knowledge_lifecycle: ["revision_id", "lifecycle_version", "state", "data_json"],
      knowledge_consumption: [
        "consumption_id",
        "workspace_id",
        "consumer_kind",
        "consumer_entity_id",
        "consumer_revision_id",
        "registered_at",
        "data_json",
      ],
    },
  },
  {
    lineage: "check-report",
    version: 7,
    tables: ["quote_check_report"],
    indexes: [{ name: "quote_check_report_history", table: "quote_check_report" }],
    triggers: [
      { name: "quote_check_report_revision", table: "quote_check_report", raises: true, event: "INSERT" },
      { name: "quote_check_report_no_update", table: "quote_check_report", raises: true, event: "UPDATE", when: null },
      { name: "quote_check_report_no_delete", table: "quote_check_report", raises: true, event: "DELETE", when: null },
    ],
    columns: {
      quote_check_report: [
        "report_id",
        "workspace_id",
        "quote_id",
        "revision_id",
        "quote_version",
        "checked_at",
        "content_hash",
        "data_json",
      ],
    },
  },
];

export type CapabilityId = `${CapabilityLineage}:${number}`;

/** 能力身份键只依赖 lineage + version；CapabilitySpec / MigrationStep / 二元组均可传入。 */
export const capabilityId = (cap: { lineage: CapabilityLineage; version: number }): CapabilityId =>
  `${cap.lineage}:${cap.version}`;

/** 每个能力切片的身份；用于账本唯一键，区分 C6 与 A6、C7 与 B7。 */
export type CapabilityStatus = "absent" | "present" | "partial";

export interface Identification {
  lineage: MigrationLineage;
  /** 每个能力切片的对象级状态。 */
  statuses: Record<CapabilityId, CapabilityStatus>;
  /** 已完整存在的能力。 */
  present: CapabilityId[];
  /** 存在部分对象但缺列/触发器/索引/属性（tampered 依据）。 */
  partial: CapabilityId[];
  /** 该谱系应具备的 user_version（unified 为 8）。 */
  expectedUserVersion: number;
}

const hasTable = (name: string, tables: Set<string>) => tables.has(name);
const hasColumn = (table: string, column: string, columns: Record<string, string[]>) =>
  (columns[table] ?? []).includes(column);

/** 提取 WHEN/WHERE 之后到 BEGIN（触发器）或串尾（索引）的谓词原文；无该子句返回 null。 */
function extractPredicate(sql: string, keyword: "WHEN" | "WHERE"): string | null {
  const re =
    keyword === "WHEN" ? /\bWHEN\b([\s\S]*?)\bBEGIN\b/i : /\bWHERE\b([\s\S]*)$/i;
  const m = sql.match(re);
  return m ? (m[1] ?? null) : null;
}

/** 结构归一：字符串字面量之外的小写 + 压缩空白；字符串字面量内容原样保留（大小写是语义，防 M13-X11）。 */
function normalizeSql(sql: string): string {
  let out = "";
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    if (c === "'" || c === '"' || c === "`") {
      const q = c;
      out += q;
      i += 1;
      while (i < n && sql[i] !== q) {
        out += sql[i];
        i += 1;
      }
      if (i < n) {
        out += q;
        i += 1;
      }
      continue;
    }
    out += c!.toLowerCase(); // 循环界 i < n 保证非空（noUncheckedIndexedAccess）
    i += 1;
  }
  return out.replace(/\s+/g, " ").trim();
}

/** 去 SQL 注释、字符串字面量与方括号引号标识符（-- 行注释、块注释、'...'/"..."/`...`/[name] 内容），用于 RAISE/CHECK 等关键字有效性判定。 */
function stripTrivia(sql: string): string {
  let out = "";
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    if (c === "'" || c === '"' || c === "`") {
      const q = c;
      out += q + q; // 空字面量占位，避免字符串内容中的关键字被误命中（M13-X10）
      i += 1;
      while (i < n && sql[i] !== q) i += 1;
      if (i < n) i += 1;
      continue;
    }
    if (c === "[") {
      // 方括号引号标识符（SQLite 支持 [name]）：去除内容，防 M13-Y10 以列名 [CHECK(attempt>0)] 伪造 CHECK。
      out += "[]";
      i += 1;
      while (i < n && sql[i] !== "]") i += 1;
      if (i < n) i += 1;
      continue;
    }
    if (c === "-" && sql[i + 1] === "-") {
      while (i < n && sql[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && sql[i + 1] === "*") {
      i += 2;
      while (i < n && !(sql[i] === "*" && sql[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** 去 SQL 注释（-- 行注释、块注释），字符串/引号标识符（含 [name]）原样保留；每段注释替换为一个空格以保持词法边界（防 Y07/Y08/Y09 注释伪造结构）。 */
function stripComments(sql: string): string {
  let out = "";
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    if (c === "'" || c === '"' || c === "`") {
      const q = c;
      out += q;
      i += 1;
      while (i < n && sql[i] !== q) {
        out += sql[i];
        i += 1;
      }
      if (i < n) {
        out += q;
        i += 1;
      }
      continue;
    }
    if (c === "[") {
      // 方括号引号标识符（SQLite 支持 [name]）：内容原样保留，与其他引号标识符一致，不当作关键字。
      out += "[";
      i += 1;
      while (i < n && sql[i] !== "]") {
        out += sql[i];
        i += 1;
      }
      if (i < n) {
        out += "]";
        i += 1;
      }
      continue;
    }
    if (c === "-" && sql[i + 1] === "-") {
      out += " ";
      while (i < n && sql[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && sql[i + 1] === "*") {
      out += " ";
      i += 2;
      while (i < n && !(sql[i] === "*" && sql[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** 提取触发器事件（BEFORE/AFTER/INSTEAD OF 之后的 DELETE/UPDATE/INSERT）；无则 null。 */
function extractTriggerEvent(sql: string): "DELETE" | "UPDATE" | "INSERT" | null {
  const m = sql.match(/\b(?:BEFORE|AFTER|INSTEAD\s+OF)\s+(DELETE|UPDATE|INSERT)\b/i);
  return m && m[1] ? (m[1].toUpperCase() as "DELETE" | "UPDATE" | "INSERT") : null;
}

/** 提取触发器时机（BEFORE/AFTER/INSTEAD OF）；无则 null（防 Y06 改 AFTER 时机）。 */
function extractTriggerTiming(sql: string): "BEFORE" | "AFTER" | "INSTEAD OF" | null {
  const m = sql.match(/\b(BEFORE|AFTER|INSTEAD\s+OF)\s+(?:DELETE|UPDATE|INSERT)\b/i);
  return m && m[1] ? (m[1].toUpperCase() as "BEFORE" | "AFTER" | "INSTEAD OF") : null;
}

/** 提取触发器保护体（BEGIN 与首个 END 之间）；无 BEGIN 则 null。 */
function extractTriggerBody(sql: string): string | null {
  const m = sql.match(/\bBEGIN\b([\s\S]*?)\bEND\b/i);
  return m ? (m[1] ?? null) : null;
}

/**
 * 有效不可变保护体 = 裸 `SELECT RAISE(ABORT, ...)`：动作必须 ABORT（非 IGNORE），且不得有
 * WHERE/LIMIT/CASE 等可抑制 RAISE 执行的尾随子句。封 X10 字符串字面量、Y01 CASE 不可达、
 * Y04 WHERE/LIMIT 0 抑制、Y06 IGNORE 不中止。
 */
function hasBareAbortRaise(sql: string): boolean {
  const body = extractTriggerBody(sql);
  if (body === null) return false;
  const stripped = stripTrivia(body).toLowerCase().replace(/\s+/g, " ").trim();
  return /^select\s+raise\s*\(\s*abort\s*,\s*''\s*\)\s*;?\s*$/.test(stripped);
}

/** 提取索引列清单（ON <table> 之后的括号内容，无嵌套括号）；无则 null。 */
function extractIndexColumns(sql: string): string | null {
  const m = sql.match(/\bON\b\s+\S+\s*\(\s*([^()]*?)\s*\)/i);
  return m ? (m[1] ?? null) : null;
}

function capabilityStatus(
  cap: CapabilitySpec,
  tables: Set<string>,
  tableSql: Map<string, string>,
  indexSql: Map<string, string>,
  indexTable: Map<string, string>,
  triggerSql: Map<string, string>,
  triggerTable: Map<string, string>,
  columns: Record<string, string[]>,
  foreignKeys: ForeignKeyRef[],
): CapabilityStatus {
  const tablesOk = cap.tables.every((t) => hasTable(t, tables));
  if (!tablesOk) return "absent";
  const columnsOk = Object.entries(cap.columns).every(([table, cols]) =>
    cols.every((c) => hasColumn(table, c, columns)),
  );
  const indexesOk = cap.indexes.every((req) => {
    const sql = indexSql.get(req.name);
    if (sql === undefined) return false;
    // 索引实际所属表必须匹配规范目标表（防 M13-Y03 旁表同名索引）。
    if (indexTable.get(req.name) !== req.table) return false;
    // 先剥离注释再结构识别（防注释伪造 UNIQUE/列/谓词等关键字）。
    const lexical = stripComments(sql);
    if (req.unique && !/\bUNIQUE\b/i.test(lexical)) return false;
    if (req.columns !== undefined) {
      const actual = extractIndexColumns(lexical);
      if (actual === null || normalizeSql(actual) !== normalizeSql(req.columns)) return false;
    }
    if (req.partial) {
      const where = extractPredicate(lexical, "WHERE");
      if (where === null) return false;
      // 规范 WHERE 谓词必须精确匹配（防 X06 永假/改写；X02 谓词由规范 where 一并封死）。
      if (req.where !== undefined && normalizeSql(where) !== normalizeSql(req.where)) return false;
    }
    return true;
  });
  const triggersOk = cap.triggers.every((req) => {
    const sql = triggerSql.get(req.name);
    if (sql === undefined) return false;
    // 触发器实际目标表必须匹配规范目标表（防 M13-Y02 错表触发器）。
    if (triggerTable.get(req.name) !== req.table) return false;
    // 统一词法：先剥离注释（字符串原样保留）再结构识别，防 Y07 注释伪造保护体、Y08 注释分隔 UPDATE OF、Y09 注释伪造事件。
    const lexical = stripComments(sql);
    // 有效保护体 = 裸 SELECT RAISE(ABORT,...)（防 X10 字符串字面量、Y01 CASE 不可达、Y04 WHERE/LIMIT 抑制、Y06 IGNORE 不中止、Y07 注释伪造保护体）。
    if (req.raises && !hasBareAbortRaise(lexical)) return false;
    // 触发时机必须是 BEFORE（防 Y06 改 AFTER 时机、Y09 注释伪造时机）。
    if (extractTriggerTiming(lexical) !== "BEFORE") return false;
    if (extractTriggerEvent(lexical) !== req.event) return false;
    // UPDATE 触发器不得限定 OF 列范围（防 Y05 UPDATE OF 不存在的列、Y08 注释分隔 UPDATE OF 使保护失效）。
    if (req.event === "UPDATE" && /\bUPDATE\s+OF\b/i.test(lexical)) return false;
    if (req.when === null) {
      // 规范无 WHEN：实际必须无 WHEN（防 X05 永假/加 WHEN）。
      if (extractPredicate(lexical, "WHEN") !== null) return false;
    } else if (req.when !== undefined) {
      const actual = extractPredicate(lexical, "WHEN");
      if (actual === null || normalizeSql(actual) !== normalizeSql(req.when)) return false;
    }
    return true;
  });
  const foreignKeysOk = (cap.foreignKeys ?? []).every((req) =>
    foreignKeys.some(
      (fk) =>
        fk.table === req.table &&
        fk.from === req.from &&
        fk.toTable === req.toTable &&
        fk.to === req.to,
    ),
  );
  const checksOk = (cap.checks ?? []).every((req) => {
    const sql = tableSql.get(req.table);
    // 去注释/字符串/方括号标识符后匹配，避免命中注释、字符串或 [CHECK(...)] 列名中的伪 CHECK（M13-X09/Y10）。
    return sql !== undefined && req.pattern.test(stripTrivia(sql));
  });
  return columnsOk && indexesOk && triggersOk && foreignKeysOk && checksOk ? "present" : "partial";
}

/** 归一 CRLF→LF 后的 SQL 指纹；与 C/B 固定诊断一致。 */
export function sqlFingerprint(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");
}

const LINEAGE_VERSION: Record<MigrationLineage, number> = {
  empty: 0,
  "common-v1": 1,
  "common-v2": 2,
  "common-v3": 3,
  "a01b-v4": 4,
  "c-v5": 5,
  "c-v6": 6,
  "c-v7": 7,
  "a-v6": 6,
  "b-v7": 7,
  unified: 8,
  mixed: -1,
  tampered: -1,
  unknown: -1,
};

const sortIds = (ids: CapabilityId[]) => [...ids].sort();

/** 已知可识别谱系 = 精确的 present 集合。其余一律拒绝（mixed/unknown）。 */
function classifyPresent(present: CapabilityId[]): MigrationLineage {
  const key = sortIds(present).join(",");
  // 键必须与 sortIds 的字典序一致：'-'(0x2D) < 'h' < 'o'，故 c-run < check-report < common < knowledge-wiki。
  const expected = new Map<string, MigrationLineage>([
    ["", "empty"],
    ["common:1", "common-v1"],
    ["common:1,common:2", "common-v2"],
    ["common:1,common:2,common:3", "common-v3"],
    ["common:1,common:2,common:3,common:4", "a01b-v4"],
    ["c-run:5,common:1,common:2,common:3,common:4", "c-v5"],
    ["c-run:5,c-run:6,common:1,common:2,common:3,common:4", "c-v6"],
    ["c-run:5,c-run:6,c-run:7,common:1,common:2,common:3,common:4", "c-v7"],
    ["common:1,common:2,common:3,common:4,knowledge-wiki:6", "a-v6"],
    [
      "check-report:7,common:1,common:2,common:3,common:4,knowledge-wiki:6",
      "b-v7",
    ],
    [
      "c-run:5,c-run:6,c-run:7,check-report:7,common:1,common:2,common:3,common:4,knowledge-wiki:6",
      "unified",
    ],
  ]);
  if (expected.has(key)) return expected.get(key)!;
  const hasRun = present.some((id) => id.startsWith("c-run:"));
  const hasKnowOrReport = present.some(
    (id) => id.startsWith("knowledge-wiki:") || id.startsWith("check-report:"),
  );
  return hasRun && hasKnowOrReport ? "mixed" : "unknown";
}

/**
 * 依据实际 schema 对象 + user_version 识别谱系。识别只读，不写任何内容。
 */
export function identifyLineage(input: {
  userVersion: number;
  objects: SchemaObject[];
  columns: Record<string, string[]>;
  foreignKeys?: ForeignKeyRef[];
}): Identification {
  const tables = new Set<string>();
  const tableSql = new Map<string, string>();
  const indexSql = new Map<string, string>();
  const indexTable = new Map<string, string>();
  const triggerSql = new Map<string, string>();
  const triggerTable = new Map<string, string>();
  for (const obj of input.objects) {
    if (obj.type === "table") {
      tables.add(obj.name);
      tableSql.set(obj.name, obj.sql ?? "");
    } else if (obj.type === "index") {
      indexSql.set(obj.name, obj.sql ?? "");
      indexTable.set(obj.name, obj.tbl_name);
    } else if (obj.type === "trigger") {
      triggerSql.set(obj.name, obj.sql ?? "");
      triggerTable.set(obj.name, obj.tbl_name);
    }
  }
  const foreignKeys = input.foreignKeys ?? [];

  const statuses = {} as Record<CapabilityId, CapabilityStatus>;
  const present: CapabilityId[] = [];
  const partial: CapabilityId[] = [];
  for (const cap of CAPABILITIES) {
    const id = capabilityId(cap);
    const status = capabilityStatus(
      cap,
      tables,
      tableSql,
      indexSql,
      indexTable,
      triggerSql,
      triggerTable,
      input.columns,
      foreignKeys,
    );
    statuses[id] = status;
    if (status === "present") present.push(id);
    else if (status === "partial") partial.push(id);
  }

  // 部分存在（缺必要列/触发器/索引/属性）即视为被篡改/不完整，拒绝而非静默放行。
  if (partial.length > 0) {
    return { lineage: "tampered", statuses, present, partial, expectedUserVersion: -1 };
  }

  const lineage = classifyPresent(present);
  const expectedUserVersion = LINEAGE_VERSION[lineage];

  // user_version 交叉核对：谱系确定后，编号必须与该谱系一致，否则拒绝。
  // 这同时封死“未知 v6 被误接受”（v6 既不是 c-v6 也不是 a-v6 schema）。
  if (lineage === "mixed" || lineage === "tampered" || lineage === "unknown") {
    return { lineage, statuses, present, partial, expectedUserVersion };
  }
  if (input.userVersion !== expectedUserVersion) {
    return {
      lineage: "unknown",
      statuses,
      present,
      partial,
      expectedUserVersion: -1,
    };
  }

  return { lineage, statuses, present, partial, expectedUserVersion };
}
