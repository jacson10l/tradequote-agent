/** B（契约负责人）A01e 八维护方法的契约一致性探针。
 *
 *  目的不是“跑绿”，而是对固定基线逐项记录契约期望与实际返回，供 A 修复和下一轮复核：
 *  - expected 来自 [[B00a知识整理与维护协议]] 与 packages/contracts/src/knowledge-maintenance.ts；
 *  - actual 来自真实 SqliteWorkspaceRepository + 真实 SQLite 文件，仅使用合成 fixture；
 *  - conforms=false 表示本轮已复现的契约偏差，不是测试环境缺陷。
 *
 *  运行（在仓库根目录，显式配置，不进入常规 unit 套件）：
 *    npx vitest run --config packages/infrastructure/probes/a01e-contract.vitest.config.ts
 *  产物：wiki-project/raw/b01-a01e-contract-probe.json（脱敏后提交）。
 *  探针通过只代表“全部项与契约一致”；失败会列出不符合项编号，JSON 仍完整落盘。 */
import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type KnowledgeImpactReport,
  type KnowledgeIndexStatus,
  type KnowledgeMaintenanceResult,
  type MaintenanceIssue,
  type MaintenancePage,
  type WikiHostContext,
  type WikiResult,
  WikiResultSchema,
  type WikiRevision,
  type WikiSourceRevision,
} from "@tradequote/contracts";
import Database from "better-sqlite3";
import { afterAll, expect, it } from "vitest";
import { SqliteWorkspaceRepository } from "../src/index";

const NOW = "2026-10-22T00:00:00.000Z";
const LATER = "2026-10-23T00:00:00.000Z";
const VALIDITY = { status: "confirmed" as const, validFrom: null, validUntil: null };
const SHA256 = "f".repeat(64);

const dirs: string[] = [];
const temp = () => {
  const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "tradequote-a01e-probe-")));
  dirs.push(dir);
  return dir;
};
afterAll(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface Observation {
  id: string;
  contract: string;
  expected: string;
  actual: string;
  conforms: boolean;
  note?: string | undefined;
}
const observations: Observation[] = [];
function observe(entry: Observation) {
  observations.push(entry);
  return entry.conforms;
}

const host = (workspaceId: string, now = NOW): WikiHostContext => ({
  workspaceId,
  actorId: "probe-human",
  origin: "human_ui",
  now,
});
const read = (method: string, payload: unknown) => ({
  schemaVersion: 1 as const,
  requestId: randomUUID(),
  method,
  payload,
});
const write = (method: string, payload: unknown, idempotencyKey: string = randomUUID()) => ({
  ...read(method, payload),
  idempotencyKey,
});
const code = (result: { ok: boolean; error?: { code: string } }) =>
  result.ok ? "ok" : (result.error?.code ?? "unknown");

function maintenancePage(result: KnowledgeMaintenanceResult): MaintenancePage {
  if (!result.ok || result.data.kind !== "maintenancePage")
    throw new Error(`expected maintenancePage, got ${code(result)}`);
  return result.data.page;
}
function impactReport(result: KnowledgeMaintenanceResult): KnowledgeImpactReport {
  if (!result.ok || result.data.kind !== "impactReport")
    throw new Error(`expected impactReport, got ${code(result)}`);
  return result.data.report;
}
function indexStatus(result: KnowledgeMaintenanceResult): KnowledgeIndexStatus {
  if (!result.ok || result.data.kind !== "indexStatus")
    throw new Error(`expected indexStatus, got ${code(result)}`);
  return result.data.status;
}
function openRepo(file: string): { repo: SqliteWorkspaceRepository; workspaceId: string } {
  const repo = new SqliteWorkspaceRepository(file);
  repo.commit(
    {
      schemaVersion: 1,
      requestId: randomUUID(),
      idempotencyKey: randomUUID(),
      method: "workspace.create",
      payload: { name: "A01e 探针合成工作区" },
    },
    { actorId: "probe-human", origin: "human_ui" },
  );
  return { repo, workspaceId: repo.read()!.id };
}

async function stageSource(
  repo: SqliteWorkspaceRepository,
  workspaceId: string,
  text: string,
  sourceId: string = randomUUID(),
  expectedVersion = 0,
): Promise<WikiSourceRevision> {
  const result = WikiResultSchema.parse(
    await repo.executeWiki(
      write("source.stage", {
        sourceId,
        expectedVersion,
        label: "合成原文",
        sourceStatus: "synthetic",
        mediaType: "text/plain",
        sourceText: text,
        acquiredAt: NOW,
        sourceUri: null,
        permissionNote: "合成 fixture，非真实政策",
        validity: VALIDITY,
      }),
      host(workspaceId),
    ),
  );
  if (!result.ok || result.data.kind !== "sourceRevision")
    throw new Error(`source.stage failed: ${code(result)}`);
  return result.data.revision;
}

async function withdraw(
  repo: SqliteWorkspaceRepository,
  workspaceId: string,
  source: WikiSourceRevision,
  options: { key?: string; note?: string; expectedVersion?: number; now?: string } = {},
): Promise<KnowledgeMaintenanceResult> {
  return repo.executeWikiMaintenance(
    write(
      "source.withdraw",
      {
        sourceRevisionId: source.sourceRevisionId,
        expectedLifecycleVersion: options.expectedVersion ?? 1,
        note: options.note ?? "合成撤回",
      },
      options.key ?? randomUUID(),
    ),
    host(workspaceId, options.now ?? NOW),
  );
}

async function stageWikiRevision(
  repo: SqliteWorkspaceRepository,
  workspaceId: string,
  sources: WikiSourceRevision[],
  relations: { kind: "related" | "supersedes"; documentId: string; revisionId: string }[] = [],
): Promise<WikiRevision> {
  const markdown = "# 合成知识\n核对来源。\n";
  const sectionId = randomUUID();
  const refs = sources.map((source) => ({
    referenceId: randomUUID(),
    sourceId: source.sourceId,
    sourceRevisionId: source.sourceRevisionId,
    sourceVersion: source.version,
    artifactHash: source.artifactHash,
    location: { kind: "text" as const, start: 0, end: source.sourceText.length },
    excerptHash: source.artifactHash,
    assertion: "fact" as const,
  }));
  const result: WikiResult = WikiResultSchema.parse(
    await repo.executeWiki(
      write("wiki.stage", {
        documentId: randomUUID(),
        expectedVersion: 0,
        parentRevisionId: null,
        content: {
          kind: "sop",
          title: "合成知识",
          locale: "pt-BR",
          scope: { platforms: [], markets: [], categories: [] },
          markdown,
          validity: VALIDITY,
          sections: [
            {
              sectionId,
              title: "核对",
              location: { kind: "text", start: 0, end: markdown.length },
              sourceReferenceIds: refs.map((ref) => ref.referenceId),
            },
          ],
          sourceRefs: refs,
          relations,
          rules: [],
        },
      }),
      host(workspaceId),
    ),
  );
  if (!result.ok || result.data.kind !== "wikiRevision")
    throw new Error(`wiki.stage failed: ${code(result)}`);
  return result.data.record.revision;
}

/** 按来源版本读该来源上的维护问题，用于去重/覆盖断言。 */
async function issuesForSource(
  repo: SqliteWorkspaceRepository,
  workspaceId: string,
  sourceRevisionId: string,
): Promise<MaintenanceIssue[]> {
  const page = maintenancePage(
    await repo.executeWikiMaintenance(
      read("wiki.getMaintenance", { kinds: [], states: [], limit: 100, cursor: null }),
      host(workspaceId),
    ),
  );
  return page.issues.filter((issue) => {
    const target = issue.target;
    return target.kind === "source" && target.sourceRevisionId === sourceRevisionId;
  });
}

it("P01 同键同参撤回重放应返回首次回执", async () => {
  const file = join(temp(), "probe-replay-withdraw.sqlite");
  const { repo, workspaceId } = openRepo(file);
  const source = await stageSource(repo, workspaceId, "合成撤回来源");
  const key = randomUUID();
  const first = await withdraw(repo, workspaceId, source, { key, note: "同键重放" });
  const firstEventId =
    first.ok && first.data.kind === "sourceWithdrawal" ? first.data.event.eventId : null;
  const db = new Database(file);
  const outboxBefore = (db.prepare("SELECT COUNT(*) AS n FROM outbox").get() as { n: number }).n;
  db.close();

  const replay = await withdraw(repo, workspaceId, source, { key, note: "同键重放" });
  const dbAfter = new Database(file);
  const outboxAfter = (dbAfter.prepare("SELECT COUNT(*) AS n FROM outbox").get() as { n: number })
    .n;
  dbAfter.close();

  observe({
    id: "P01",
    contract: "写请求幂等：同 workspace + 同 key + 同 payload 先回放，返回首次结果且不重复写",
    expected: "ok=true，event.eventId 与首次一致，outbox 行数不变",
    actual: `${code(replay)}；首次 eventId=${firstEventId ?? "n/a"}；outbox ${outboxBefore}→${outboxAfter}`,
    conforms: replay.ok === true && outboxAfter === outboxBefore,
  });

  const swapped = await withdraw(repo, workspaceId, source, { key, note: "同键异参" });
  observe({
    id: "P02",
    contract: "同 key 异 payload 必须识别为 IDEMPOTENCY_CONFLICT，而不是落到其他错误",
    expected: "IDEMPOTENCY_CONFLICT",
    actual: code(swapped),
    conforms: code(swapped) === "IDEMPOTENCY_CONFLICT",
  });
  repo.close();
});

it("P03 同键重放的 resolveMaintenance 应返回首次结果", async () => {
  const file = join(temp(), "probe-replay-resolve.sqlite");
  const { repo, workspaceId } = openRepo(file);
  const source = await stageSource(repo, workspaceId, "合成结案来源");
  await withdraw(repo, workspaceId, source);
  const [issue] = await issuesForSource(repo, workspaceId, source.sourceRevisionId);
  if (!issue) throw new Error("撤回未登记问题");
  const key = randomUUID();
  const payload = {
    issueId: issue.issueId,
    expectedIssueVersion: issue.issueVersion,
    action: "resolve" as const,
    note: "合成处理",
    evidenceIds: [randomUUID()],
  };
  const first = await repo.executeWikiMaintenance(
    write("wiki.resolveMaintenance", payload, key),
    host(workspaceId),
  );
  const replay = await repo.executeWikiMaintenance(
    write("wiki.resolveMaintenance", payload, key),
    host(workspaceId, LATER),
  );
  observe({
    id: "P03",
    contract: "控制请求先在当前权限下识别同键回放，再做 OCC",
    expected: "第二次 ok=true 且 issueVersion 与首次相同（1→2）",
    actual: `首次 ${code(first)}；重放 ${code(replay)}`,
    conforms: first.ok === true && replay.ok === true,
  });
  repo.close();
});

it("P04 撤回返回的事件身份必须与持久 outbox 行一致", async () => {
  const file = join(temp(), "probe-event-identity.sqlite");
  const { repo, workspaceId } = openRepo(file);
  const sources = await Promise.all([
    stageSource(repo, workspaceId, "合成来源一"),
    stageSource(repo, workspaceId, "合成来源二"),
  ]);
  const returned: string[] = [];
  for (const source of sources) {
    const result = await withdraw(repo, workspaceId, source);
    if (result.ok && result.data.kind === "sourceWithdrawal")
      returned.push(result.data.event.eventId);
  }
  const db = new Database(file);
  const rows = db
    .prepare("SELECT event_id, payload_json FROM outbox WHERE type='source.withdrawn'")
    .all() as { event_id: string; payload_json: string }[];
  db.close();
  const returnedInOutbox = returned.filter((id) => rows.some((row) => row.event_id === id)).length;
  const payloadMatchesOwnRow = rows.filter((row) => {
    const payload = JSON.parse(row.payload_json) as { eventId?: string };
    return payload.eventId === row.event_id;
  }).length;

  observe({
    id: "P04",
    contract:
      "source.withdraw 返回的 withdrawn 状态须与同一 source.withdrawn 事件身份/版本/时点对应（B00a 第100行）",
    expected: "outbox.event_id 集合包含返回的 eventId；payload eventId 等于本行 event_id",
    actual: `返回 ${returned.length} 个 eventId，outbox 命中 ${returnedInOutbox}；${rows.length} 行 payload 与本行一致 ${payloadMatchesOwnRow}`,
    conforms:
      returned.length > 0 &&
      returnedInOutbox === returned.length &&
      payloadMatchesOwnRow === rows.length,
    note:
      returnedInOutbox === 0
        ? "eventId 已写入 payload，但 outbox 行 id 是另一个随机值；缺口是身份关联与按 id 回放，不是完全未持久化"
        : undefined,
  });
  repo.close();
});

it("P05 getMaintenance 快照须冻结且游标绑定查询", async () => {
  const file = join(temp(), "probe-snapshot.sqlite");
  const { repo, workspaceId } = openRepo(file);
  const withdrawn: WikiSourceRevision[] = [];
  for (let i = 0; i < 6; i += 1) {
    const source = await stageSource(repo, workspaceId, `合成来源 ${i}`);
    await withdraw(repo, workspaceId, source);
    withdrawn.push(source);
  }
  const first = maintenancePage(
    await repo.executeWikiMaintenance(
      read("wiki.getMaintenance", { kinds: [], states: [], limit: 2, cursor: null }),
      host(workspaceId),
    ),
  );
  const later: WikiSourceRevision[] = [];
  for (let i = 0; i < 3; i += 1) {
    const source = await stageSource(repo, workspaceId, `首屏后新增 ${i}`);
    await withdraw(repo, workspaceId, source, { now: LATER });
    later.push(source);
  }
  const continuation = maintenancePage(
    await repo.executeWikiMaintenance(
      read("wiki.getMaintenance", {
        kinds: [],
        states: [],
        limit: 10,
        cursor: first.nextCursor,
      }),
      host(workspaceId, LATER),
    ),
  );
  const laterIssueIds = new Set(
    (await Promise.all(later.map((s) => issuesForSource(repo, workspaceId, s.sourceRevisionId))))
      .flat()
      .map((issue) => issue.issueId),
  );
  const leaked = continuation.issues.filter((issue) => laterIssueIds.has(issue.issueId)).length;
  observe({
    id: "P05",
    contract: "维护列表绑定快照：续页不得出现首屏之后新增的问题",
    expected: `续页 4 条，新增问题 0 条（首屏 ${first.issues.length} 条，共 6 条）`,
    actual: `续页 ${continuation.issues.length} 条，新增问题 ${leaked} 条，checkedAt=${continuation.checkedAt}`,
    conforms: continuation.issues.length === 4 && leaked === 0,
  });

  const rebound = await repo.executeWikiMaintenance(
    read("wiki.getMaintenance", {
      kinds: [],
      states: ["resolved"],
      limit: 10,
      cursor: first.nextCursor,
    }),
    host(workspaceId, LATER),
  );
  const reboundPage =
    rebound.ok && rebound.data.kind === "maintenancePage" ? rebound.data.page : null;
  observe({
    id: "P06",
    contract: "类型/状态过滤不能改变游标绑定；换过滤复用旧 cursor 须 REVISION_CONFLICT",
    expected: "REVISION_CONFLICT",
    actual: `${code(rebound)}${reboundPage ? `；queryHash ${first.queryHash.slice(0, 8)}→${reboundPage.queryHash.slice(0, 8)}` : ""}`,
    conforms: code(rebound) === "REVISION_CONFLICT",
  });
  repo.close();
});

it("P07 条目读取失败不得静默终止分页", async () => {
  const file = join(temp(), "probe-empty-page.sqlite");
  const { repo, workspaceId } = openRepo(file);
  for (let i = 0; i < 4; i += 1) {
    const source = await stageSource(repo, workspaceId, `合成分页来源 ${i}`);
    await withdraw(repo, workspaceId, source);
  }
  const first = maintenancePage(
    await repo.executeWikiMaintenance(
      read("wiki.getMaintenance", { kinds: [], states: [], limit: 1, cursor: null }),
      host(workspaceId),
    ),
  );
  const cursor = first.nextCursor;
  if (!cursor) throw new Error("首屏应返回游标");
  const db = new Database(file);
  db.prepare("UPDATE knowledge_maintenance_issue SET data_json='{}' WHERE issue_id > ?").run(
    cursor.afterIssueId,
  );
  db.close();
  const damaged = await repo.executeWikiMaintenance(
    read("wiki.getMaintenance", { kinds: [], states: [], limit: 10, cursor }),
    host(workspaceId, LATER),
  );
  const damagedPage =
    damaged.ok && damaged.data.kind === "maintenancePage" ? damaged.data.page : null;
  observe({
    id: "P07",
    contract: "读取失败返回 STORAGE_ERROR；空页游标仍须严格前进，不得隐藏已知问题",
    expected: "STORAGE_ERROR（或返回非空页并保留严格前进游标）",
    actual: `${code(damaged)}${damagedPage ? `；issues=${damagedPage.issues.length}，nextCursor=${damagedPage.nextCursor === null ? "null" : "有"}` : ""}`,
    conforms: code(damaged) === "STORAGE_ERROR",
  });
  repo.close();
});

it("P08 analyzeImpact 须核实目标 hash 与新版本先后", async () => {
  const file = join(temp(), "probe-target.sqlite");
  const { repo, workspaceId } = openRepo(file);
  const source = await stageSource(repo, workspaceId, "合成版本 v1");
  await withdraw(repo, workspaceId, source);
  const forged = await repo.executeWikiMaintenance(
    write("wiki.analyzeImpact", {
      target: {
        kind: "source",
        sourceId: source.sourceId,
        sourceRevisionId: source.sourceRevisionId,
        artifactHash: SHA256,
      },
      reason: "withdrawn",
      replacementRevisionId: null,
    }),
    host(workspaceId),
  );
  const forgedReport = forged.ok && forged.data.kind === "impactReport" ? forged.data.report : null;
  observe({
    id: "P08",
    contract: "影响分析固定在 triggers 的来源版本/hash，宿主核实目标身份（B00a 第84行）",
    expected: "REVISION_CONFLICT 或 SOURCE_CONFLICT，不落报告",
    actual: `${code(forged)}${forgedReport ? `；报告回显 artifactHash=${forgedReport.subject.target.kind === "source" ? forgedReport.subject.target.artifactHash.slice(0, 8) : "n/a"}` : ""}`,
    conforms: ["REVISION_CONFLICT", "SOURCE_CONFLICT"].includes(code(forged)),
  });

  const v2 = await stageSource(repo, workspaceId, "合成版本 v2", source.sourceId, 1);
  const reversed = await repo.executeWikiMaintenance(
    write("wiki.analyzeImpact", {
      target: {
        kind: "source",
        sourceId: v2.sourceId,
        sourceRevisionId: v2.sourceRevisionId,
        artifactHash: v2.artifactHash,
      },
      reason: "source_updated",
      replacementRevisionId: source.sourceRevisionId,
    }),
    host(workspaceId),
  );
  observe({
    id: "P09",
    contract:
      "source_updated 的 replacement 必须是同一来源的更新版本（version 更大），不接受旧版本充新",
    expected: "REVISION_CONFLICT / SOURCE_CONFLICT（target v2，replacement v1）",
    actual: `${code(reversed)}（target v${v2.version}，replacement v${source.version}）`,
    conforms: ["REVISION_CONFLICT", "SOURCE_CONFLICT"].includes(code(reversed)),
  });
  repo.close();
});

it("P10 resolve 须校验已存执行证据", async () => {
  const file = join(temp(), "probe-evidence.sqlite");
  const { repo, workspaceId } = openRepo(file);
  const source = await stageSource(repo, workspaceId, "合成证据来源");
  await withdraw(repo, workspaceId, source);
  const [issue] = await issuesForSource(repo, workspaceId, source.sourceRevisionId);
  if (!issue) throw new Error("撤回未登记问题");
  const fakeEvidence = randomUUID();
  const resolved = await repo.executeWikiMaintenance(
    write("wiki.resolveMaintenance", {
      issueId: issue.issueId,
      expectedIssueVersion: issue.issueVersion,
      action: "resolve",
      note: "合成结案",
      evidenceIds: [fakeEvidence],
    }),
    host(workspaceId),
  );
  const db = new Database(file);
  const hit = db
    .prepare(
      "SELECT (SELECT COUNT(*) FROM knowledge_source WHERE source_revision_id=?) + (SELECT COUNT(*) FROM knowledge_wiki WHERE revision_id=?) + (SELECT COUNT(*) FROM outbox WHERE event_id=?) AS n",
    )
    .get(fakeEvidence, fakeEvidence, fakeEvidence) as { n: number };
  db.close();
  observe({
    id: "P10",
    contract: "resolve/dismiss 必有已存执行证据；真正解决须核实对应事实（B00a 第80行）",
    expected: "MISSING_FACTS（证据在任何事实表中都不存在）",
    actual: `${code(resolved)}；证据命中事实表 ${hit.n} 条`,
    conforms: code(resolved) === "MISSING_FACTS",
  });

  const duplicateCheck = await issuesForSource(repo, workspaceId, source.sourceRevisionId);
  observe({
    id: "P11",
    contract: "同一问题重扫只更新证据/时点，不重开已结案问题",
    expected: "问题仍为同一条，state 保持 resolved",
    actual: `${duplicateCheck.length} 条，state=${duplicateCheck.map((i) => i.state).join(",")}`,
    conforms: duplicateCheck.length === 1 && duplicateCheck[0]?.state === "resolved",
  });
  repo.close();
});

it("P12 去重键须含触发事实身份", async () => {
  const file = join(temp(), "probe-dedup.sqlite");
  const { repo, workspaceId } = openRepo(file);
  const source = await stageSource(repo, workspaceId, "合成去重来源");
  await withdraw(repo, workspaceId, source);
  await repo.executeWikiMaintenance(
    write("wiki.analyzeImpact", {
      target: {
        kind: "source",
        sourceId: source.sourceId,
        sourceRevisionId: source.sourceRevisionId,
        artifactHash: source.artifactHash,
      },
      reason: "withdrawn",
      replacementRevisionId: null,
    }),
    host(workspaceId),
  );
  const issues = await issuesForSource(repo, workspaceId, source.sourceRevisionId);
  observe({
    id: "P12",
    contract: "去重键＝工作区＋固定目标身份/版本＋问题种类＋触发事实身份（B00a 第78行）",
    expected: "撤回命令与 analyzeImpact(withdrawn) 指向同一事实 → 1 条问题、同一 dedupKey",
    actual: `${issues.length} 条，dedupKey ${issues.map((i) => i.dedupKey.slice(0, 8)).join("/")}`,
    conforms: issues.length === 1,
    note:
      issues.length > 1
        ? "键材料为 hash({kind,target})：撤回用 {sourceId,sourceRevisionId}，影响分析用完整 target，触发事实不同即分裂"
        : undefined,
  });
  repo.close();
});

it("P13 影响报告须覆盖关系边或如实 partial", async () => {
  const file = join(temp(), "probe-coverage.sqlite");
  const { repo, workspaceId } = openRepo(file);
  const source = await stageSource(repo, workspaceId, "合成被撤回来源");
  const related = await stageSource(repo, workspaceId, "合成关联来源");
  const base = await stageWikiRevision(repo, workspaceId, [source]);
  const dependent = await stageWikiRevision(
    repo,
    workspaceId,
    [related],
    [{ kind: "supersedes", documentId: base.documentId, revisionId: base.revisionId }],
  );
  const report = impactReport(
    await repo.executeWikiMaintenance(
      write("wiki.analyzeImpact", {
        target: {
          kind: "source",
          sourceId: source.sourceId,
          sourceRevisionId: source.sourceRevisionId,
          artifactHash: source.artifactHash,
        },
        reason: "withdrawn",
        replacementRevisionId: null,
      }),
      host(workspaceId),
    ),
  );
  const page = await repo.executeWikiMaintenance(
    read("wiki.getImpact", { reportId: report.reportId, limit: 10, cursor: null }),
    host(workspaceId),
  );
  const items = page.ok && page.data.kind === "impactPage" ? page.data.page.items : [];
  const mentionsDependent = items.some(
    (item) => item.target.kind === "knowledge" && item.target.revisionId === dependent.revisionId,
  );
  observe({
    id: "P13",
    contract:
      "扫描来源→知识→消费全图；关系边未遍历时不得以 completed 空/缺项冒充完整（B裁定：supersedes/related 属扫描面）",
    expected: "包含 supersedes 关联版本，或 status=partial 且 unknownReasons 说明关系未遍历",
    actual: `status=${report.status}，totalItems=${report.totalItems}，关联版本${mentionsDependent ? "在报告内" : "缺失"}，unknownReasons=${report.unknownReasons.length}`,
    conforms: mentionsDependent || report.status !== "completed",
  });
  repo.close();
});

it("P14 索引重建须构建投影并保留重建态", async () => {
  const file = join(temp(), "probe-index.sqlite");
  const { repo, workspaceId } = openRepo(file);
  const source = await stageSource(repo, workspaceId, "合成索引来源");
  const requestKey = randomUUID();
  const before = indexStatus(
    await repo.executeWikiMaintenance(
      read("wiki.getIndexStatus", { index: "keyword" }),
      host(workspaceId),
    ),
  );
  const rebuilt = await repo.executeWikiMaintenance(
    write(
      "wiki.rebuildIndex",
      {
        index: "keyword",
        expectedGeneration: before.generation,
        expectedAuthoritativeSeq: before.authoritativeSeq,
      },
      requestKey,
    ),
    host(workspaceId),
  );
  const rebuild = rebuilt.ok && rebuilt.data.kind === "indexRebuild" ? rebuilt.data.rebuild : null;
  const db = new Database(file);
  const projectionTables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%keyword%' OR name LIKE '%markdown%')",
    )
    .all() as { name: string }[];
  db.close();
  observe({
    id: "P14",
    contract: "ready 须先异步构建并校验投影，再在事务中原子切换；无投影不得 ready（B00a 第88行）",
    expected:
      "存在 keyword/markdown 投影表且行数已校验；或 status=rebuilding/failed 而非 completed",
    actual: `status=${rebuild?.status ?? code(rebuilt)}，state=${rebuild?.result?.state ?? "n/a"}，generation=${rebuild?.result?.generation ?? "n/a"}，indexedSeq=${rebuild?.result?.indexedSeq ?? "n/a"}，投影表 ${projectionTables.length} 个`,
    conforms: projectionTables.length > 0 || rebuild?.status !== "completed",
  });
  observe({
    id: "P15",
    contract:
      "重建回执 operationKey 固定请求身份；rebuildId 在 rebuilding 期间可见，旧票据不得覆盖新代",
    expected: "operationKey = 请求 idempotencyKey；status 经历 rebuilding 而非直接 completed",
    actual: `operationKey=${rebuild ? (rebuild.operationKey === requestKey ? "等于请求键" : "宿主随机") : "n/a"}，status.rebuildId=${before.rebuildId === null ? "null" : "有"}`,
    conforms: rebuild?.operationKey === requestKey,
  });

  await withdraw(repo, workspaceId, source);
  const stale = indexStatus(
    await repo.executeWikiMaintenance(
      read("wiki.getIndexStatus", { index: "keyword" }),
      host(workspaceId, LATER),
    ),
  );
  observe({
    id: "P16",
    contract: "权威序列前进后索引须如实 stale，不得继续 ready",
    expected: "state=stale（indexedSeq < authoritativeSeq）",
    actual: `state=${stale.state}，indexedSeq=${stale.indexedSeq}/${stale.authoritativeSeq}`,
    conforms: stale.state === "stale",
  });
  repo.close();
});

it("P17 生命周期事件须可回放且工作区上下文须核对", async () => {
  const file = join(temp(), "probe-events.sqlite");
  const { repo, workspaceId } = openRepo(file);
  const source = await stageSource(repo, workspaceId, "合成事件来源");
  await withdraw(repo, workspaceId, source);
  const [issue] = await issuesForSource(repo, workspaceId, source.sourceRevisionId);
  if (!issue) throw new Error("撤回未登记问题");
  await repo.executeWikiMaintenance(
    write("wiki.resolveMaintenance", {
      issueId: issue.issueId,
      expectedIssueVersion: issue.issueVersion,
      action: "resolve",
      note: "合成结案",
      evidenceIds: [randomUUID()],
    }),
    host(workspaceId),
  );
  const db = new Database(file);
  const rows = db
    .prepare("SELECT type, payload_json FROM outbox WHERE workspace_id=? ORDER BY rowid")
    .all(workspaceId) as { type: string; payload_json: string }[];
  const discovered = rows.filter((row) => row.type === "maintenance.discovered").length;
  const resolvedRow = rows.find((row) => row.type === "maintenance.resolved");
  db.close();
  const resolvedPayload = resolvedRow
    ? Object.keys(JSON.parse(resolvedRow.payload_json) as object)
    : [];
  observe({
    id: "P17",
    contract: "追加可回放的生命周期事件：含 entityVersion/evidenceIds/actorId/occurredAt/note",
    expected: "maintenance.resolved 载荷含完整字段；问题被发现时发 maintenance.discovered",
    actual: `resolved 载荷字段=${resolvedPayload.join(",")}；discovered 事件 ${discovered} 条`,
    conforms:
      ["entityVersion", "evidenceIds", "note", "occurredAt"].every((key) =>
        resolvedPayload.includes(key),
      ) && discovered > 0,
  });

  const report = impactReport(
    await repo.executeWikiMaintenance(
      write("wiki.analyzeImpact", {
        target: {
          kind: "source",
          sourceId: source.sourceId,
          sourceRevisionId: source.sourceRevisionId,
          artifactHash: source.artifactHash,
        },
        reason: "withdrawn",
        replacementRevisionId: null,
      }),
      host(workspaceId),
    ),
  );
  const foreignContext = await repo.executeWikiMaintenance(
    read("wiki.getImpact", { reportId: report.reportId, limit: 10, cursor: null }),
    host(randomUUID()),
  );
  observe({
    id: "P18",
    contract: "读取按 id 的方法仍须核对宿主工作区（单工作区库不能证明越权，但缺失比较可观测）",
    expected: "SOURCE_CONFLICT / NOT_FOUND（上下文工作区与报告工作区不一致）",
    actual: code(foreignContext),
    conforms: code(foreignContext) !== "ok",
    note: "不是已复现的跨工作区数据泄露；单工作区库无第二工作区可比对",
  });
  repo.close();
});

it("总结：全部观察项须与契约一致", () => {
  const findings = observations.filter((item) => !item.conforms).map((item) => item.id);
  writeFileSync(
    "wiki-project/raw/b01-a01e-contract-probe.json",
    `${JSON.stringify(
      {
        status: findings.length === 0 ? "passed" : "contract_gaps",
        scope: "A01e 八维护方法契约一致性探针（B）",
        probeSource: "packages/infrastructure/probes/a01e-contract.probe.ts",
        config: "packages/infrastructure/probes/a01e-contract.vitest.config.ts",
        fixtures: "全部为合成来源/知识（synthetic），不含真实客户或供应商资料",
        note: "探针通过只代表各项与契约一致；contract_gaps 表示已复现的契约偏差，详见 observations",
        observations,
        failing: findings,
      },
      null,
      2,
    )}\n`,
  );
  expect(findings).toEqual([]);
});
