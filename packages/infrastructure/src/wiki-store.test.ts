import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type KnowledgeImpactPage,
  type KnowledgeImpactReport,
  type KnowledgeIndexRebuild,
  type KnowledgeIndexStatus,
  KnowledgeLintReportSchema,
  type MaintenanceIssue,
  type MaintenancePage,
  type WikiHostContext,
  type WikiLifecycle,
  type WikiResult,
  WikiResultSchema,
  type WikiRevision,
  type WikiSourceRevision,
} from "@tradequote/contracts";
import Database from "better-sqlite3";
import { afterEach, expect, it } from "vitest";
import { SqliteWorkspaceRepository } from "./index";
import { createSyntheticQuote, seedPublished } from "./wiki-test.fixture";

const sha = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

const dirs: string[] = [];
const temp = () => {
  const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "tradequote-wiki-")));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const human = { actorId: "test-user", origin: "human_ui" } as const;
const VALIDITY = { status: "confirmed" as const, validFrom: null, validUntil: null };
const NOW = "2026-10-22T00:00:00.000Z";
const LATER = "2026-10-23T00:00:00.000Z";
const host = (
  workspaceId: string,
  origin: WikiHostContext["origin"] = "human_ui",
): WikiHostContext => ({
  workspaceId,
  actorId: origin === "human_ui" ? "test-user" : "agent",
  origin,
  now: NOW,
});

const read = (method: string, payload: unknown) => ({
  schemaVersion: 1 as const,
  requestId: randomUUID(),
  method,
  payload,
});
const write = (method: string, payload: unknown) => ({
  ...read(method, payload),
  idempotencyKey: randomUUID(),
});

function openRepo(file: string): { repo: SqliteWorkspaceRepository; workspaceId: string } {
  const repo = new SqliteWorkspaceRepository(file);
  repo.commit(
    {
      schemaVersion: 1,
      requestId: randomUUID(),
      idempotencyKey: randomUUID(),
      method: "workspace.create",
      payload: { name: "Wiki 测试工作区" },
    },
    human,
  );
  return { repo, workspaceId: repo.read()!.id };
}

const SOURCE_TEXTS = ["  合成 😀来源A\n", "Synthetic second source"];

interface SeedOptions {
  documentId?: string;
  expectedVersion?: number;
  parentRevisionId?: string | null;
  markdown?: string;
  validity?: WikiRevision["content"]["validity"];
  scope?: WikiRevision["content"]["scope"];
}

/** Stage sources + a wiki candidate through the real store, leaving the
 *  lifecycle as `candidate` (P1 review/publish/withdraw operate on it). */
async function seedCandidate(
  repo: SqliteWorkspaceRepository,
  workspaceId: string,
  opts: SeedOptions = {},
) {
  const sources: WikiSourceRevision[] = [];
  for (const sourceText of SOURCE_TEXTS) {
    const result = WikiResultSchema.parse(
      await repo.executeWiki(
        write("source.stage", {
          sourceId: randomUUID(),
          expectedVersion: 0,
          label: "合成原文",
          sourceStatus: "synthetic",
          mediaType: "text/plain",
          sourceText,
          acquiredAt: NOW,
          sourceUri: null,
          permissionNote: "合成 fixture，非真实政策",
          validity: VALIDITY,
        }),
        host(workspaceId),
      ),
    );
    sources.push(
      (result as { ok: true; data: { kind: "sourceRevision"; revision: WikiSourceRevision } }).data
        .revision,
    );
  }

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
  const markdown = opts.markdown ?? "# 合成 SOP\nInspect both sources.\n";
  const sectionId = randomUUID();
  const documentId = opts.documentId ?? randomUUID();
  const result = WikiResultSchema.parse(
    await repo.executeWiki(
      write("wiki.stage", {
        documentId,
        expectedVersion: opts.expectedVersion ?? 0,
        parentRevisionId: opts.parentRevisionId ?? null,
        content: {
          kind: "sop",
          title: "合成 SOP",
          locale: "pt-BR",
          scope: opts.scope ?? { platforms: [], markets: [], categories: [] },
          markdown,
          validity: opts.validity ?? VALIDITY,
          sections: [
            {
              sectionId,
              title: "核对",
              location: { kind: "text", start: 0, end: markdown.length },
              sourceReferenceIds: refs.map((ref) => ref.referenceId),
            },
          ],
          sourceRefs: refs,
          relations: [],
          rules: [],
        },
      }),
      host(workspaceId),
    ),
  );
  const revision = (
    result as { ok: true; data: { kind: "wikiRevision"; record: { revision: WikiRevision } } }
  ).data.record.revision;
  return { sources, revision, refs, sectionId, documentId, markdown };
}

const SEARCH_SCOPE = { platform: "RFQ", market: "Brazil", category: "板材" };
const searchCmd = (payload: Record<string, unknown> = {}) =>
  read("wiki.search", {
    keywords: ["inspect"],
    scope: SEARCH_SCOPE,
    locale: "pt-BR",
    kinds: [],
    limit: 20,
    cursor: null,
    ...payload,
  });

const pageOf = (result: WikiResult) => {
  expect(result.ok).toBe(true);
  return (
    result as {
      ok: true;
      data: {
        kind: "searchPage";
        page: {
          hits: Array<{ revision: WikiRevision }>;
          nextCursor: { afterDocumentId: string } | null;
        };
      };
    }
  ).data.page;
};

it("A-W06-1: 检索只返回已发布+最新+validity 确认版本，不回退旧版本", async () => {
  const file = join(temp(), "wiki.sqlite");
  const { repo, workspaceId } = openRepo(file);
  // 尚未发布任何知识时为空。
  expect(pageOf(await repo.executeWiki(searchCmd(), host(workspaceId))).hits).toHaveLength(0);

  const v1 = await seedPublished(file, repo, workspaceId);
  expect(pageOf(await repo.executeWiki(searchCmd(), host(workspaceId))).hits).toHaveLength(1);

  // 同一文档发布一个 validity 未确认的新版本：不得回退到旧版，也不得返回候选。
  await seedPublished(file, repo, workspaceId, {
    documentId: v1.revision.documentId,
    expectedVersion: 1,
    parentRevisionId: v1.revision.revisionId,
    validity: { status: "unknown", validFrom: null, validUntil: null },
  });
  expect(pageOf(await repo.executeWiki(searchCmd(), host(workspaceId))).hits).toHaveLength(0);
  repo.close();
});

it("A-W06-2: 分页游标固定快照/查询并严格前进，无重复无回退", async () => {
  const file = join(temp(), "wiki.sqlite");
  const { repo, workspaceId } = openRepo(file);
  for (let i = 0; i < 3; i++) {
    await seedPublished(file, repo, workspaceId, {
      markdown: `# 合成 SOP ${i}\nInspect source ${i}.\n`,
    });
  }
  const first = pageOf(await repo.executeWiki(searchCmd({ limit: 1 }), host(workspaceId)));
  expect(first.hits).toHaveLength(1);
  expect(first.nextCursor).not.toBeNull();
  const cursor = first.nextCursor as unknown as {
    snapshotId: string;
    queryHash: string;
    afterDocumentId: string;
  };

  const second = pageOf(await repo.executeWiki(searchCmd({ limit: 1, cursor }), host(workspaceId)));
  expect(second.hits).toHaveLength(1);
  expect(second.hits[0]!.revision.revisionId).not.toBe(first.hits[0]!.revision.revisionId);

  // 换查询 hash 的游标必须被拒绝，不能复用快照。
  const wrong = await repo.executeWiki(
    searchCmd({ limit: 1, cursor: { ...cursor, queryHash: "f".repeat(64) } }),
    host(workspaceId),
  );
  expect(wrong).toMatchObject({ ok: false, error: { code: "REVISION_CONFLICT" } });
  repo.close();
});

it("A-W07-1: 引用解析返回全部来源，多来源不丢失；截断引用被拒", async () => {
  const file = join(temp(), "wiki.sqlite");
  const { repo, workspaceId } = openRepo(file);
  const seeded = await seedPublished(file, repo, workspaceId);
  expect(seeded.sources).toHaveLength(2);

  const ok = await repo.executeWiki(
    read("wiki.resolveCitation", {
      citation: seeded.citation,
      purpose: "new_reference",
      scope: SEARCH_SCOPE,
      locale: "pt-BR",
    }),
    host(workspaceId),
  );
  expect(ok.ok).toBe(true);
  const resolution = (
    ok as {
      ok: true;
      data: {
        kind: "citationResolution";
        resolution: {
          sources: unknown[];
          sourceStates: unknown[];
          eligibility: { eligible: boolean };
        };
      };
    }
  ).data.resolution;
  expect(resolution.sources).toHaveLength(2);
  expect(resolution.sourceStates).toHaveLength(2);
  expect(resolution.eligibility.eligible).toBe(true);

  const truncated = await repo.executeWiki(
    read("wiki.resolveCitation", {
      citation: { ...seeded.citation, sourceRefs: [seeded.citation.sourceRefs[0]!] },
      purpose: "new_reference",
      scope: SEARCH_SCOPE,
      locale: "pt-BR",
    }),
    host(workspaceId),
  );
  expect(truncated).toMatchObject({ ok: false, error: { code: "MISSING_FACTS" } });
  repo.close();
});

it("A-W07-2: 消费登记事务内复核来源与生命周期，幂等重放，撤回后被拒", async () => {
  const file = join(temp(), "wiki.sqlite");
  const { repo, workspaceId } = openRepo(file);
  const seeded = await seedPublished(file, repo, workspaceId);

  const quote = createSyntheticQuote(repo);
  const consumer = {
    kind: "quote",
    entityId: quote.id,
    revisionId: quote.id,
    contentHash: sha(JSON.stringify(quote)),
  };
  const command = write("wiki.registerConsumption", { consumer, citations: [seeded.citation] });
  const first = await repo.executeWiki(command, host(workspaceId));
  expect(first.ok).toBe(true);
  const consumption = (
    first as { ok: true; data: { kind: "consumption"; consumption: { consumptionId: string } } }
  ).data.consumption;
  const consumptionId = consumption.consumptionId;

  // 同一 idempotencyKey 重试（不同 requestId）重放同一结果。
  const retry = await repo.executeWiki({ ...command, requestId: randomUUID() }, host(workspaceId));
  expect(
    (retry as { ok: true; data: { kind: "consumption"; consumption: { consumptionId: string } } })
      .data.consumption.consumptionId,
  ).toBe(consumptionId);

  // 撤回来源后，新的消费登记在同一事务内被拒。
  const db = new Database(file);
  try {
    db.prepare("UPDATE knowledge_source SET state='withdrawn' WHERE source_revision_id=?").run(
      seeded.sources[0]!.sourceRevisionId,
    );
  } finally {
    db.close();
  }
  const blocked = await repo.executeWiki(
    write("wiki.registerConsumption", {
      consumer: {
        kind: "quote",
        entityId: randomUUID(),
        revisionId: randomUUID(),
        contentHash: sha("other"),
      },
      citations: [seeded.citation],
    }),
    host(workspaceId),
  );
  expect(blocked).toMatchObject({ ok: false, error: { code: "SOURCE_CONFLICT" } });

  // 已登记消费可读回。
  const got = await repo.executeWiki(
    read("wiki.getConsumption", { kind: "quote", revisionId: consumer.revisionId }),
    host(workspaceId),
  );
  expect(got.ok).toBe(true);
  repo.close();
});

it("A-W08: 来源/知识暂存幂等与来源校验，人工来源暂存被拒", async () => {
  const file = join(temp(), "wiki.sqlite");
  const { repo, workspaceId } = openRepo(file);

  const sourcePayload = {
    sourceId: randomUUID(),
    expectedVersion: 0,
    label: "合成原文",
    sourceStatus: "synthetic",
    mediaType: "text/plain",
    sourceText: "合成原文",
    acquiredAt: NOW,
    sourceUri: null,
    permissionNote: "仅供测试",
    validity: VALIDITY,
  };

  // 来源暂存仅允许人工；agent_tool 被拒。
  expect(
    await repo.executeWiki(write("source.stage", sourcePayload), host(workspaceId, "agent_tool")),
  ).toMatchObject({ ok: false, error: { code: "ACTION_NOT_ALLOWED" } });

  // 幂等：同一 idempotencyKey 重试来源暂存重放同一版本。
  const stageSourceCmd = write("source.stage", sourcePayload);
  const s1 = await repo.executeWiki(stageSourceCmd, host(workspaceId));
  const s2 = await repo.executeWiki(
    { ...stageSourceCmd, requestId: randomUUID() },
    host(workspaceId),
  );
  expect(s2).toEqual(s1);

  // getRevision/listRevisions 可读回暂存版本。
  const seeded = await seedPublished(file, repo, workspaceId);
  const got = await repo.executeWiki(
    read("wiki.getRevision", { revisionId: seeded.revision.revisionId }),
    host(workspaceId),
  );
  expect(got.ok).toBe(true);
  const listed = await repo.executeWiki(
    read("wiki.listRevisions", {
      documentId: seeded.revision.documentId,
      beforeVersion: null,
      limit: 20,
    }),
    host(workspaceId),
  );
  expect((listed as { ok: true; data: { records: unknown[] } }).data.records).toHaveLength(1);
  repo.close();
});

const lifecycleOf = (result: WikiResult): WikiLifecycle =>
  (result as { ok: true; data: { kind: "wikiRevision"; record: { lifecycle: WikiLifecycle } } })
    .data.record.lifecycle;

it("A-W09-1: lint 落库回执，审核绑定已存回执后批准、发布、撤回全链路", async () => {
  const file = join(temp(), "wiki.sqlite");
  const { repo, workspaceId } = openRepo(file);
  const { revision } = await seedCandidate(repo, workspaceId);
  const binding = {
    revisionId: revision.revisionId,
    contentHash: revision.contentHash,
    sourceSetHash: revision.sourceSetHash,
  };

  // lint 产生真实回执并落库：通过版本的 outcome 为 passed。
  const receipt = repo.runWikiLint(revision.revisionId, host(workspaceId));
  expect(receipt).not.toBeNull();
  expect(receipt!.outcome).toBe("passed");
  expect(receipt!.revisionId).toBe(revision.revisionId);
  expect(receipt!.contentHash).toBe(revision.contentHash);

  // lint 成功不自动发布：检索仍为空。
  expect(pageOf(await repo.executeWiki(searchCmd(), host(workspaceId))).hits).toHaveLength(0);

  // 人工审核批准（绑定已存 lint 回执）。
  const reviewCmd = write("wiki.review", {
    ...binding,
    expectedLifecycleVersion: 1,
    decision: "approve",
    note: "人工复核通过",
    lintReceiptId: receipt!.receiptId,
  });
  const review = await repo.executeWiki(reviewCmd, host(workspaceId));
  expect(review.ok).toBe(true);
  expect(lifecycleOf(review).state).toBe("approved");
  const reviewId = lifecycleOf(review).review!.reviewId;

  // 审核幂等重放：同一 idempotencyKey、不同 requestId 返回同一结果。
  const replay = await repo.executeWiki(
    { ...reviewCmd, requestId: randomUUID() },
    host(workspaceId),
  );
  expect(replay).toEqual(review);

  // 发布。
  const publish = await repo.executeWiki(
    write("wiki.publish", { ...binding, reviewId, expectedLifecycleVersion: 2 }),
    host(workspaceId),
  );
  expect(publish.ok).toBe(true);
  expect(lifecycleOf(publish).state).toBe("published");
  expect(pageOf(await repo.executeWiki(searchCmd(), host(workspaceId))).hits).toHaveLength(1);

  // 撤回。
  const withdraw = await repo.executeWiki(
    write("wiki.withdraw", {
      revisionId: revision.revisionId,
      expectedLifecycleVersion: 3,
      note: "临时撤回",
    }),
    host(workspaceId),
  );
  expect(withdraw.ok).toBe(true);
  expect(lifecycleOf(withdraw).state).toBe("withdrawn");
  expect(pageOf(await repo.executeWiki(searchCmd(), host(workspaceId))).hits).toHaveLength(0);
  repo.close();
});

it("A-W09-2: 审核须绑定已存 lint 回执与版本 hash，批准必须通过；lint 失败可拒绝", async () => {
  const file = join(temp(), "wiki.sqlite");
  const { repo, workspaceId } = openRepo(file);
  const { revision, sources } = await seedCandidate(repo, workspaceId);
  const binding = {
    revisionId: revision.revisionId,
    contentHash: revision.contentHash,
    sourceSetHash: revision.sourceSetHash,
  };

  // 引用不存在的 lint 回执被拒。
  expect(
    await repo.executeWiki(
      write("wiki.review", {
        ...binding,
        expectedLifecycleVersion: 1,
        decision: "approve",
        note: "x",
        lintReceiptId: randomUUID(),
      }),
      host(workspaceId),
    ),
  ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });

  // 绑定错误正文 hash 被拒（与知识版本不一致）。
  const passed = repo.runWikiLint(revision.revisionId, host(workspaceId))!;
  expect(
    await repo.executeWiki(
      write("wiki.review", {
        ...binding,
        contentHash: "f".repeat(64),
        expectedLifecycleVersion: 1,
        decision: "approve",
        note: "x",
        lintReceiptId: passed.receiptId,
      }),
      host(workspaceId),
    ),
  ).toMatchObject({ ok: false, error: { code: "MISSING_FACTS" } });

  // 撤回一个来源后 lint 为 blocked：批准被拒，拒绝允许。
  const db = new Database(file);
  try {
    db.prepare("UPDATE knowledge_source SET state='withdrawn' WHERE source_revision_id=?").run(
      sources[0]!.sourceRevisionId,
    );
  } finally {
    db.close();
  }
  const blocked = repo.runWikiLint(revision.revisionId, { ...host(workspaceId), now: LATER })!;
  expect(blocked.outcome).toBe("blocked");
  expect(
    await repo.executeWiki(
      write("wiki.review", {
        ...binding,
        expectedLifecycleVersion: 1,
        decision: "approve",
        note: "x",
        lintReceiptId: blocked.receiptId,
      }),
      { ...host(workspaceId), now: LATER },
    ),
  ).toMatchObject({ ok: false, error: { code: "MISSING_FACTS" } });
  const reject = await repo.executeWiki(
    write("wiki.review", {
      ...binding,
      expectedLifecycleVersion: 1,
      decision: "reject",
      note: "来源已撤回",
      lintReceiptId: blocked.receiptId,
    }),
    { ...host(workspaceId), now: LATER },
  );
  expect(reject.ok).toBe(true);
  expect(lifecycleOf(reject).state).toBe("rejected");
  repo.close();
});

it("A-W09-3: 发布/撤回状态机边界与乐观并发版本校验", async () => {
  const file = join(temp(), "wiki.sqlite");
  const { repo, workspaceId } = openRepo(file);
  const { revision } = await seedCandidate(repo, workspaceId);
  const binding = {
    revisionId: revision.revisionId,
    contentHash: revision.contentHash,
    sourceSetHash: revision.sourceSetHash,
  };

  // 未审核不可发布，未发布不可撤回。
  expect(
    await repo.executeWiki(
      write("wiki.publish", { ...binding, reviewId: randomUUID(), expectedLifecycleVersion: 1 }),
      host(workspaceId),
    ),
  ).toMatchObject({ ok: false, error: { code: "ACTION_NOT_ALLOWED" } });
  expect(
    await repo.executeWiki(
      write("wiki.withdraw", {
        revisionId: revision.revisionId,
        expectedLifecycleVersion: 1,
        note: "x",
      }),
      host(workspaceId),
    ),
  ).toMatchObject({ ok: false, error: { code: "ACTION_NOT_ALLOWED" } });

  const receipt = repo.runWikiLint(revision.revisionId, host(workspaceId))!;
  const review = await repo.executeWiki(
    write("wiki.review", {
      ...binding,
      expectedLifecycleVersion: 1,
      decision: "approve",
      note: "通过",
      lintReceiptId: receipt.receiptId,
    }),
    host(workspaceId),
  );
  expect(review.ok).toBe(true);
  const reviewId = lifecycleOf(review).review!.reviewId;

  // 发布引用错误 reviewId 被拒；过期 expectedLifecycleVersion 被拒。
  expect(
    await repo.executeWiki(
      write("wiki.publish", { ...binding, reviewId: randomUUID(), expectedLifecycleVersion: 2 }),
      host(workspaceId),
    ),
  ).toMatchObject({ ok: false, error: { code: "MISSING_FACTS" } });
  expect(
    await repo.executeWiki(
      write("wiki.publish", { ...binding, reviewId, expectedLifecycleVersion: 1 }),
      host(workspaceId),
    ),
  ).toMatchObject({ ok: false, error: { code: "REVISION_CONFLICT" } });

  // 正确发布后，已发布版本不可再次审核。
  const publish = await repo.executeWiki(
    write("wiki.publish", { ...binding, reviewId, expectedLifecycleVersion: 2 }),
    host(workspaceId),
  );
  expect(publish.ok).toBe(true);
  expect(
    await repo.executeWiki(
      write("wiki.review", {
        ...binding,
        expectedLifecycleVersion: 3,
        decision: "reject",
        note: "x",
        lintReceiptId: receipt.receiptId,
      }),
      host(workspaceId),
    ),
  ).toMatchObject({ ok: false, error: { code: "ACTION_NOT_ALLOWED" } });
  repo.close();
});

const citationResolution = (result: WikiResult): { eligible: boolean; reasons: string[] } =>
  (
    result as {
      ok: true;
      data: {
        kind: "citationResolution";
        resolution: { eligibility: { eligible: boolean; reasons: string[] } };
      };
    }
  ).data.resolution.eligibility;

it("A-W07-3: 来源过期后历史解析标 eligible=false，新引用被拒", async () => {
  const file = join(temp(), "wiki.sqlite");
  const { repo, workspaceId } = openRepo(file);
  const seeded = await seedPublished(file, repo, workspaceId);
  const expired = seeded.sources[0]!;
  // 来源有效期改到 LATER 之前，模拟来源已过期（P0 未开放来源维护命令，直接改库构造）。
  const db = new Database(file);
  try {
    const row = db
      .prepare("SELECT data_json FROM knowledge_source WHERE source_revision_id=?")
      .get(expired.sourceRevisionId) as { data_json: string };
    const source = JSON.parse(row.data_json);
    source.validity = {
      status: "confirmed",
      validFrom: null,
      validUntil: "2026-10-22T12:00:00.000Z",
    };
    db.prepare("UPDATE knowledge_source SET data_json=? WHERE source_revision_id=?").run(
      JSON.stringify(source),
      expired.sourceRevisionId,
    );
  } finally {
    db.close();
  }

  const history = await repo.executeWiki(
    read("wiki.resolveCitation", {
      citation: seeded.citation,
      purpose: "history",
      scope: SEARCH_SCOPE,
      locale: "pt-BR",
    }),
    { ...host(workspaceId), now: LATER },
  );
  expect(history.ok).toBe(true);
  expect(citationResolution(history).eligible).toBe(false);
  expect(citationResolution(history).reasons).toContain("expired");

  const newRef = await repo.executeWiki(
    read("wiki.resolveCitation", {
      citation: seeded.citation,
      purpose: "new_reference",
      scope: SEARCH_SCOPE,
      locale: "pt-BR",
    }),
    { ...host(workspaceId), now: LATER },
  );
  expect(newRef).toMatchObject({ ok: false, error: { code: "SOURCE_CONFLICT" } });
  repo.close();
});

it("A-W07-4: 来源更新至 v2 后，旧 v1 新引用被拒，历史解析标 source_updated", async () => {
  const file = join(temp(), "wiki.sqlite");
  const { repo, workspaceId } = openRepo(file);
  const seeded = await seedPublished(file, repo, workspaceId);
  const old = seeded.sources[0]!;
  // 同一 sourceId 暂存 v2，旧 v1 仍是知识修订引用的来源。
  const staged = await repo.executeWiki(
    write("source.stage", {
      sourceId: old.sourceId,
      expectedVersion: old.version,
      label: old.label,
      sourceStatus: old.sourceStatus,
      mediaType: old.mediaType,
      sourceText: "更新后的合成来源",
      acquiredAt: old.acquiredAt,
      sourceUri: null,
      permissionNote: old.permissionNote,
      validity: VALIDITY,
    }),
    host(workspaceId),
  );
  expect(staged).toMatchObject({
    ok: true,
    data: { kind: "sourceRevision", revision: { version: 2 } },
  });

  const newRef = await repo.executeWiki(
    read("wiki.resolveCitation", {
      citation: seeded.citation,
      purpose: "new_reference",
      scope: SEARCH_SCOPE,
      locale: "pt-BR",
    }),
    host(workspaceId),
  );
  expect(newRef).toMatchObject({ ok: false, error: { code: "SOURCE_CONFLICT" } });

  const history = await repo.executeWiki(
    read("wiki.resolveCitation", {
      citation: seeded.citation,
      purpose: "history",
      scope: SEARCH_SCOPE,
      locale: "pt-BR",
    }),
    host(workspaceId),
  );
  expect(history.ok).toBe(true);
  expect(citationResolution(history).eligible).toBe(false);
  expect(citationResolution(history).reasons).toContain("source_updated");
  repo.close();
});

it("A-W09-4: lint 落库完整 KnowledgeLintReport 且 reportId=receiptId，审核按报告绑定", async () => {
  const file = join(temp(), "wiki.sqlite");
  const { repo, workspaceId } = openRepo(file);
  const { revision } = await seedCandidate(repo, workspaceId);
  const binding = {
    revisionId: revision.revisionId,
    contentHash: revision.contentHash,
    sourceSetHash: revision.sourceSetHash,
  };

  const receipt = repo.runWikiLint(revision.revisionId, host(workspaceId))!;
  expect(receipt.outcome).toBe("passed");

  // knowledge_lint.data_json 必须是完整 P1 报告（七类 coverage/issues/error）。
  const db = new Database(file);
  try {
    const row = db
      .prepare("SELECT data_json FROM knowledge_lint WHERE receipt_id=?")
      .get(receipt.receiptId) as { data_json: string };
    const report = KnowledgeLintReportSchema.parse(JSON.parse(row.data_json));
    expect(report.reportId).toBe(receipt.receiptId);
    expect(report.status).toBe("completed");
    expect(report.coverage).toHaveLength(7);
    expect(report.coverage.every((c) => c.status === "passed")).toBe(true);
    expect(report.issues).toHaveLength(0);
    expect(report.error).toBeNull();
  } finally {
    db.close();
  }

  // 审核绑定已存完整报告后批准。
  const review = await repo.executeWiki(
    write("wiki.review", {
      ...binding,
      expectedLifecycleVersion: 1,
      decision: "approve",
      note: "通过",
      lintReceiptId: receipt.receiptId,
    }),
    host(workspaceId),
  );
  expect(review.ok).toBe(true);
  expect(lifecycleOf(review).state).toBe("approved");
  repo.close();
});

it("A-W09-5: 同键重放仅 requestId/宿主时钟变化时返回首次结果", async () => {
  const file = join(temp(), "wiki.sqlite");
  const { repo, workspaceId } = openRepo(file);
  const { revision } = await seedCandidate(repo, workspaceId);
  const binding = {
    revisionId: revision.revisionId,
    contentHash: revision.contentHash,
    sourceSetHash: revision.sourceSetHash,
  };
  const receipt = repo.runWikiLint(revision.revisionId, host(workspaceId))!;
  const reviewCmd = write("wiki.review", {
    ...binding,
    expectedLifecycleVersion: 1,
    decision: "approve",
    note: "通过",
    lintReceiptId: receipt.receiptId,
  });
  const first = await repo.executeWiki(reviewCmd, host(workspaceId));
  expect(first.ok).toBe(true);

  // 仅 requestId 与宿主 now 变化，同键应重放首次结果与时间。
  const retry = await repo.executeWiki(
    { ...reviewCmd, requestId: randomUUID() },
    { ...host(workspaceId), now: LATER },
  );
  expect(retry).toEqual(first);

  // 业务输入变化（decision 由 approve 改 reject）仍必须冲突。
  const changed = await repo.executeWiki(
    {
      ...reviewCmd,
      requestId: randomUUID(),
      payload: {
        ...binding,
        expectedLifecycleVersion: 1,
        decision: "reject",
        note: "通过",
        lintReceiptId: receipt.receiptId,
      },
    },
    host(workspaceId),
  );
  expect(changed).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_CONFLICT" } });
  repo.close();
});

it("A-W09-6: 发布前来源更新/到期/撤回被拒，不写发布/事件/成功幂等", async () => {
  for (const kind of ["updated", "expired", "withdrawn"] as const) {
    const file = join(temp(), `wiki-pub-${kind}.sqlite`);
    const { repo, workspaceId } = openRepo(file);
    const { revision, sources } = await seedCandidate(repo, workspaceId);
    const binding = {
      revisionId: revision.revisionId,
      contentHash: revision.contentHash,
      sourceSetHash: revision.sourceSetHash,
    };
    const receipt = repo.runWikiLint(revision.revisionId, host(workspaceId))!;
    const review = await repo.executeWiki(
      write("wiki.review", {
        ...binding,
        expectedLifecycleVersion: 1,
        decision: "approve",
        note: "通过",
        lintReceiptId: receipt.receiptId,
      }),
      host(workspaceId),
    );
    expect(review.ok).toBe(true);
    const reviewId = lifecycleOf(review).review!.reviewId;
    const source = sources[0]!;

    // 批准后、发布提交前，来源发生资格变化。
    if (kind === "updated") {
      await repo.executeWiki(
        write("source.stage", {
          sourceId: source.sourceId,
          expectedVersion: source.version,
          label: source.label,
          sourceStatus: source.sourceStatus,
          mediaType: source.mediaType,
          sourceText: "新版本合成来源",
          acquiredAt: source.acquiredAt,
          sourceUri: null,
          permissionNote: source.permissionNote,
          validity: VALIDITY,
        }),
        { ...host(workspaceId), now: LATER },
      );
    } else {
      const db = new Database(file);
      try {
        if (kind === "expired") {
          const row = db
            .prepare("SELECT data_json FROM knowledge_source WHERE source_revision_id=?")
            .get(source.sourceRevisionId) as { data_json: string };
          const sourceJson = JSON.parse(row.data_json) as {
            validity: { validUntil: string | null };
          };
          sourceJson.validity = { ...sourceJson.validity, validUntil: "2026-10-21T00:00:00.000Z" };
          db.prepare("UPDATE knowledge_source SET data_json=? WHERE source_revision_id=?").run(
            JSON.stringify(sourceJson),
            source.sourceRevisionId,
          );
        } else {
          db.prepare(
            "UPDATE knowledge_source SET state='withdrawn' WHERE source_revision_id=?",
          ).run(source.sourceRevisionId);
        }
      } finally {
        db.close();
      }
    }

    const publish = await repo.executeWiki(
      write("wiki.publish", { ...binding, reviewId, expectedLifecycleVersion: 2 }),
      { ...host(workspaceId), now: LATER },
    );
    expect(publish).toMatchObject({ ok: false, error: { code: "SOURCE_CONFLICT" } });
    // 生命周期未被部分写入，仍为 approved。
    const after = await repo.executeWiki(
      read("wiki.getRevision", { revisionId: revision.revisionId }),
      host(workspaceId),
    );
    expect(after.ok).toBe(true);
    expect(lifecycleOf(after).state).toBe("approved");
    expect(lifecycleOf(after).publication).toBeNull();
    repo.close();
  }
});

it("A-W09-7: 失格来源（到期/被替代）lint 不返回 passed 并记录完整问题", async () => {
  for (const kind of ["expired", "updated"] as const) {
    const file = join(temp(), `wiki-lint-${kind}.sqlite`);
    const { repo, workspaceId } = openRepo(file);
    const { revision, sources } = await seedCandidate(repo, workspaceId);
    const source = sources[0]!;

    // 引用来源失格：到期或被新版本替代。
    if (kind === "updated") {
      await repo.executeWiki(
        write("source.stage", {
          sourceId: source.sourceId,
          expectedVersion: source.version,
          label: source.label,
          sourceStatus: source.sourceStatus,
          mediaType: source.mediaType,
          sourceText: "新版本合成来源",
          acquiredAt: source.acquiredAt,
          sourceUri: null,
          permissionNote: source.permissionNote,
          validity: VALIDITY,
        }),
        host(workspaceId),
      );
    } else {
      const db = new Database(file);
      try {
        const row = db
          .prepare("SELECT data_json FROM knowledge_source WHERE source_revision_id=?")
          .get(source.sourceRevisionId) as { data_json: string };
        const sourceJson = JSON.parse(row.data_json) as { validity: { validUntil: string | null } };
        sourceJson.validity = { ...sourceJson.validity, validUntil: "2026-10-21T00:00:00.000Z" };
        db.prepare("UPDATE knowledge_source SET data_json=? WHERE source_revision_id=?").run(
          JSON.stringify(sourceJson),
          source.sourceRevisionId,
        );
      } finally {
        db.close();
      }
    }

    const receipt = repo.runWikiLint(revision.revisionId, host(workspaceId))!;
    expect(receipt.outcome).not.toBe("passed");

    const db = new Database(file);
    try {
      const row = db
        .prepare("SELECT data_json FROM knowledge_lint WHERE receipt_id=?")
        .get(receipt.receiptId) as { data_json: string };
      const report = KnowledgeLintReportSchema.parse(JSON.parse(row.data_json));
      const check = kind === "updated" ? "source_updates" : "scope_validity";
      expect(report.issues.some((i) => i.check === check && i.severity === "block")).toBe(true);
    } finally {
      db.close();
    }
    repo.close();
  }
});

// -- P1 修正回归（S1 旧键 / S2 旧回执 / S3 问题身份 / S4 公共端口 / S5 unknown） --

const legacyFingerprint = (method: string, payload: unknown, context: WikiHostContext) =>
  sha(JSON.stringify({ method, payload, context }));

const reportOf = (result: unknown) =>
  (
    result as {
      ok: true;
      data: { kind: "lintReport"; report: unknown };
    }
  ).data.report;

it("A-W09-8: 旧幂等键（7e6 全 context 指纹）重开重放，业务输入变化仍冲突", async () => {
  const file = join(temp(), "wiki-legacy-idem.sqlite");
  const { repo, workspaceId } = openRepo(file);
  const sourcePayload = {
    sourceId: randomUUID(),
    expectedVersion: 0,
    label: "合成原文",
    sourceStatus: "synthetic",
    mediaType: "text/plain",
    sourceText: "合成原文A",
    acquiredAt: NOW,
    sourceUri: null,
    permissionNote: "合成 fixture，非真实政策",
    validity: VALIDITY,
  };
  const cmd = write("source.stage", sourcePayload);
  const first = await repo.executeWiki(cmd, host(workspaceId));
  expect(first.ok).toBe(true);

  // 把已存新指纹改写为 7e6 旧指纹（method/payload/完整 context 含 now）。
  const db = new Database(file);
  try {
    db.prepare("UPDATE idempotency SET request_hash=? WHERE key=?").run(
      legacyFingerprint("source.stage", sourcePayload, host(workspaceId)),
      cmd.idempotencyKey,
    );
  } finally {
    db.close();
  }
  repo.close();

  // 重开：同键/同业务输入/同身份与时钟须重放首次结果与时间。
  const reopened = new SqliteWorkspaceRepository(file);
  const replay = await reopened.executeWiki({ ...cmd, requestId: randomUUID() }, host(workspaceId));
  expect(replay).toEqual(first);
  // 业务输入变化仍拒绝。
  const changed = await reopened.executeWiki(
    { ...cmd, requestId: randomUUID(), payload: { ...sourcePayload, sourceText: "不同内容" } },
    host(workspaceId),
  );
  expect(changed).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_CONFLICT" } });
  reopened.close();
});

it("A-W09-9: 旧 receipt-only lint 行同版本/hash/checkedAt 重试原样重放", async () => {
  const file = join(temp(), "wiki-legacy-receipt.sqlite");
  const { repo, workspaceId } = openRepo(file);
  const { revision } = await seedCandidate(repo, workspaceId);
  const receipt = repo.runWikiLint(revision.revisionId, host(workspaceId))!;
  expect(receipt.outcome).toBe("passed");

  // 把完整报告改写为 7e6 的 receipt-only（data_json 只有回执本身）。
  // knowledge_lint 不可变，临时摘除 UPDATE 触发器以模拟旧库落盘形态。
  const db = new Database(file);
  try {
    db.prepare("DROP TRIGGER knowledge_lint_no_update").run();
    db.prepare("UPDATE knowledge_lint SET data_json=? WHERE receipt_id=?").run(
      JSON.stringify(receipt),
      receipt.receiptId,
    );
    db.prepare(
      "CREATE TRIGGER knowledge_lint_no_update BEFORE UPDATE ON knowledge_lint BEGIN SELECT RAISE(ABORT,'IMMUTABLE_KNOWLEDGE_LINT'); END",
    ).run();
  } finally {
    db.close();
  }
  repo.close();

  // 重开：同版本/hash/checkedAt 重试须原样返回旧回执，不返回 undefined。
  const reopened = new SqliteWorkspaceRepository(file);
  expect(reopened.runWikiLint(revision.revisionId, host(workspaceId))).toEqual(receipt);
  reopened.close();
});

it("A-W09-10: 两个不同悬空关联生成不同 issueKey，落库报告通过 schema", async () => {
  const file = join(temp(), "wiki-relations.sqlite");
  const { repo, workspaceId } = openRepo(file);
  const { revision } = await seedCandidate(repo, workspaceId);

  // 给不可变知识版本注入两个不同的悬空关联（不影响 contentHash/sourceSetHash）。
  const db = new Database(file);
  try {
    const row = db
      .prepare("SELECT data_json FROM knowledge_wiki WHERE revision_id=?")
      .get(revision.revisionId) as { data_json: string };
    const stored = JSON.parse(row.data_json) as WikiRevision;
    stored.content.relations = [
      { kind: "related", documentId: randomUUID(), revisionId: randomUUID() },
      { kind: "related", documentId: randomUUID(), revisionId: randomUUID() },
    ];
    // knowledge_wiki 不可变，临时摘除 UPDATE 触发器以注入悬空关联。
    db.prepare("DROP TRIGGER knowledge_wiki_no_update").run();
    db.prepare("UPDATE knowledge_wiki SET data_json=? WHERE revision_id=?").run(
      JSON.stringify(stored),
      revision.revisionId,
    );
    db.prepare(
      "CREATE TRIGGER knowledge_wiki_no_update BEFORE UPDATE ON knowledge_wiki BEGIN SELECT RAISE(ABORT,'IMMUTABLE_KNOWLEDGE_WIKI'); END",
    ).run();
  } finally {
    db.close();
  }

  const receipt = repo.runWikiLint(revision.revisionId, host(workspaceId))!;
  const db2 = new Database(file);
  try {
    const row = db2
      .prepare("SELECT data_json FROM knowledge_lint WHERE receipt_id=?")
      .get(receipt.receiptId) as { data_json: string };
    const report = KnowledgeLintReportSchema.parse(JSON.parse(row.data_json));
    const relationIssues = report.issues.filter((i) => i.check === "relations");
    expect(relationIssues).toHaveLength(2);
    expect(new Set(relationIssues.map((i) => i.issueKey)).size).toBe(2);
  } finally {
    db2.close();
  }
  repo.close();
});

it("A-W09-11: 公共 wiki.lint / wiki.getLintReport 端口生成并重开回读完整报告", async () => {
  const file = join(temp(), "wiki-maintenance-port.sqlite");
  const { repo, workspaceId } = openRepo(file);
  const { revision } = await seedCandidate(repo, workspaceId);
  const binding = {
    revisionId: revision.revisionId,
    contentHash: revision.contentHash,
    sourceSetHash: revision.sourceSetHash,
  };

  const linted = await repo.executeWikiMaintenance(
    write("wiki.lint", { ...binding, expectedLifecycleVersion: 1 }),
    host(workspaceId),
  );
  expect(linted.ok).toBe(true);
  const report = KnowledgeLintReportSchema.parse(reportOf(linted));
  expect(report.reportId).toBe(report.receipt.receiptId);
  expect(report.receipt.revisionId).toBe(revision.revisionId);
  expect(report.status).toBe("completed");
  repo.close();

  // 重开按 reportId 回读同一份完整报告。
  const reopened = new SqliteWorkspaceRepository(file);
  const got = await reopened.executeWikiMaintenance(
    read("wiki.getLintReport", { reportId: report.reportId }),
    host(workspaceId),
  );
  expect(got).toEqual(linted);
  reopened.close();
});

it("A-W09-12: 未知有效期如实 partial/unknown，不误判为 block", async () => {
  const file = join(temp(), "wiki-unknown-validity.sqlite");
  const { repo, workspaceId } = openRepo(file);
  const { revision } = await seedCandidate(repo, workspaceId, {
    validity: { status: "unknown", validFrom: null, validUntil: null },
  });
  const receipt = repo.runWikiLint(revision.revisionId, host(workspaceId))!;
  expect(receipt.outcome).toBe("unknown");

  const db = new Database(file);
  try {
    const row = db
      .prepare("SELECT data_json FROM knowledge_lint WHERE receipt_id=?")
      .get(receipt.receiptId) as { data_json: string };
    const report = KnowledgeLintReportSchema.parse(JSON.parse(row.data_json));
    expect(report.status).toBe("partial");
    expect(report.receipt.outcome).toBe("unknown");
    const scopeIssue = report.issues.find((i) => i.check === "scope_validity");
    expect(scopeIssue?.severity).toBe("unknown");
    expect(report.coverage.find((c) => c.check === "scope_validity")?.status).toBe("unknown");
  } finally {
    db.close();
  }
  repo.close();
});

// -- A01e 维护契约（source.withdraw / getMaintenance / resolveMaintenance /
//    analyzeImpact / getImpact / getIndexStatus / rebuildIndex / getIndexRebuild） --

const maintenanceIssueOf = (result: unknown): MaintenanceIssue =>
  (result as { ok: true; data: { kind: "maintenanceIssue"; issue: MaintenanceIssue } }).data.issue;
const maintenancePageOf = (result: unknown): MaintenancePage =>
  (result as { ok: true; data: { kind: "maintenancePage"; page: MaintenancePage } }).data.page;
const impactReportOf = (result: unknown): KnowledgeImpactReport =>
  (result as { ok: true; data: { kind: "impactReport"; report: KnowledgeImpactReport } }).data
    .report;
const impactPageOf = (result: unknown): KnowledgeImpactPage =>
  (result as { ok: true; data: { kind: "impactPage"; page: KnowledgeImpactPage } }).data.page;
const indexStatusOf = (result: unknown): KnowledgeIndexStatus =>
  (result as { ok: true; data: { kind: "indexStatus"; status: KnowledgeIndexStatus } }).data.status;
const indexRebuildOf = (result: unknown): KnowledgeIndexRebuild =>
  (result as { ok: true; data: { kind: "indexRebuild"; rebuild: KnowledgeIndexRebuild } }).data
    .rebuild;
const sourceWithdrawalOf = (result: unknown) =>
  (
    result as {
      ok: true;
      data: {
        kind: "sourceWithdrawal";
        state: { state: string; lifecycleVersion: number; sourceRevisionId: string };
        event: { type: string; entityId: string };
      };
    }
  ).data;

async function stageSource(repo: SqliteWorkspaceRepository, workspaceId: string) {
  const result = WikiResultSchema.parse(
    await repo.executeWiki(
      write("source.stage", {
        sourceId: randomUUID(),
        expectedVersion: 0,
        label: "合成原文",
        sourceStatus: "synthetic",
        mediaType: "text/plain",
        sourceText: "合成来源",
        acquiredAt: NOW,
        sourceUri: null,
        permissionNote: "合成 fixture，非真实政策",
        validity: VALIDITY,
      }),
      host(workspaceId),
    ),
  );
  return (result as { ok: true; data: { kind: "sourceRevision"; revision: WikiSourceRevision } })
    .data.revision;
}

it("A01e-1: source.withdraw 撤回来源并登记维护队列，重复撤回被拒", async () => {
  const file = join(temp(), "wiki-maintenance-withdraw.sqlite");
  const { repo, workspaceId } = openRepo(file);
  const source = await stageSource(repo, workspaceId);

  const withdraw = await repo.executeWikiMaintenance(
    write("source.withdraw", {
      sourceRevisionId: source.sourceRevisionId,
      expectedLifecycleVersion: 1,
      note: "来源撤回测试",
    }),
    host(workspaceId),
  );
  expect(withdraw.ok).toBe(true);
  const withdrawal = sourceWithdrawalOf(withdraw);
  expect(withdrawal.state).toMatchObject({ state: "withdrawn", lifecycleVersion: 2 });
  expect(withdrawal.event).toMatchObject({
    type: "source.withdrawn",
    entityId: source.sourceRevisionId,
  });

  const page = maintenancePageOf(
    await repo.executeWikiMaintenance(
      read("wiki.getMaintenance", {
        kinds: ["source_withdrawn"],
        states: [],
        limit: 10,
        cursor: null,
      }),
      host(workspaceId),
    ),
  );
  expect(page.issues).toHaveLength(1);
  expect(page.issues[0]).toMatchObject({ kind: "source_withdrawn", state: "open" });

  expect(
    await repo.executeWikiMaintenance(
      write("source.withdraw", {
        sourceRevisionId: source.sourceRevisionId,
        expectedLifecycleVersion: 2,
        note: "再次撤回",
      }),
      host(workspaceId),
    ),
  ).toMatchObject({ ok: false, error: { code: "ACTION_NOT_ALLOWED" } });
  repo.close();
});

it("A01e-1b: maintenance write retries replay the first result and event identity", async () => {
  const file = join(temp(), "wiki-maintenance-replay.sqlite");
  const { repo, workspaceId } = openRepo(file);
  const source = await stageSource(repo, workspaceId);
  const command = write("source.withdraw", {
    sourceRevisionId: source.sourceRevisionId,
    expectedLifecycleVersion: 1,
    note: "同键重试",
  });
  const first = await repo.executeWikiMaintenance(command, host(workspaceId));
  const replay = await repo.executeWikiMaintenance(command, { ...host(workspaceId), now: LATER });
  expect(replay).toEqual(first);
  const db = new Database(file);
  try {
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM outbox WHERE type='source.withdrawn'").get(),
    ).toEqual({ count: 1 });
    expect(
      db
        .prepare("SELECT COUNT(*) AS count FROM idempotency WHERE key=?")
        .get(command.idempotencyKey),
    ).toEqual({ count: 1 });
  } finally {
    db.close();
  }
  repo.close();
});

it("A01e-2: getMaintenance 稳定分页，resolveMaintenance 按 OCC 推进生命周期", async () => {
  const file = join(temp(), "wiki-maintenance-resolve.sqlite");
  const { repo, workspaceId } = openRepo(file);
  for (const source of [
    await stageSource(repo, workspaceId),
    await stageSource(repo, workspaceId),
  ]) {
    expect(
      (
        await repo.executeWikiMaintenance(
          write("source.withdraw", {
            sourceRevisionId: source.sourceRevisionId,
            expectedLifecycleVersion: 1,
            note: "撤回",
          }),
          host(workspaceId),
        )
      ).ok,
    ).toBe(true);
  }

  const first = maintenancePageOf(
    await repo.executeWikiMaintenance(
      read("wiki.getMaintenance", { kinds: [], states: [], limit: 1, cursor: null }),
      host(workspaceId),
    ),
  );
  expect(first.issues).toHaveLength(1);
  expect(first.nextCursor).not.toBeNull();
  const second = maintenancePageOf(
    await repo.executeWikiMaintenance(
      read("wiki.getMaintenance", { kinds: [], states: [], limit: 1, cursor: first.nextCursor }),
      host(workspaceId),
    ),
  );
  expect(second.issues).toHaveLength(1);
  expect(second.issues[0]!.issueId).not.toBe(first.issues[0]!.issueId);

  const issueId = first.issues[0]!.issueId;
  const issueTarget = first.issues[0]!.target;
  const resolveEvidenceId =
    issueTarget.kind === "source" ? issueTarget.sourceRevisionId : issueTarget.revisionId;
  expect(
    await repo.executeWikiMaintenance(
      write("wiki.resolveMaintenance", {
        issueId,
        expectedIssueVersion: 99,
        action: "start_review",
        note: "处理",
        evidenceIds: [randomUUID()],
      }),
      host(workspaceId),
    ),
  ).toMatchObject({ ok: false, error: { code: "REVISION_CONFLICT" } });

  const started = maintenanceIssueOf(
    await repo.executeWikiMaintenance(
      write("wiki.resolveMaintenance", {
        issueId,
        expectedIssueVersion: 1,
        action: "start_review",
        note: "处理",
        evidenceIds: [randomUUID()],
      }),
      host(workspaceId),
    ),
  );
  expect(started).toMatchObject({ state: "in_progress", issueVersion: 2 });

  const resolved = maintenanceIssueOf(
    await repo.executeWikiMaintenance(
      write("wiki.resolveMaintenance", {
        issueId,
        expectedIssueVersion: 2,
        action: "resolve",
        note: "已处理",
        evidenceIds: [resolveEvidenceId],
      }),
      host(workspaceId),
    ),
  );
  expect(resolved).toMatchObject({ state: "resolved", issueVersion: 3 });
  expect(resolved.resolution?.action).toBe("resolve");

  expect(
    await repo.executeWikiMaintenance(
      write("wiki.resolveMaintenance", {
        issueId,
        expectedIssueVersion: 3,
        action: "resolve",
        note: "再处理",
        evidenceIds: [randomUUID()],
      }),
      host(workspaceId),
    ),
  ).toMatchObject({ ok: false, error: { code: "ACTION_NOT_ALLOWED" } });
  repo.close();
});

it("A01e-2b: getMaintenance 首页冻结候选集/事实，续页不受并发推进影响", async () => {
  const file = join(temp(), "wiki-maintenance-snapshot.sqlite");
  const { repo, workspaceId } = openRepo(file);
  for (const source of [
    await stageSource(repo, workspaceId),
    await stageSource(repo, workspaceId),
  ]) {
    expect(
      (
        await repo.executeWikiMaintenance(
          write("source.withdraw", {
            sourceRevisionId: source.sourceRevisionId,
            expectedLifecycleVersion: 1,
            note: "撤回",
          }),
          host(workspaceId),
        )
      ).ok,
    ).toBe(true);
  }

  const first = maintenancePageOf(
    await repo.executeWikiMaintenance(
      read("wiki.getMaintenance", { kinds: [], states: [], limit: 1, cursor: null }),
      host(workspaceId),
    ),
  );
  expect(first.issues).toHaveLength(1);
  expect(first.nextCursor).not.toBeNull();
  const firstIssueId = first.issues[0]!.issueId;

  // 用独立的新查询发现第二页对应的问题 id（不消耗原快照游标）。
  const all = maintenancePageOf(
    await repo.executeWikiMaintenance(
      read("wiki.getMaintenance", { kinds: [], states: [], limit: 10, cursor: null }),
      host(workspaceId),
    ),
  );
  const otherIssue = all.issues.find((i) => i.issueId !== firstIssueId)!;
  expect(otherIssue).toBeTruthy();

  // 并发推进“下一页问题”：resolve 后 live 状态/版本随之更新。
  expect(
    (
      await repo.executeWikiMaintenance(
        write("wiki.resolveMaintenance", {
          issueId: otherIssue.issueId,
          expectedIssueVersion: 1,
          action: "start_review",
          note: "并发处理",
          evidenceIds: [randomUUID()],
        }),
        host(workspaceId),
      )
    ).ok,
  ).toBe(true);

  // 原快照续页应读回冻结的 open v1，而非并发更新后的 in_progress v2。
  const second = maintenancePageOf(
    await repo.executeWikiMaintenance(
      read("wiki.getMaintenance", { kinds: [], states: [], limit: 1, cursor: first.nextCursor }),
      host(workspaceId),
    ),
  );
  expect(second.issues).toHaveLength(1);
  expect(second.issues[0]!.issueId).toBe(otherIssue.issueId);
  expect(second.issues[0]).toMatchObject({ state: "open", issueVersion: 1 });
  repo.close();
});

it("A01e-3: analyzeImpact/getImpact 覆盖知识版本与消费，消费状态未知记 partial", async () => {
  const file = join(temp(), "wiki-maintenance-impact.sqlite");
  const { repo, workspaceId } = openRepo(file);
  const seeded = await seedPublished(file, repo, workspaceId);
  const source = seeded.sources[0]!;

  const quote = createSyntheticQuote(repo);
  await repo.executeWiki(
    write("wiki.registerConsumption", {
      consumer: {
        kind: "quote",
        entityId: quote.id,
        revisionId: quote.id,
        contentHash: sha(JSON.stringify(quote)),
      },
      citations: [seeded.citation],
    }),
    host(workspaceId),
  );

  const staged = await repo.executeWiki(
    write("source.stage", {
      sourceId: source.sourceId,
      expectedVersion: source.version,
      label: source.label,
      sourceStatus: source.sourceStatus,
      mediaType: source.mediaType,
      sourceText: "更新后的合成来源",
      acquiredAt: source.acquiredAt,
      sourceUri: null,
      permissionNote: source.permissionNote,
      validity: VALIDITY,
    }),
    host(workspaceId),
  );
  const replacement = (
    staged as { ok: true; data: { kind: "sourceRevision"; revision: WikiSourceRevision } }
  ).data.revision;

  const report = impactReportOf(
    await repo.executeWikiMaintenance(
      write("wiki.analyzeImpact", {
        target: {
          kind: "source",
          sourceId: source.sourceId,
          sourceRevisionId: source.sourceRevisionId,
          artifactHash: source.artifactHash,
        },
        reason: "source_updated",
        replacementRevisionId: replacement.sourceRevisionId,
      }),
      host(workspaceId),
    ),
  );
  expect(report.status).toBe("partial");
  expect(report.totalItems).toBeNull();
  expect(report.unknownReasons.length).toBeGreaterThan(0);

  const page = impactPageOf(
    await repo.executeWikiMaintenance(
      read("wiki.getImpact", { reportId: report.reportId, limit: 10, cursor: null }),
      host(workspaceId),
    ),
  );
  expect(page.report.reportId).toBe(report.reportId);
  expect(page.items.some((i) => i.target.kind === "knowledge")).toBe(true);
  expect(
    page.items.some((i) => i.target.kind === "consumer" && i.consumerState === "unknown"),
  ).toBe(true);
  repo.close();
});

it("A01e-3b: 无消费影响分析记 completed 且 totalItems 为知识版本数", async () => {
  const file = join(temp(), "wiki-maintenance-impact-clean.sqlite");
  const { repo, workspaceId } = openRepo(file);
  const seeded = await seedPublished(file, repo, workspaceId);
  const source = seeded.sources[0]!;

  const report = impactReportOf(
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
  expect(report.status).toBe("completed");
  expect(report.totalItems).toBe(1);

  const page = impactPageOf(
    await repo.executeWikiMaintenance(
      read("wiki.getImpact", { reportId: report.reportId, limit: 10, cursor: null }),
      host(workspaceId),
    ),
  );
  expect(page.items).toHaveLength(1);
  expect(page.items[0]!.target.kind).toBe("knowledge");
  repo.close();
});

it("A01e-4: getIndexStatus/rebuildIndex/getIndexRebuild 覆盖缺失→就绪→滞后→重建", async () => {
  const file = join(temp(), "wiki-maintenance-index.sqlite");
  const { repo, workspaceId } = openRepo(file);

  const missing = indexStatusOf(
    await repo.executeWikiMaintenance(
      read("wiki.getIndexStatus", { index: "keyword" }),
      host(workspaceId),
    ),
  );
  expect(missing).toMatchObject({
    state: "missing",
    generation: 0,
    indexedSeq: 0,
    authoritativeSeq: 0,
  });

  const rebuilt = indexRebuildOf(
    await repo.executeWikiMaintenance(
      write("wiki.rebuildIndex", {
        index: "keyword",
        expectedGeneration: 0,
        expectedAuthoritativeSeq: 0,
      }),
      host(workspaceId),
    ),
  );
  expect(rebuilt).toMatchObject({ status: "completed", targetGeneration: 1 });

  const ready = indexStatusOf(
    await repo.executeWikiMaintenance(
      read("wiki.getIndexStatus", { index: "keyword" }),
      host(workspaceId),
    ),
  );
  expect(ready).toMatchObject({
    state: "ready",
    generation: 1,
    indexedSeq: 0,
    authoritativeSeq: 0,
  });

  const got = indexRebuildOf(
    await repo.executeWikiMaintenance(
      read("wiki.getIndexRebuild", { rebuildId: rebuilt.rebuildId }),
      host(workspaceId),
    ),
  );
  expect(got.rebuildId).toBe(rebuilt.rebuildId);

  await stageSource(repo, workspaceId);
  const stale = indexStatusOf(
    await repo.executeWikiMaintenance(
      read("wiki.getIndexStatus", { index: "keyword" }),
      host(workspaceId),
    ),
  );
  expect(stale).toMatchObject({
    state: "stale",
    generation: 1,
    indexedSeq: 0,
    authoritativeSeq: 1,
  });

  expect(
    await repo.executeWikiMaintenance(
      write("wiki.rebuildIndex", {
        index: "keyword",
        expectedGeneration: 0,
        expectedAuthoritativeSeq: 1,
      }),
      host(workspaceId),
    ),
  ).toMatchObject({ ok: false, error: { code: "REVISION_CONFLICT" } });

  const rebuilt2 = indexRebuildOf(
    await repo.executeWikiMaintenance(
      write("wiki.rebuildIndex", {
        index: "keyword",
        expectedGeneration: 1,
        expectedAuthoritativeSeq: 1,
      }),
      host(workspaceId),
    ),
  );
  expect(rebuilt2).toMatchObject({ status: "completed", targetGeneration: 2 });
  repo.close();
});

it("A01e-4b: rebuildIndex 实际构建并原子切换分代投影，markdown/keyword 均物化", async () => {
  const file = join(temp(), "wiki-maintenance-index-projection.sqlite");
  const { repo, workspaceId } = openRepo(file);
  await seedPublished(file, repo, workspaceId);

  const status = indexStatusOf(
    await repo.executeWikiMaintenance(
      read("wiki.getIndexStatus", { index: "markdown_view" }),
      host(workspaceId),
    ),
  );
  const rebuilt = indexRebuildOf(
    await repo.executeWikiMaintenance(
      write("wiki.rebuildIndex", {
        index: "markdown_view",
        expectedGeneration: status.generation,
        expectedAuthoritativeSeq: status.authoritativeSeq,
      }),
      host(workspaceId),
    ),
  );
  expect(rebuilt).toMatchObject({ status: "completed", targetGeneration: status.generation + 1 });

  const db = new Database(file);
  try {
    const markdown = db
      .prepare(
        "SELECT generation, document_id, revision_id, markdown FROM knowledge_index_markdown WHERE workspace_id=? AND generation=?",
      )
      .all(workspaceId, rebuilt.targetGeneration) as {
      generation: number;
      document_id: string;
      revision_id: string;
      markdown: string;
    }[];
    expect(markdown).toHaveLength(1);
    expect(markdown[0]).toMatchObject({
      generation: rebuilt.targetGeneration,
      markdown: expect.stringContaining("Inspect"),
    });

    const keywords = db
      .prepare(
        "SELECT DISTINCT keyword FROM knowledge_index_keyword WHERE workspace_id=? AND generation=?",
      )
      .all(workspaceId, rebuilt.targetGeneration) as { keyword: string }[];
    expect(keywords).toHaveLength(0); // markdown_view 只建 markdown 投影，keyword 表未写入该代际

    const keywordRebuild = indexRebuildOf(
      await repo.executeWikiMaintenance(
        write("wiki.rebuildIndex", {
          index: "keyword",
          expectedGeneration: 0,
          expectedAuthoritativeSeq: status.authoritativeSeq,
        }),
        host(workspaceId),
      ),
    );
    expect(keywordRebuild).toMatchObject({ status: "completed", targetGeneration: 1 });
    const kwRows = db
      .prepare(
        "SELECT DISTINCT keyword FROM knowledge_index_keyword WHERE workspace_id=? AND generation=?",
      )
      .all(workspaceId, keywordRebuild.targetGeneration) as { keyword: string }[];
    expect(kwRows.map((k) => k.keyword)).toEqual(
      expect.arrayContaining(["inspect", "sources", "合成"]),
    );
  } finally {
    db.close();
  }
  repo.close();
});
