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
 * 不可变触发器有效定义——封死 D2 静默缺表、D3 按 v6 误记知识迁移、“未知 v6 被误接受”、
 * “缺不可变触发器仍被接受”，以及 C 首轮核验发现的列改名（N07）、同名空触发器（N08）与
 * 非唯一索引（N09）三类缺陷。
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

/** 索引要求：名称 + 是否必须唯一/部分。 */
export interface IndexRequirement {
  name: string;
  /** 必须是唯一索引（如 agent_write_once 的一次写保护）。 */
  unique?: boolean;
  /** 必须是部分索引（CREATE INDEX 含 WHERE 子句）。 */
  partial?: boolean;
}

/** 触发器要求：名称 + 是否必须含 RAISE 的有效不可变保护。 */
export interface TriggerRequirement {
  name: string;
  /** 必须包含 RAISE(ABORT,...) 的有效保护定义；同名 SELECT 1 空触发器不算。 */
  raises?: boolean;
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
      { name: "quote_v1_no_update", raises: true },
      { name: "quote_v1_no_delete", raises: true },
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
      { name: "quote_revision_no_update", raises: true },
      { name: "quote_revision_no_delete", raises: true },
      { name: "agent_turn_no_update", raises: true },
      { name: "agent_turn_no_delete", raises: true },
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
    indexes: [{ name: "knowledge_revision_document" }],
    triggers: [
      { name: "knowledge_revision_no_update", raises: true },
      { name: "knowledge_revision_no_delete", raises: true },
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
    indexes: [{ name: "agent_run_discovery" }],
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
    indexes: [{ name: "agent_write_once", unique: true, partial: true }],
    triggers: [
      { name: "agent_write_committed_no_update", raises: true },
      { name: "agent_write_no_delete", raises: true },
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
  },
  {
    lineage: "c-run",
    version: 7,
    tables: ["agent_tool_step"],
    indexes: [],
    triggers: [
      { name: "agent_tool_step_no_update", raises: true },
      { name: "agent_tool_step_no_delete", raises: true },
    ],
    columns: {
      agent_tool_step: ["run_id", "attempt", "tool_call_id", "ordinal", "data_json"],
      agent_write_call: ["validation_json"],
    },
  },
  {
    lineage: "knowledge-wiki",
    version: 6,
    tables: ["knowledge_source", "knowledge_wiki", "knowledge_lifecycle", "knowledge_consumption"],
    indexes: [
      { name: "knowledge_source_document" },
      { name: "knowledge_wiki_document" },
      { name: "knowledge_lifecycle_state" },
    ],
    triggers: [
      { name: "knowledge_wiki_no_update", raises: true },
      { name: "knowledge_wiki_no_delete", raises: true },
      { name: "knowledge_consumption_no_update", raises: true },
      { name: "knowledge_consumption_no_delete", raises: true },
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
    indexes: [{ name: "quote_check_report_history" }],
    triggers: [
      { name: "quote_check_report_revision", raises: true },
      { name: "quote_check_report_no_update", raises: true },
      { name: "quote_check_report_no_delete", raises: true },
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

function capabilityStatus(
  cap: CapabilitySpec,
  tables: Set<string>,
  indexSql: Map<string, string>,
  triggerSql: Map<string, string>,
  columns: Record<string, string[]>,
): CapabilityStatus {
  const tablesOk = cap.tables.every((t) => hasTable(t, tables));
  if (!tablesOk) return "absent";
  const columnsOk = Object.entries(cap.columns).every(([table, cols]) =>
    cols.every((c) => hasColumn(table, c, columns)),
  );
  const indexesOk = cap.indexes.every((req) => {
    const sql = indexSql.get(req.name);
    if (sql === undefined) return false;
    if (req.unique && !/\bUNIQUE\b/i.test(sql)) return false;
    if (req.partial && !/\bWHERE\b/i.test(sql)) return false;
    return true;
  });
  const triggersOk = cap.triggers.every((req) => {
    const sql = triggerSql.get(req.name);
    if (sql === undefined) return false;
    if (req.raises && !/\bRAISE\b/i.test(sql)) return false;
    return true;
  });
  return columnsOk && indexesOk && triggersOk ? "present" : "partial";
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
}): Identification {
  const tables = new Set<string>();
  const indexSql = new Map<string, string>();
  const triggerSql = new Map<string, string>();
  for (const obj of input.objects) {
    if (obj.type === "table") tables.add(obj.name);
    else if (obj.type === "index") indexSql.set(obj.name, obj.sql ?? "");
    else if (obj.type === "trigger") triggerSql.set(obj.name, obj.sql ?? "");
  }

  const statuses = {} as Record<CapabilityId, CapabilityStatus>;
  const present: CapabilityId[] = [];
  const partial: CapabilityId[] = [];
  for (const cap of CAPABILITIES) {
    const id = capabilityId(cap);
    const status = capabilityStatus(cap, tables, indexSql, triggerSql, input.columns);
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
