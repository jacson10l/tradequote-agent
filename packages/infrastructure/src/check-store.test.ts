import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type CheckCommand,
  type CheckListResult,
  type CheckResult,
  demoCatalogCsv,
  demoScenario,
  type ExecutionContext,
  type KnowledgeRevision,
  type TradeResult,
} from "@tradequote/contracts";
import Database from "better-sqlite3";
import { afterEach, expect, it } from "vitest";
import { CheckStore, checkReportTableSql } from "./check-store";
import { SqliteWorkspaceRepository } from "./index";
import { TradeStore } from "./trade-store";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0).reverse()) close();
});
const context = { actorId: "synthetic-check-user", origin: "human_ui" as const };
const envelope = () => ({
  schemaVersion: 1 as const,
  requestId: randomUUID(),
  idempotencyKey: randomUUID(),
});
function data<T>(result: { ok: true; data: T } | { ok: false; error: { message: string } }): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}
function published(): KnowledgeRevision {
  const sourceText = "仅供合成测试：付款和交货条款必须填写。";
  const rule = {
    title: "合成必填规则",
    message: "条款缺失",
    suggestedAction: "补充条款后重新检查",
    condition: { kind: "required" as const },
    failureSeverity: "block" as const,
  };
  return {
    revisionId: randomUUID(),
    documentId: randomUUID(),
    version: 1,
    status: "published",
    sourceHash: createHash("sha256").update(sourceText, "utf8").digest("hex"),
    createdAt: "2026-10-21T00:00:00.000Z",
    publishedAt: "2026-10-21T01:00:00.000Z",
    content: {
      title: "合成规则",
      scope: { platforms: [], markets: [], categories: [] },
      sourceStatus: "synthetic",
      sourceLabel: "仅供测试的合成来源",
      sourceText,
      location: { kind: "text", start: 0, end: sourceText.length },
      rules: [
        { ...rule, ruleId: randomUUID(), category: "commercial_terms", field: "payment" },
        { ...rule, ruleId: randomUUID(), category: "platform_guidance", field: "delivery" },
      ],
    },
  };
}
function fixture({ installReportTable = true, csv = demoCatalogCsv } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "tq-checks-"));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, "synthetic.sqlite");
  const repo = new SqliteWorkspaceRepository(file);
  const workspaceOperation = envelope();
  try {
    repo.commit(
      {
        ...workspaceOperation,
        method: "workspace.create",
        payload: { name: "合成报告持久化测试" },
      },
      context,
    );
  } finally {
    repo.close();
  }
  let db = new Database(file);
  db.pragma("foreign_keys = ON");
  // The production migration installs reports. Missing-schema behavior remains explicit.
  if (!installReportTable) db.exec("DROP TABLE quote_check_report");
  cleanup.push(() => db.close());
  let trade = new TradeStore(db);
  const board = (result: TradeResult) => data(result);
  const scenario = board(
    trade.execute(
      {
        ...envelope(),
        method: "scenario.save",
        payload: { expectedVersion: 0, scenario: demoScenario },
      },
      context,
    ),
  ).scenario;
  const batch = board(
    trade.execute(
      {
        ...envelope(),
        method: "catalog.stage",
        payload: { csv, sourceName: "synthetic.csv", sourceStatus: "synthetic" },
      },
      context,
    ),
  ).batches[0];
  if (!scenario || !batch) throw new Error("synthetic fixture");
  const product = board(
    trade.execute(
      {
        ...envelope(),
        method: "catalog.publish",
        payload: { batchId: batch.id, sourceHash: batch.sourceHash },
      },
      context,
    ),
  ).products[0];
  if (!product) throw new Error("synthetic product");
  const quote = board(
    trade.execute(
      {
        ...envelope(),
        method: "quote.createV1",
        payload: {
          scenarioId: scenario.id,
          buyer: "合成买方",
          inquiry: "合成询盘",
          lines: [{ productId: product.id, quantity: "100", unit: product.unit }],
          payment: "",
          delivery: "",
        },
      },
      context,
    ),
  ).quotes[0];
  if (!quote) throw new Error("synthetic quote");
  let revisions: KnowledgeRevision[] = [];
  let knowledgeFailure: Error | null = null;
  let now = "2026-10-22T10:00:00.000Z";
  const knowledge = {
    findPublished: () => {
      if (knowledgeFailure) throw knowledgeFailure;
      return revisions;
    },
  };
  let store = new CheckStore(db, knowledge, () => now);
  const command: Extract<CheckCommand, { method: "quote.check" }> = {
    ...envelope(),
    method: "quote.check",
    payload: { revisionId: quote.id },
  };
  return {
    command,
    workspaceKey: workspaceOperation.idempotencyKey,
    quote,
    check: (input: unknown = command, actor: ExecutionContext = context) =>
      store.execute(input, actor) as CheckResult,
    list: (revisionId = quote.id) =>
      store.execute(
        {
          schemaVersion: 1,
          requestId: randomUUID(),
          method: "quote.getChecks",
          payload: { revisionId },
        },
        context,
      ) as CheckListResult,
    reopen: () => {
      db.close();
      db = new Database(file);
      db.pragma("foreign_keys = ON");
      trade = new TradeStore(db);
      store = new CheckStore(db, knowledge, () => now);
    },
    setTime: (value: string) => {
      now = value;
    },
    setKnowledge: (value: KnowledgeRevision[]) => {
      revisions = value;
    },
    failKnowledge: () => {
      knowledgeFailure = new Error("synthetic-private-provider-error");
    },
    database: () => db,
    trade: () => trade,
    board: () =>
      board(
        trade.execute({ schemaVersion: 1, requestId: randomUUID(), method: "trade.get" }, context),
      ),
  };
}

it("persists pending coverage against the stored quote and reads it unchanged after reopen", () => {
  const f = fixture();
  expect(data(f.list())).toEqual([]);
  const report = data(f.check());
  expect(report).toMatchObject({
    quoteId: f.quote.id,
    revisionId: f.quote.id,
    quoteVersion: 1,
    checkedAt: "2026-10-22T10:00:00.000Z",
    ruleRevisionIds: [],
    coverage: [
      { category: "commercial_terms", appliedRuleIds: [], status: "pending" },
      { category: "platform_guidance", appliedRuleIds: [], status: "pending" },
    ],
    issues: [{ severity: "pending" }, { severity: "pending" }],
  });
  f.reopen();
  expect(data(f.list())).toEqual([report]);
  expect(f.board().quotes).toEqual([f.quote]);
});

it.each(["quote_check_report", "outbox", "idempotency"])(
  "rolls back the entire check if %s insertion fails and permits a same-key retry",
  (table) => {
    const f = fixture();
    f.setKnowledge([published()]);
    f.database().exec(
      `CREATE TRIGGER injected_failure BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'synthetic-private-sql-error'); END;`,
    );
    const failed = f.check();
    expect(failed).toMatchObject({ ok: false, error: { code: "STORAGE_ERROR" } });
    expect(JSON.stringify(failed)).not.toContain("synthetic-private");
    expect(data(f.list())).toEqual([]);
    expect(
      f.database().prepare("SELECT COUNT(*) AS count FROM outbox WHERE type='quote.check'").get(),
    ).toEqual({ count: 0 });
    f.database().exec("DROP TRIGGER injected_failure");
    const retry = f.check();
    expect(retry.ok).toBe(true);
    expect(data(f.list())).toEqual([data(retry)]);
    expect(f.check({ ...f.command, requestId: randomUUID() })).toEqual(retry);
    expect(
      f.database().prepare("SELECT COUNT(*) AS count FROM outbox WHERE type='quote.check'").get(),
    ).toEqual({ count: 1 });
    expect(f.board().quotes).toEqual([f.quote]);
  },
);

it("replays the first committed report and time after a lost response without querying knowledge again", () => {
  const f = fixture();
  const first = f.check();
  expect(first.ok).toBe(true);
  f.setTime("2026-10-23T11:00:00.000Z");
  f.failKnowledge();
  f.reopen();
  expect(f.check({ ...f.command, requestId: randomUUID() })).toEqual(first);
  expect(data(f.list())).toEqual([data(first)]);
  for (const actor of [
    { ...context, actorId: "another-synthetic-user" },
    { ...context, origin: "agent_tool" as const },
  ]) {
    expect(f.check(f.command, actor)).toMatchObject({
      ok: false,
      error: { code: "IDEMPOTENCY_CONFLICT" },
    });
  }
  expect(f.check({ ...f.command, payload: { revisionId: randomUUID() } })).toMatchObject({
    ok: false,
    error: { code: "IDEMPOTENCY_CONFLICT" },
  });
});

it.each(["hash", "staged", "duplicate_document"])(
  "rejects %s knowledge without saving a misleading report",
  (kind) => {
    const f = fixture();
    const revision = published();
    const invalid =
      kind === "hash"
        ? { ...revision, sourceHash: "a".repeat(64) }
        : kind === "staged"
          ? { ...revision, status: "staged" as const, publishedAt: null }
          : revision;
    f.setKnowledge(
      kind === "duplicate_document"
        ? [revision, { ...revision, revisionId: randomUUID(), version: 2 }]
        : [invalid],
    );
    expect(f.check()).toMatchObject({ ok: false, error: { code: "SOURCE_CONFLICT" } });
    expect(data(f.list())).toEqual([]);
    f.setKnowledge([revision]);
    const result = data(f.check());
    expect(result.issues.map((issue) => issue.severity)).toEqual(["block", "block"]);
    expect(result.ruleRevisionIds).toEqual([revision.revisionId]);
  },
);

it.each(["hash", "report_id", "quote_version", "checked_at"])(
  "refuses corrupted %s report history and its replay receipt",
  (column) => {
    const f = fixture();
    const report = data(f.check());
    f.database().exec("DROP TRIGGER quote_check_report_no_update");
    const value =
      column === "hash"
        ? "a".repeat(64)
        : column === "quote_version"
          ? 99
          : column === "checked_at"
            ? "2026-10-23T00:00:00.000Z"
            : randomUUID();
    const actualColumn = column === "hash" ? "content_hash" : column;
    f.database()
      .prepare(`UPDATE quote_check_report SET ${actualColumn}=? WHERE report_id=?`)
      .run(value, report.reportId);
    expect(f.list()).toMatchObject({ ok: false, error: { code: "STORAGE_ERROR" } });
    expect(f.check()).toMatchObject({ ok: false, error: { code: "STORAGE_ERROR" } });
  },
);

it("keeps V1 reports immutable when V2 fixes terms, gives V3 a separate history and orders new checks deterministically", () => {
  const f = fixture();
  f.setKnowledge([published()]);
  const first = data(f.check());
  const command = { ...f.command, idempotencyKey: randomUUID() };
  f.setTime("2026-10-22T12:00:00.000Z");
  const second = data(f.check(command));
  expect(second.reportId).not.toBe(first.reportId);
  expect(second.issues.map((issue) => issue.checkId)).toEqual(
    first.issues.map((issue) => issue.checkId),
  );
  expect(data(f.list())).toEqual([second, first]);
  const v2 = data(
    f.trade().commitAgent(
      {
        ...envelope(),
        method: "agent.revise",
        payload: {
          baseId: f.quote.id,
          expectedVersion: 1,
          instruction: "合成：补充付款和交货条款",
        },
      },
      {
        patches: [
          { op: "setPayment", value: "30%预付" },
          { op: "setDelivery", value: "确认后30天" },
        ],
        summary: "合成条款修订",
      },
      "synthetic-no-model",
    ),
  ).quotes[0];
  if (!v2) throw new Error("synthetic V2");
  expect(data(f.list(v2.id))).toEqual([]);
  const fixed = data(
    f.check({ ...envelope(), method: "quote.check", payload: { revisionId: v2.id } }),
  );
  expect(fixed).toMatchObject({
    quoteId: f.quote.id,
    revisionId: v2.id,
    quoteVersion: 2,
    issues: [],
  });
  const v3 = data(
    f.trade().commitAgent(
      {
        ...envelope(),
        method: "agent.revise",
        payload: { baseId: v2.id, expectedVersion: 2, instruction: "合成：调整交货条款" },
      },
      { patches: [{ op: "setDelivery", value: "确认后40天" }], summary: "合成第三版" },
      "synthetic-no-model",
    ),
  ).quotes[0];
  if (!v3) throw new Error("synthetic V3");
  expect(data(f.list(v3.id))).toEqual([]);
  f.reopen();
  expect(data(f.list())).toEqual([second, first]);
  expect(data(f.list(v2.id))).toEqual([fixed]);
  expect(f.board().quotes.find((quote) => quote.id === f.quote.id)).toEqual(f.quote);
  expect(v2.goodsTotal).toBe(f.quote.goodsTotal);
  expect(v3.goodsTotal).toBe(f.quote.goodsTotal);
});

it("enforces immutable reports and refuses a report attached to a nonexistent quote version at the database boundary", () => {
  const f = fixture();
  const report = data(f.check());
  expect(() =>
    f
      .database()
      .prepare("UPDATE quote_check_report SET checked_at=? WHERE report_id=?")
      .run("2026-10-23T00:00:00.000Z", report.reportId),
  ).toThrow("IMMUTABLE_CHECK_REPORT");
  expect(() =>
    f.database().prepare("DELETE FROM quote_check_report WHERE report_id=?").run(report.reportId),
  ).toThrow("IMMUTABLE_CHECK_REPORT");
  expect(() =>
    f
      .database()
      .prepare(`
    INSERT INTO quote_check_report(report_id,workspace_id,quote_id,revision_id,quote_version,checked_at,content_hash,data_json)
    SELECT ?,workspace_id,quote_id,revision_id,999,checked_at,content_hash,data_json FROM quote_check_report WHERE report_id=?
  `)
      .run(randomUUID(), report.reportId),
  ).toThrow("INVALID_CHECK_REVISION");
  expect(data(f.list())).toEqual([report]);
});

it("rejects client-supplied quotes, reports and execution authority instead of storing them", () => {
  const f = fixture();
  for (const input of [
    { ...f.command, payload: { ...f.command.payload, quote: f.quote } },
    { ...f.command, payload: { ...f.command.payload, reportId: randomUUID() } },
    { ...f.command, actorId: "forged-actor" },
    { ...f.command, credentials: { key: "synthetic-not-a-key" } },
    { ...f.command, method: "quote.getChecks" },
  ])
    expect(f.check(input)).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  expect(data(f.list())).toEqual([]);
});

it("fails explicitly without the A-installed report schema and never installs or renumbers a migration itself", () => {
  const f = fixture({ installReportTable: false });
  expect(f.check()).toMatchObject({ ok: false, error: { code: "STORAGE_ERROR" } });
  expect(f.list()).toMatchObject({ ok: false, error: { code: "STORAGE_ERROR" } });
  expect(
    f.database().prepare("SELECT name FROM sqlite_master WHERE name='quote_check_report'").get(),
  ).toBeUndefined();
  expect(f.database().pragma("user_version", { simple: true })).toBe(8);
  f.database().exec(checkReportTableSql);
  expect(data(f.list())).toEqual([]);
  expect(f.check().ok).toBe(true);
  expect(f.database().pragma("user_version", { simple: true })).toBe(8);
});

it.each(["version", "rootId", "parentId"])(
  "rejects a stored quote with inconsistent %s metadata even if its JSON hash was recomputed",
  (field) => {
    const f = fixture();
    f.database().exec("DROP TRIGGER quote_v1_no_update");
    const json = JSON.stringify({ ...f.quote, [field]: field === "version" ? 2 : randomUUID() });
    const digest = createHash("sha256").update(json, "utf8").digest("hex");
    f.database()
      .prepare("UPDATE quote_v1 SET data_json=?,content_hash=? WHERE id=?")
      .run(json, digest, f.quote.id);
    expect(f.list()).toMatchObject({ ok: false, error: { code: "STORAGE_ERROR" } });
    expect(f.check()).toMatchObject({ ok: false, error: { code: "STORAGE_ERROR" } });
  },
);

it("keeps unknown amounts unknown while persisting a rule report", () => {
  const f = fixture({
    csv: "sku,name,category,unit,currency,min_quantity,unit_price,valid_until,description\nSYNTHETIC-PANEL,合成板材,板材,m2,USD,1,,2099-12-31,合成未知价格",
  });
  expect(f.quote.goodsTotal).toBeNull();
  f.setKnowledge([published()]);
  expect(f.check().ok).toBe(true);
  f.reopen();
  expect(f.board().quotes).toEqual([f.quote]);
  expect(f.board().quotes[0]?.goodsTotal).toBeNull();
});

it("distinguishes a missing quote from an unavailable knowledge reader without manufacturing pending success", () => {
  const f = fixture();
  f.failKnowledge();
  expect(f.list(randomUUID())).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  expect(f.check({ ...f.command, payload: { revisionId: randomUUID() } })).toMatchObject({
    ok: false,
    error: { code: "NOT_FOUND" },
  });
  const failed = f.check();
  expect(failed).toMatchObject({ ok: false, error: { code: "STORAGE_ERROR" } });
  expect(JSON.stringify(failed)).not.toContain("synthetic-private");
  expect(data(f.list())).toEqual([]);
});

it("shares the existing command-key namespace without overwriting another command's successful receipt", () => {
  const f = fixture();
  expect(f.check({ ...f.command, idempotencyKey: f.workspaceKey })).toMatchObject({
    ok: false,
    error: { code: "IDEMPOTENCY_CONFLICT" },
  });
  expect(data(f.list())).toEqual([]);
  expect(f.check().ok).toBe(true);
  f.reopen();
  expect(f.check({ ...f.command, idempotencyKey: f.workspaceKey })).toMatchObject({
    ok: false,
    error: { code: "IDEMPOTENCY_CONFLICT" },
  });
});
