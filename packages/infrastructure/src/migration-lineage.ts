import { createHash } from "node:crypto";

/**
 * A01c 迁移谱系识别（纯函数，不依赖 better-sqlite3）。
 *
 * 背景：C 的迁移 5/6/7 是 run 表（agent_run/agent_run_control、agent_write_call、
 * agent_tool_step），A/B 的迁移 6/7 是知识四表与 quote_check_report。两边 user_version
 * 都是 7 时 schema 不同，且单个 version 无法同时表达 C6 与 A6、C7 与 B7。
 *
 * 因此识别只以实际 schema（表/索引/触发器/列）为准，user_version 仅作交叉核对，
 * 绝不单独依据编号判定谱系——这直接封死 D2 静默缺表、D3 按 v6 误记知识迁移、
 * “未知 v6 被误接受”与“缺不可变触发器仍被接受”四类缺陷。
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

/** 一个能力切片对 schema 对象的最低要求。 */
export interface CapabilitySpec {
  lineage: CapabilityLineage;
  version: number;
  /** 必须存在的表。 */
  tables: string[];
  /** 必须存在的索引。 */
  indexes: string[];
  /** 必须存在的触发器（不可变保护等）。 */
  triggers: string[];
  /** 必须存在的列：table -> column[]（用于 ALTER 类步骤，如 validation_json）。 */
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
    columns: {},
  },
  {
    lineage: "common",
    version: 2,
    tables: ["scenario_revision", "catalog_batch", "catalog_product", "quote_v1"],
    indexes: [],
    triggers: ["quote_v1_no_update", "quote_v1_no_delete"],
    columns: {},
  },
  {
    lineage: "common",
    version: 3,
    tables: ["quote_revision", "agent_turn"],
    indexes: [],
    triggers: [
      "quote_revision_no_update",
      "quote_revision_no_delete",
      "agent_turn_no_update",
      "agent_turn_no_delete",
    ],
    columns: {},
  },
  {
    lineage: "common",
    version: 4,
    tables: ["knowledge_revision"],
    indexes: ["knowledge_revision_document"],
    triggers: ["knowledge_revision_no_update", "knowledge_revision_no_delete"],
    columns: {},
  },
  {
    lineage: "c-run",
    version: 5,
    tables: ["agent_run", "agent_run_control"],
    indexes: ["agent_run_discovery"],
    triggers: [],
    columns: {},
  },
  {
    lineage: "c-run",
    version: 6,
    tables: ["agent_write_call"],
    indexes: ["agent_write_once"],
    triggers: ["agent_write_committed_no_update", "agent_write_no_delete"],
    columns: {},
  },
  {
    lineage: "c-run",
    version: 7,
    tables: ["agent_tool_step"],
    indexes: [],
    triggers: ["agent_tool_step_no_update", "agent_tool_step_no_delete"],
    columns: { agent_write_call: ["validation_json"] },
  },
  {
    lineage: "knowledge-wiki",
    version: 6,
    tables: ["knowledge_source", "knowledge_wiki", "knowledge_lifecycle", "knowledge_consumption"],
    indexes: ["knowledge_source_document", "knowledge_wiki_document", "knowledge_lifecycle_state"],
    triggers: [
      "knowledge_wiki_no_update",
      "knowledge_wiki_no_delete",
      "knowledge_consumption_no_update",
      "knowledge_consumption_no_delete",
    ],
    columns: {},
  },
  {
    lineage: "check-report",
    version: 7,
    tables: ["quote_check_report"],
    indexes: ["quote_check_report_history"],
    triggers: [
      "quote_check_report_revision",
      "quote_check_report_no_update",
      "quote_check_report_no_delete",
    ],
    columns: {},
  },
];

export type CapabilityId = `${CapabilityLineage}:${number}`;

export const capabilityId = (cap: Pick<CapabilitySpec, "lineage" | "version">): CapabilityId =>
  `${cap.lineage}:${cap.version}`;

/** 每个能力切片的身份；用于账本唯一键，区分 C6 与 A6、C7 与 B7。 */
export type CapabilityStatus = "absent" | "present" | "partial";

export interface Identification {
  lineage: MigrationLineage;
  /** 每个能力切片的对象级状态。 */
  statuses: Record<CapabilityId, CapabilityStatus>;
  /** 已完整存在的能力。 */
  present: CapabilityId[];
  /** 存在部分对象但缺触发器/索引/列的能力（tampered 依据）。 */
  partial: CapabilityId[];
  /** 该谱系应具备的 user_version（unified 为 8）。 */
  expectedUserVersion: number;
}

const hasTable = (name: string, tables: Set<string>) => tables.has(name);
const hasIndex = (name: string, indexes: Set<string>) => indexes.has(name);
const hasTrigger = (name: string, triggers: Set<string>) => triggers.has(name);
const hasColumn = (table: string, column: string, columns: Record<string, string[]>) =>
  (columns[table] ?? []).includes(column);

function capabilityStatus(
  cap: CapabilitySpec,
  tables: Set<string>,
  indexes: Set<string>,
  triggers: Set<string>,
  columns: Record<string, string[]>,
): CapabilityStatus {
  const tablesOk = cap.tables.every((t) => hasTable(t, tables));
  if (!tablesOk) return "absent";
  const indexesOk = cap.indexes.every((i) => hasIndex(i, indexes));
  const triggersOk = cap.triggers.every((t) => hasTrigger(t, triggers));
  const columnsOk = Object.entries(cap.columns).every(([table, cols]) =>
    cols.every((c) => hasColumn(table, c, columns)),
  );
  return indexesOk && triggersOk && columnsOk ? "present" : "partial";
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
    ["check-report:7,common:1,common:2,common:3,common:4,knowledge-wiki:6", "b-v7"],
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
  const indexes = new Set<string>();
  const triggers = new Set<string>();
  for (const obj of input.objects) {
    if (obj.type === "table") tables.add(obj.name);
    else if (obj.type === "index") indexes.add(obj.name);
    else if (obj.type === "trigger") triggers.add(obj.name);
  }

  const statuses = {} as Record<CapabilityId, CapabilityStatus>;
  const present: CapabilityId[] = [];
  const partial: CapabilityId[] = [];
  for (const cap of CAPABILITIES) {
    const id = capabilityId(cap);
    const status = capabilityStatus(cap, tables, indexes, triggers, input.columns);
    statuses[id] = status;
    if (status === "present") present.push(id);
    else if (status === "partial") partial.push(id);
  }

  // 部分存在（缺触发器/索引/列）即视为被篡改/不完整，拒绝而非静默放行。
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
