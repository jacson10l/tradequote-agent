import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ExecutionContext,
  type KnowledgeDraftInput,
  KnowledgeListResultSchema,
  KnowledgeRevisionResultSchema,
} from "@tradequote/contracts";
import Database from "better-sqlite3";
import { afterEach, expect, it } from "vitest";
import { SqliteWorkspaceRepository } from "./index";

const dirs: string[] = [];
const temp = () => {
  const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "tradequote-kb-")));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const human = { actorId: "test-user", origin: "human_ui" } as const;
const agent = { actorId: "agent", origin: "agent_tool" } as const;
const job = { actorId: "job", origin: "system_job" } as const;

function openRepo(file: string): SqliteWorkspaceRepository {
  const repo = new SqliteWorkspaceRepository(file);
  repo.commit(
    {
      schemaVersion: 1,
      requestId: randomUUID(),
      idempotencyKey: randomUUID(),
      method: "workspace.create",
      payload: { name: "知识测试工作区" },
    },
    human,
  );
  return repo;
}

const SOURCE = "合成规则：请填写付款条款。"; // 13 UTF-16 units
const draft = (overrides: Partial<KnowledgeDraftInput> = {}): KnowledgeDraftInput => ({
  documentId: randomUUID(),
  expectedVersion: 0,
  title: "合成付款规则（测试）",
  scope: { platforms: ["alibaba_intl_rfq"], markets: ["DE"], categories: ["apparel-tshirt"] },
  sourceStatus: "synthetic",
  sourceLabel: "B00 合成文本，非真实政策",
  sourceText: SOURCE,
  location: { kind: "text", start: 0, end: SOURCE.length },
  rules: [
    {
      ruleId: randomUUID(),
      category: "commercial_terms",
      title: "填写付款条款",
      message: "合成检查：付款条款为空",
      suggestedAction: "补充付款条件后重新检查",
      field: "payment",
      condition: { kind: "required" },
      failureSeverity: "warning",
    },
  ],
  ...overrides,
});

const stageCmd = (payload: KnowledgeDraftInput) => ({
  schemaVersion: 1 as const,
  requestId: randomUUID(),
  idempotencyKey: randomUUID(),
  method: "knowledge.stage" as const,
  payload,
});
const publishCmd = (payload: { revisionId: string; sourceHash: string }) => ({
  schemaVersion: 1 as const,
  requestId: randomUUID(),
  idempotencyKey: randomUUID(),
  method: "knowledge.publish" as const,
  payload,
});
const queryCmd = (scope: { platform: string; market: string; category: string }) => ({
  schemaVersion: 1 as const,
  requestId: randomUUID(),
  method: "knowledge.query" as const,
  payload: { scope, at: new Date().toISOString() },
});
const getCmd = (revisionId: string) => ({
  schemaVersion: 1 as const,
  requestId: randomUUID(),
  method: "knowledge.getRevision" as const,
  payload: { revisionId },
});

const okRevision = (repo: SqliteWorkspaceRepository, cmd: unknown, ctx: ExecutionContext) =>
  KnowledgeRevisionResultSchema.parse(repo.executeKnowledge(cmd, ctx));
const idOf = (r: ReturnType<typeof okRevision>) =>
  r.ok && r.data.kind === "revision" ? r.data.revision.revisionId : "";
const hashOf = (r: ReturnType<typeof okRevision>) =>
  r.ok && r.data.kind === "revision" ? r.data.revision.sourceHash : "";
const rowCount = (file: string) => {
  const db = new Database(file, { readonly: true });
  try {
    return (db.prepare("SELECT COUNT(*) AS n FROM knowledge_revision").get() as { n: number }).n;
  } finally {
    db.close();
  }
};

const SCOPE = { platform: "alibaba_intl_rfq", market: "DE", category: "apparel-tshirt" };

it("A01-1: staged invisible; publish human-only and hash-gated", () => {
  const file = join(temp(), "kb.sqlite");
  const repo = openRepo(file);
  const input = draft();
  const staged = okRevision(repo, stageCmd(input), human);
  expect(staged.ok && staged.data.kind === "revision" && staged.data.revision.status).toBe(
    "staged",
  );
  const empty = KnowledgeListResultSchema.parse(repo.executeKnowledge(queryCmd(SCOPE), human));
  expect(empty.ok && empty.data.revisions).toHaveLength(0);

  const id = idOf(staged);
  const h = hashOf(staged);
  for (const ctx of [agent, job]) {
    const denied = repo.executeKnowledge(publishCmd({ revisionId: id, sourceHash: h }), ctx) as {
      ok: boolean;
      error?: { code: string };
    };
    expect(denied.ok).toBe(false);
    expect(denied.error?.code).toBe("ACTION_NOT_ALLOWED");
  }
  const wrong = repo.executeKnowledge(
    publishCmd({ revisionId: id, sourceHash: "f".repeat(64) }),
    human,
  ) as { ok: boolean; error?: { code: string } };
  expect(wrong.ok).toBe(false);
  expect(wrong.error?.code).toBe("SOURCE_CONFLICT");

  const published = okRevision(repo, publishCmd({ revisionId: id, sourceHash: h }), human);
  expect(published.ok && published.data.revision.status).toBe("published");
  const found = KnowledgeListResultSchema.parse(repo.executeKnowledge(queryCmd(SCOPE), human));
  expect(found.ok && found.data.revisions).toHaveLength(1);
  repo.close();
});

it("A01-2: same-key retry once; key reuse conflicts; failed stage writes nothing", () => {
  const file = join(temp(), "kb.sqlite");
  const repo = openRepo(file);
  const input = draft();
  const command = stageCmd(input);
  const first = okRevision(repo, command, human);
  const retry = okRevision(repo, { ...command, requestId: randomUUID() }, human);
  expect(retry).toEqual(first);
  expect(rowCount(file)).toBe(1); // replay added no row
  const reuse = repo.executeKnowledge(
    { ...command, payload: draft({ documentId: input.documentId }) },
    human,
  ) as { ok: boolean; error?: { code: string } };
  expect(reuse.ok).toBe(false);
  expect(reuse.error?.code).toBe("IDEMPOTENCY_CONFLICT");
  // a second live stage for the same document conflicts and rolls back atomically
  const dup = repo.executeKnowledge(stageCmd(draft({ documentId: input.documentId })), human) as {
    ok: boolean;
    error?: { code: string };
  };
  expect(dup.ok).toBe(false);
  expect(dup.error?.code).toBe("REVISION_CONFLICT");
  expect(rowCount(file)).toBe(1);
  repo.close();
});

it("A01-3: edits append versions; old stays readable; query returns latest", () => {
  const file = join(temp(), "kb.sqlite");
  const repo = openRepo(file);
  const documentId = randomUUID();
  const v1 = okRevision(repo, stageCmd(draft({ documentId })), human);
  repo.executeKnowledge(publishCmd({ revisionId: idOf(v1), sourceHash: hashOf(v1) }), human);
  const v2 = okRevision(
    repo,
    stageCmd(
      draft({
        documentId,
        expectedVersion: 1,
        sourceText: "合成规则：请完整填写付款条款与币种。",
        location: { kind: "text", start: 0, end: 18 },
      }),
    ),
    human,
  );
  expect(v2.ok && v2.data.revision.version).toBe(2);
  repo.executeKnowledge(publishCmd({ revisionId: idOf(v2), sourceHash: hashOf(v2) }), human);

  const oldAgain = okRevision(repo, getCmd(idOf(v1)), human);
  expect(oldAgain.ok && oldAgain.data.revision.content.sourceText).toBe(SOURCE);
  expect(oldAgain.ok && oldAgain.data.revision.sourceHash).toBe(hashOf(v1));

  const found = KnowledgeListResultSchema.parse(
    repo.executeKnowledge(queryCmd({ platform: "alibaba_intl_rfq", market: "DE", category: "apparel-tshirt" }), human),
  );
  expect(found.ok && found.data.revisions).toHaveLength(1);
  expect(found.ok && found.data.revisions[0]?.version).toBe(2);

  const stale = repo.executeKnowledge(
    stageCmd(draft({ documentId, expectedVersion: 0 })),
    human,
  ) as { ok: boolean; error?: { code: string } };
  expect(stale.ok).toBe(false);
  expect(stale.error?.code).toBe("REVISION_CONFLICT");
  repo.close();
});

it("A01-4: bad location, empty source, surrogate split and scope mismatch are refused", () => {
  const file = join(temp(), "kb.sqlite");
  const repo = openRepo(file);
  expect(
    repo.executeKnowledge(
      stageCmd(draft({ location: { kind: "text", start: 0, end: 999 } })),
      human,
    ),
  ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  expect(repo.executeKnowledge(stageCmd(draft({ sourceText: "" })), human)).toMatchObject({
    ok: false,
    error: { code: "VALIDATION_ERROR" },
  });
  expect(
    repo.executeKnowledge(
      stageCmd(draft({ sourceText: "\u{10437}", location: { kind: "text", start: 0, end: 1 } })),
      human,
    ),
  ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  expect(rowCount(file)).toBe(0);

  const input = draft();
  const staged = okRevision(repo, stageCmd(input), human);
  repo.executeKnowledge(
    publishCmd({ revisionId: idOf(staged), sourceHash: hashOf(staged) }),
    human,
  );
  for (const scope of [
    { platform: "amazon_listing", market: "DE", category: "apparel-tshirt" },
    { platform: "alibaba_intl_rfq", market: "US", category: "apparel-tshirt" },
    { platform: "alibaba_intl_rfq", market: "DE", category: "desk-lamp" },
  ]) {
    const miss = KnowledgeListResultSchema.parse(repo.executeKnowledge(queryCmd(scope), human));
    expect(miss.ok && miss.data.revisions).toHaveLength(0);
  }
  repo.close();
});

it("A01-6: reopen keeps published knowledge; rows are immutable", () => {
  const file = join(temp(), "kb.sqlite");
  const repo = openRepo(file);
  const input = draft();
  const staged = okRevision(repo, stageCmd(input), human);
  repo.executeKnowledge(
    publishCmd({ revisionId: idOf(staged), sourceHash: hashOf(staged) }),
    human,
  );
  repo.close();

  const reopened = new SqliteWorkspaceRepository(file);
  const found = KnowledgeListResultSchema.parse(
    reopened.executeKnowledge(queryCmd(SCOPE), human),
  );
  expect(found.ok && found.data.revisions).toHaveLength(1);
  const db = new Database(file);
  expect(() => db.prepare("UPDATE knowledge_revision SET status='staged' WHERE 1=1").run()).toThrow(
    /IMMUTABLE_KNOWLEDGE/,
  );
  expect(() => db.prepare("DELETE FROM knowledge_revision WHERE 1=1").run()).toThrow(
    /IMMUTABLE_KNOWLEDGE/,
  );
  db.close();
  reopened.close();
});

it("A01-7: query falls back to the newest published version matching scope", () => {
  const file = join(temp(), "kb.sqlite");
  const repo = openRepo(file);
  const documentId = randomUUID();
  const alibaba = {
    platforms: ["alibaba_intl_rfq"],
    markets: ["DE"],
    categories: ["apparel-tshirt"],
  };
  const amazon = { ...alibaba, platforms: ["amazon_listing"] };
  const v1 = okRevision(repo, stageCmd(draft({ documentId, scope: alibaba })), human);
  repo.executeKnowledge(publishCmd({ revisionId: idOf(v1), sourceHash: hashOf(v1) }), human);
  const v2 = okRevision(
    repo,
    stageCmd(draft({ documentId, expectedVersion: 1, scope: amazon })),
    human,
  );
  repo.executeKnowledge(publishCmd({ revisionId: idOf(v2), sourceHash: hashOf(v2) }), human);
  // v2 only matches amazon; querying alibaba must fall back to v1, not drop the document.
  const found = KnowledgeListResultSchema.parse(
    repo.executeKnowledge(
      queryCmd({ platform: "alibaba_intl_rfq", market: "DE", category: "apparel-tshirt" }),
      human,
    ),
  );
  expect(found.ok && found.data.revisions).toHaveLength(1);
  expect(found.ok && found.data.revisions[0]?.version).toBe(1);
  repo.close();
});

it("A01-8: empty scope dimension is universal across any value", () => {
  const file = join(temp(), "kb.sqlite");
  const repo = openRepo(file);
  const input = draft({ scope: { platforms: [], markets: ["DE"], categories: ["apparel-tshirt"] } });
  const staged = okRevision(repo, stageCmd(input), human);
  repo.executeKnowledge(
    publishCmd({ revisionId: idOf(staged), sourceHash: hashOf(staged) }),
    human,
  );
  const found = KnowledgeListResultSchema.parse(
    repo.executeKnowledge(
      queryCmd({ platform: "amazon_listing", market: "DE", category: "apparel-tshirt" }),
      human,
    ),
  );
  expect(found.ok && found.data.revisions).toHaveLength(1);
  repo.close();
});
