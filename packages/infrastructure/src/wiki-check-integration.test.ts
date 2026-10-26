import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CheckListResultSchema,
  CheckReportSchema,
  CheckResultSchema,
  type RuleDefinition,
  WikiResultSchema,
} from "@tradequote/contracts";
import Database from "better-sqlite3";
import { afterEach, expect, it } from "vitest";
import { CheckStore } from "./check-store";
import { SqliteWorkspaceRepository } from "./index";
import { SqliteWikiCheckSource } from "./wiki-check-source";
import { createSyntheticQuote, seedPublished } from "./wiki-test.fixture";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0).reverse()) close();
});
const context = { actorId: "synthetic-integration-user", origin: "human_ui" as const };
const envelope = () => ({
  schemaVersion: 1 as const,
  requestId: randomUUID(),
  idempotencyKey: randomUUID(),
});
function data<T>(r: { ok: true; data: T } | { ok: false; error: { message: string } }): T {
  if (!r.ok) throw new Error(r.error.message);
  return r.data;
}
const rule = (field: "payment" | "delivery" = "payment"): RuleDefinition => ({
  ruleId: randomUUID(),
  category: field === "payment" ? "commercial_terms" : "platform_guidance",
  title: "合成必填规则",
  field,
  condition: { kind: "required" },
  failureSeverity: "block",
  message: "合成条款缺失",
  suggestedAction: "人工补齐后重新检查",
});
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "tq-ab-integration-"));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, "synthetic.sqlite");
  let repo = new SqliteWorkspaceRepository(file);
  cleanup.push(() => repo.close());
  repo.commit(
    { ...envelope(), method: "workspace.create", payload: { name: "合成A+B联调" } },
    context,
  );
  const quote = createSyntheticQuote(repo);
  const workspaceId = quote.workspaceId;
  const db = new Database(file);
  db.pragma("foreign_keys=ON");
  cleanup.push(() => db.close());
  const command = { ...envelope(), method: "quote.check", payload: { revisionId: quote.id } };
  return {
    file,
    db,
    quote,
    command,
    workspaceId,
    repo: () => repo,
    check: (cmd: unknown = command) => CheckResultSchema.parse(repo.executeChecks(cmd, context)),
    list: (revisionId = quote.id) =>
      data(
        CheckListResultSchema.parse(
          repo.executeChecks(
            {
              schemaVersion: 1,
              requestId: randomUUID(),
              method: "quote.getChecks",
              payload: { revisionId },
            },
            context,
          ),
        ),
      ),
    reopen: () => {
      repo.close();
      repo = new SqliteWorkspaceRepository(file);
    },
    seed: (opts: Parameters<typeof seedPublished>[3] = {}) =>
      seedPublished(file, repo, workspaceId, {
        locale: "en",
        kind: "rule",
        rules: [rule()],
        ...opts,
      }),
    consumption: async (reportId: string) =>
      WikiResultSchema.parse(
        await repo.executeWiki(
          {
            schemaVersion: 1,
            requestId: randomUUID(),
            method: "wiki.getConsumption",
            payload: { kind: "artifact", revisionId: reportId },
          },
          { ...context, workspaceId, now: new Date().toISOString() },
        ),
      ),
  };
}

it("uses A search/resolve and keeps both original sources, one report and consumption after reopen", async () => {
  const f = fixture();
  const seeded = await f.seed();
  const before = f.db.prepare("SELECT content_hash,data_json FROM quote_v1").get();
  const first = data(f.check());
  expect(first.issues.find((i) => i.fieldPath === "payment")?.evidence).toHaveLength(2);
  expect(first.wikiCitations).toEqual([seeded.citation]);
  for (const evidence of first.issues[0]!.evidence) {
    expect("citation" in evidence).toBe(true);
    expect(evidence.sourceStatus).toBe("synthetic");
  }
  const consumption = data(await f.consumption(first.reportId));
  expect(consumption).toMatchObject({
    kind: "consumption",
    consumption: {
      consumer: {
        kind: "artifact",
        entityId: first.reportId,
        revisionId: first.reportId,
        contentHash: createHash("sha256").update(JSON.stringify(first)).digest("hex"),
      },
      citations: [seeded.citation],
    },
  });
  f.reopen();
  expect(f.list()).toEqual([first]);
  expect(f.check({ ...f.command, requestId: randomUUID() })).toMatchObject({
    ok: true,
    data: first,
  });
  expect(f.db.prepare("SELECT content_hash,data_json FROM quote_v1").get()).toEqual(before);
});

it.each(["quote_check_report", "knowledge_consumption", "outbox", "idempotency"])(
  "rolls back report, consumption, both events and receipts when %s fails",
  async (table) => {
    const f = fixture();
    await f.seed();
    const before = Object.fromEntries(
      ["quote_check_report", "knowledge_consumption", "outbox", "idempotency"].map((t) => [
        t,
        f.db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get(),
      ]),
    );
    f.db.exec(
      `CREATE TRIGGER injected_ab_failure BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'synthetic-private-failure'); END;`,
    );
    const failed = f.check();
    expect(failed.ok).toBe(false);
    expect(JSON.stringify(failed)).not.toContain("synthetic-private");
    for (const [t, count] of Object.entries(before))
      expect(f.db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get()).toEqual(count);
    f.db.exec("DROP TRIGGER injected_ab_failure");
    const first = data(f.check());
    expect(f.list()).toEqual([first]);
    expect(f.db.prepare("SELECT COUNT(*) AS n FROM knowledge_consumption").get()).toEqual({ n: 1 });
  },
);

it.each(["quote_event", "outer_success_receipt"] as const)(
  "rolls back all citations and inner receipts when the late %s write fails",
  async (point) => {
    const f = fixture();
    await f.seed({ rules: [rule()] });
    await f.seed({ rules: [rule("delivery")] });
    const snapshot = () =>
      Object.fromEntries(
        ["quote_check_report", "knowledge_consumption", "outbox", "idempotency"].map((table) => [
          table,
          f.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
        ]),
      );
    const before = snapshot();
    const target =
      point === "quote_event"
        ? "ON outbox WHEN NEW.type='quote.check'"
        : `ON idempotency WHEN NEW.key='${f.command.idempotencyKey}'`;
    // Both points occur after the participant has inserted consumption, its event
    // and its own success receipt. Failing here must roll back that earlier work.
    f.db.exec(`CREATE TRIGGER injected_late_failure BEFORE INSERT ${target}
      BEGIN SELECT RAISE(ABORT,'synthetic-late-failure'); END;`);
    expect(f.check()).toMatchObject({ ok: false, error: { code: "STORAGE_ERROR" } });
    expect(snapshot()).toEqual(before);
    f.db.exec("DROP TRIGGER injected_late_failure");
    const first = data(f.check());
    expect(first.wikiCitations).toHaveLength(2);
    expect(first.wikiCitations?.map((c) => c.sourceRefs.length)).toEqual([2, 2]);
    const consumption = data(await f.consumption(first.reportId));
    expect(consumption).toMatchObject({
      kind: "consumption",
      consumption: { citations: first.wikiCitations },
    });
    const committed = snapshot();
    f.reopen();
    expect(data(f.check({ ...f.command, requestId: randomUUID() }))).toEqual(first);
    expect(f.list()).toEqual([first]);
    expect(data(await f.consumption(first.reportId))).toEqual(consumption);
    expect(snapshot()).toEqual(committed);
  },
);

it("preserves old evidence after a rule update and a same-key replay; a new key checks the new rules", async () => {
  const f = fixture();
  const original = await f.seed();
  const first = data(f.check());
  const next = await f.seed({
    documentId: original.revision.documentId,
    expectedVersion: 1,
    parentRevisionId: original.revision.revisionId,
    rules: [rule("delivery")],
  });
  expect(data(f.check({ ...f.command, requestId: randomUUID() }))).toEqual(first);
  const newer = data(f.check({ ...f.command, idempotencyKey: randomUUID() }));
  expect(newer.ruleRevisionIds).toEqual([next.revision.revisionId]);
  expect(newer.wikiCitations).toEqual([next.citation]);
  expect(f.list()).toHaveLength(2);
  expect(f.list().find((r) => r.reportId === first.reportId)).toEqual(first);
  expect(f.db.prepare("SELECT COUNT(*) AS n FROM knowledge_consumption").get()).toEqual({ n: 2 });
});

it("keeps passing-rule citations, isolates V1/V2/V3 reports and never changes amounts", async () => {
  const f = fixture();
  await f.seed({ rules: [rule(), rule("delivery")] });
  const v1 = data(f.check());
  const v2 = data(
    f.repo().commitAgent(
      {
        ...envelope(),
        method: "agent.revise",
        payload: { baseId: f.quote.id, expectedVersion: 1, instruction: "合成补齐条款" },
      },
      {
        patches: [
          { op: "setPayment", value: "30%预付" },
          { op: "setDelivery", value: "确认后30天" },
        ],
        summary: "合成修改",
      },
      "synthetic-no-model",
    ),
  ).quotes[0]!;
  const second = data(
    f.check({ ...envelope(), method: "quote.check", payload: { revisionId: v2.id } }),
  );
  expect(second.issues).toEqual([]);
  expect(second.wikiCitations).toHaveLength(1);
  const v3 = data(
    f.repo().commitAgent(
      {
        ...envelope(),
        method: "agent.revise",
        payload: { baseId: v2.id, expectedVersion: 2, instruction: "合成再次修改" },
      },
      { patches: [{ op: "setDelivery", value: "确认后40天" }], summary: "合成第三版" },
      "synthetic-no-model",
    ),
  ).quotes[0]!;
  expect(f.list(v3.id)).toEqual([]);
  f.reopen();
  expect(f.list()).toEqual([v1]);
  expect(f.list(v2.id)).toEqual([second]);
  expect(v2.goodsTotal).toBe(f.quote.goodsTotal);
  expect(v3.goodsTotal).toBe(f.quote.goodsTotal);
});

it.each(["withdrawn", "tampered_source", "tampered_excerpt"])(
  "refuses %s evidence atomically while retaining old report replay",
  async (kind) => {
    const f = fixture();
    const seeded = await f.seed();
    const first = data(f.check());
    if (kind === "withdrawn")
      f.db
        .prepare("UPDATE knowledge_source SET state='withdrawn' WHERE source_revision_id=?")
        .run(seeded.sources[0]!.sourceRevisionId);
    else if (kind === "tampered_source") {
      const s = { ...seeded.sources[0]!, sourceText: "tampered synthetic source" };
      f.db
        .prepare("UPDATE knowledge_source SET data_json=? WHERE source_revision_id=?")
        .run(JSON.stringify(s), s.sourceRevisionId);
    } else {
      const revision = structuredClone(seeded.revision);
      revision.content.sourceRefs[0]!.excerptHash = "a".repeat(64);
      f.db.exec("DROP TRIGGER knowledge_wiki_no_update");
      f.db
        .prepare("UPDATE knowledge_wiki SET data_json=? WHERE revision_id=?")
        .run(JSON.stringify(revision), revision.revisionId);
    }
    expect(f.check({ ...f.command, idempotencyKey: randomUUID() })).toMatchObject({
      ok: false,
      error: { code: "SOURCE_CONFLICT", retryable: false },
    });
    expect(f.list()).toEqual([first]);
    expect(data(f.check())).toEqual(first);
    expect(f.db.prepare("SELECT COUNT(*) AS n FROM knowledge_consumption").get()).toEqual({ n: 1 });
  },
);

it("does not invent rules for SOP/terms, mismatched locales or scopes", async () => {
  const f = fixture();
  await f.seed({ kind: "sop", rules: [] });
  await f.seed({ kind: "term", rules: [] });
  await f.seed({ locale: "pt-BR" });
  await f.seed({
    scope: { platforms: [], markets: ["different synthetic market"], categories: [] },
  });
  const result = data(f.check());
  expect(result.wikiCitations).toEqual([]);
  expect(result.coverage.every((c) => c.status === "pending")).toBe(true);
  expect(f.db.prepare("SELECT COUNT(*) AS n FROM knowledge_consumption").get()).toEqual({ n: 0 });
});

it("refuses standalone consumption of nonexistent or wrong-hash artifacts", async () => {
  const f = fixture();
  const seeded = await f.seed();
  const result = await f.repo().executeWiki(
    {
      ...envelope(),
      method: "wiki.registerConsumption",
      payload: {
        consumer: {
          kind: "artifact",
          entityId: randomUUID(),
          revisionId: randomUUID(),
          contentHash: "a".repeat(64),
        },
        citations: [seeded.citation],
      },
    },
    { ...context, workspaceId: f.workspaceId, now: new Date().toISOString() },
  );
  expect(result).toMatchObject({ ok: false, error: { code: "SOURCE_CONFLICT" } });
  expect(f.db.prepare("SELECT COUNT(*) AS n FROM knowledge_consumption").get()).toEqual({ n: 0 });
});

it("revalidates a source withdrawn between evaluation and consumption and rolls back that transaction", async () => {
  const f = fixture();
  const seeded = await f.seed();
  f.db.exec(`CREATE TRIGGER withdraw_during_check AFTER INSERT ON quote_check_report BEGIN
    UPDATE knowledge_source SET state='withdrawn' WHERE source_revision_id='${seeded.sources[0]!.sourceRevisionId}'; END;`);
  expect(f.check().ok).toBe(false);
  expect(f.list()).toEqual([]);
  expect(f.db.prepare("SELECT COUNT(*) AS n FROM knowledge_consumption").get()).toEqual({ n: 0 });
  expect(
    f.db
      .prepare("SELECT state FROM knowledge_source WHERE source_revision_id=?")
      .get(seeded.sources[0]!.sourceRevisionId),
  ).toEqual({ state: "active" });
  f.db.exec("DROP TRIGGER withdraw_during_check");
  expect(f.check().ok).toBe(true);
});

it.each(["expired", "withdrawn"])(
  "never falls back to old rules when the latest publication is %s",
  async (kind) => {
    const f = fixture();
    const first = await f.seed();
    const saved = data(f.check());
    const latest = await f.seed({
      documentId: first.revision.documentId,
      expectedVersion: 1,
      parentRevisionId: first.revision.revisionId,
      ...(kind === "expired"
        ? {
            validity: {
              status: "confirmed" as const,
              validFrom: null,
              validUntil: "2026-10-22T01:00:00Z",
            },
          }
        : {}),
    });
    if (kind === "withdrawn") {
      const row = f.db
        .prepare("SELECT data_json FROM knowledge_lifecycle WHERE revision_id=?")
        .get(latest.revision.revisionId) as { data_json: string };
      const lifecycle = JSON.parse(row.data_json);
      lifecycle.state = "withdrawn";
      lifecycle.lifecycleVersion = 4;
      lifecycle.publication = { ...lifecycle.publication, type: "withdrawn", lifecycleVersion: 4 };
      f.db
        .prepare("UPDATE knowledge_lifecycle SET state='withdrawn',data_json=? WHERE revision_id=?")
        .run(JSON.stringify(lifecycle), latest.revision.revisionId);
    }
    const report = data(f.check({ ...f.command, idempotencyKey: randomUUID() }));
    expect(report.ruleRevisionIds).toEqual([]);
    expect(report.coverage.every((c) => c.status === "pending")).toBe(true);
    expect(data(f.check())).toEqual(saved);
  },
);

it("rejects an old source revision once a newer source is stored, retaining history", async () => {
  const f = fixture();
  const seeded = await f.seed();
  const first = data(f.check());
  const old = seeded.sources[0]!;
  const result = await f.repo().executeWiki(
    {
      ...envelope(),
      method: "source.stage",
      payload: {
        sourceId: old.sourceId,
        expectedVersion: 1,
        label: old.label,
        sourceStatus: old.sourceStatus,
        mediaType: old.mediaType,
        sourceText: "合成更新来源",
        acquiredAt: old.acquiredAt,
        sourceUri: null,
        permissionNote: old.permissionNote,
        validity: old.validity,
      },
    },
    { ...context, workspaceId: f.workspaceId, now: new Date().toISOString() },
  );
  expect(result.ok).toBe(true);
  expect(f.check({ ...f.command, idempotencyKey: randomUUID() })).toMatchObject({
    ok: false,
    error: { code: "SOURCE_CONFLICT" },
  });
  expect(data(f.check())).toEqual(first);
  expect(f.list()).toEqual([first]);
});

it("rejects a new check exactly at source expiry but reopens the original report and all consumption", async () => {
  const f = fixture();
  const started = Date.parse(f.quote.createdAt);
  const expiresAt = new Date(started + 2 * 60 * 60 * 1000).toISOString();
  let checkedAt = new Date(started + 60 * 60 * 1000).toISOString();
  await f.seed({
    sourceValidity: { status: "confirmed", validFrom: null, validUntil: expiresAt },
  });
  const store = new CheckStore(f.db, new SqliteWikiCheckSource(f.db), () => checkedAt);
  const check = (command: unknown = f.command) =>
    CheckResultSchema.parse(store.execute(command, context));
  const first = data(check());
  expect(first.wikiCitations?.[0]?.sourceRefs).toHaveLength(2);
  const consumption = data(await f.consumption(first.reportId));
  const snapshot = () =>
    Object.fromEntries(
      ["quote_check_report", "knowledge_consumption", "outbox", "idempotency"].map((table) => [
        table,
        f.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
      ]),
    );
  const before = snapshot();
  checkedAt = expiresAt;
  expect(check({ ...f.command, idempotencyKey: randomUUID() })).toMatchObject({
    ok: false,
    error: { code: "SOURCE_CONFLICT", retryable: false },
  });
  expect(snapshot()).toEqual(before);
  f.reopen();
  expect(data(f.check({ ...f.command, requestId: randomUUID() }))).toEqual(first);
  expect(f.list()).toEqual([first]);
  expect(data(await f.consumption(first.reportId))).toEqual(consumption);
  expect(snapshot()).toEqual(before);
});

it("does not store a partial report when more than 100 rule sections must be consumed", async () => {
  const f = fixture();
  for (let i = 0; i < 101; i++) await f.seed();
  expect(f.check()).toMatchObject({ ok: false, error: { code: "SOURCE_CONFLICT" } });
  expect(f.list()).toEqual([]);
  expect(f.db.prepare("SELECT COUNT(*) AS n FROM knowledge_consumption").get()).toEqual({ n: 0 });
});

it("keeps multiple excerpts of the same source and rejects a report that truncates them", async () => {
  const f = fixture();
  const seeded = await f.seed({ repeatSource: true });
  const report = data(f.check());
  const issue = report.issues.find((i) => i.fieldPath === "payment")!;
  expect(issue.evidence).toHaveLength(3);
  expect(report.wikiCitations).toEqual([seeded.citation]);
  expect(
    CheckReportSchema.safeParse({
      ...report,
      issues: report.issues.map((i) =>
        i === issue ? { ...i, evidence: i.evidence.slice(0, 1) } : i,
      ),
    }).success,
  ).toBe(false);
});

it("refuses history/replay when its stored consumption is corrupted, and exposes no forged quote consumer", async () => {
  const f = fixture();
  const seeded = await f.seed();
  const report = data(f.check());
  const forged = await f.repo().executeWiki(
    {
      ...envelope(),
      method: "wiki.registerConsumption",
      payload: {
        consumer: {
          kind: "quote",
          entityId: f.quote.id,
          revisionId: f.quote.id,
          contentHash: "a".repeat(64),
        },
        citations: [seeded.citation],
      },
    },
    { ...context, workspaceId: f.workspaceId, now: new Date().toISOString() },
  );
  expect(forged).toMatchObject({ ok: false, error: { code: "SOURCE_CONFLICT" } });
  f.db.exec("DROP TRIGGER knowledge_consumption_no_update");
  const row = f.db
    .prepare("SELECT data_json FROM knowledge_consumption WHERE consumer_revision_id=?")
    .get(report.reportId) as { data_json: string };
  const corrupted = JSON.parse(row.data_json);
  corrupted.consumer.contentHash = "a".repeat(64);
  f.db
    .prepare("UPDATE knowledge_consumption SET data_json=? WHERE consumer_revision_id=?")
    .run(JSON.stringify(corrupted), report.reportId);
  expect(f.check()).toMatchObject({ ok: false, error: { code: "STORAGE_ERROR" } });
  expect(() => f.list()).toThrow();
});

it("keeps storage failures distinct from source conflicts and never exposes SQLite details", async () => {
  const f = fixture();
  await f.seed();
  f.db.exec("ALTER TABLE knowledge_wiki RENAME TO synthetic_unavailable_wiki");
  const result = f.check();
  expect(result).toMatchObject({ ok: false, error: { code: "STORAGE_ERROR", retryable: false } });
  expect(JSON.stringify(result)).not.toContain("knowledge_wiki");
  expect(f.list()).toEqual([]);
});

it("fixes input/not-found/idempotency errors without writing reports or invoking models", async () => {
  const f = fixture();
  expect(f.check({ ...f.command, actorId: "forged-actor" })).toMatchObject({
    ok: false,
    error: { code: "VALIDATION_ERROR", retryable: false },
  });
  expect(f.check({ ...f.command, payload: { revisionId: randomUUID() } })).toMatchObject({
    ok: false,
    error: { code: "NOT_FOUND", retryable: false },
  });
  expect(f.list()).toEqual([]);
  await f.seed();
  const first = data(f.check());
  expect(f.check({ ...f.command, payload: { revisionId: randomUUID() } })).toMatchObject({
    ok: false,
    error: { code: "IDEMPOTENCY_CONFLICT", retryable: false },
  });
  expect(f.list()).toEqual([first]);
});
