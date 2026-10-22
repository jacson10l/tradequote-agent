import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type KnowledgeCitation,
  type WikiHostContext,
  type WikiLifecycle,
  type WikiResult,
  type WikiRevision,
  type WikiSourceRevision,
  WikiResultSchema,
} from "@tradequote/contracts";
import Database from "better-sqlite3";
import { afterEach, expect, it } from "vitest";
import { SqliteWorkspaceRepository } from "./index";

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
const NOW = "2026-10-22T00:00:00.000Z";
const host = (workspaceId: string, origin: WikiHostContext["origin"] = "human_ui"): WikiHostContext => ({
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
const VALIDITY = { status: "confirmed" as const, validFrom: null, validUntil: null };

interface SeedOptions {
  documentId?: string;
  expectedVersion?: number;
  parentRevisionId?: string | null;
  markdown?: string;
  validity?: WikiRevision["content"]["validity"];
  scope?: WikiRevision["content"]["scope"];
}

interface Seeded {
  sources: WikiSourceRevision[];
  revision: WikiRevision;
  citation: KnowledgeCitation;
}

/** Stage sources + a wiki candidate through the real store, then promote the
 *  candidate to published by writing the lifecycle projection directly (publish
 *  itself is P1 and gated on a lint receipt). Returns everything search/citation
 *  paths need. */
async function seedPublished(
  file: string,
  repo: SqliteWorkspaceRepository,
  workspaceId: string,
  opts: SeedOptions = {},
): Promise<Seeded> {
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

  const binding = {
    revisionId: revision.revisionId,
    contentHash: revision.contentHash,
    sourceSetHash: revision.sourceSetHash,
  };
  const lintReceiptId = randomUUID();
  const reviewId = randomUUID();
  const lifecycle: WikiLifecycle = {
    revisionId: revision.revisionId,
    lifecycleVersion: 3,
    state: "published",
    review: {
      ...binding,
      workspaceId,
      expectedLifecycleVersion: 1,
      decision: "approve",
      note: "合成审核通过",
      lintReceiptId,
      lintReceipt: {
        ...binding,
        receiptId: lintReceiptId,
        workspaceId,
        checkedAt: NOW,
        policyVersion: "synthetic-v1",
        outcome: "passed",
      },
      reviewId,
      actorId: "host-human",
      decidedAt: NOW,
    },
    publication: {
      ...binding,
      eventId: randomUUID(),
      lifecycleVersion: 3,
      type: "published",
      reviewId,
      actorId: "host-human",
      occurredAt: NOW,
      note: "合成发布",
    },
  };
  const db = new Database(file);
  try {
    db.prepare("UPDATE knowledge_lifecycle SET state=?, data_json=? WHERE revision_id=?").run(
      "published",
      JSON.stringify(lifecycle),
      revision.revisionId,
    );
  } finally {
    db.close();
  }

  return {
    sources,
    revision,
    citation: {
      ...binding,
      documentId,
      version: revision.version,
      sectionId,
      sourceRefs: refs,
    },
  };
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
    await seedPublished(file, repo, workspaceId, { markdown: `# 合成 SOP ${i}\nInspect source ${i}.\n` });
  }
  const first = pageOf(await repo.executeWiki(searchCmd({ limit: 1 }), host(workspaceId)));
  expect(first.hits).toHaveLength(1);
  expect(first.nextCursor).not.toBeNull();
  const cursor = first.nextCursor as unknown as { snapshotId: string; queryHash: string; afterDocumentId: string };

  const second = pageOf(
    await repo.executeWiki(searchCmd({ limit: 1, cursor }), host(workspaceId)),
  );
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
      data: { kind: "citationResolution"; resolution: { sources: unknown[]; sourceStates: unknown[]; eligibility: { eligible: boolean } } };
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

  const consumer = {
    kind: "quote",
    entityId: randomUUID(),
    revisionId: randomUUID(),
    contentHash: sha("quote snapshot"),
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
      consumer: { kind: "quote", entityId: randomUUID(), revisionId: randomUUID(), contentHash: sha("other") },
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

it("A-W08: 来源/知识暂存幂等与来源校验，审核发布撤回保持不可用", async () => {
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
  const s2 = await repo.executeWiki({ ...stageSourceCmd, requestId: randomUUID() }, host(workspaceId));
  expect(s2).toEqual(s1);

  // 审核/发布/撤回仍依赖维护协议，返回 CAPABILITY_UNAVAILABLE。
  const seeded = await seedPublished(file, repo, workspaceId);
  const binding = {
    revisionId: seeded.revision.revisionId,
    contentHash: seeded.revision.contentHash,
    sourceSetHash: seeded.revision.sourceSetHash,
  };
  for (const [method, payload] of [
    [
      "wiki.review",
      { ...binding, expectedLifecycleVersion: 1, decision: "approve", note: "x", lintReceiptId: randomUUID() },
    ],
    ["wiki.publish", { ...binding, reviewId: randomUUID(), expectedLifecycleVersion: 2 }],
    ["wiki.withdraw", { revisionId: seeded.revision.revisionId, expectedLifecycleVersion: 3, note: "x" }],
  ] as const) {
    expect(await repo.executeWiki(write(method, payload), host(workspaceId)), method).toMatchObject({
      ok: false,
      error: { code: "CAPABILITY_UNAVAILABLE", retryable: false },
    });
  }

  // getRevision/listRevisions 可读回暂存版本。
  const got = await repo.executeWiki(
    read("wiki.getRevision", { revisionId: seeded.revision.revisionId }),
    host(workspaceId),
  );
  expect(got.ok).toBe(true);
  const listed = await repo.executeWiki(
    read("wiki.listRevisions", { documentId: seeded.revision.documentId, beforeVersion: null, limit: 20 }),
    host(workspaceId),
  );
  expect((listed as { ok: true; data: { records: unknown[] } }).data.records).toHaveLength(1);
  repo.close();
});
