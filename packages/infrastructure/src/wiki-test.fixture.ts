import { createHash, randomUUID } from "node:crypto";
import {
  demoCatalogCsv,
  demoScenario,
  type KnowledgeCitation,
  type TradeCommand,
  type WikiHostContext,
  type WikiLifecycle,
  WikiResultSchema,
  type WikiRevision,
  type WikiSourceRevision,
} from "@tradequote/contracts";
import Database from "better-sqlite3";
import { SqliteWorkspaceRepository } from "./index";

const NOW = "2026-10-22T00:00:00.000Z";
const host = (workspaceId: string): WikiHostContext => ({
  workspaceId,
  actorId: "test-user",
  origin: "human_ui",
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
const SOURCE_TEXTS = ["  合成 😀来源A\n", "Synthetic second source"];
const VALIDITY = { status: "confirmed" as const, validFrom: null, validUntil: null };

interface SeedOptions {
  repeatSource?: boolean;
  locale?: string;
  kind?: "rule" | "sop" | "term";
  rules?: import("@tradequote/contracts").RuleDefinition[];
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
export async function seedPublished(
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
  if (opts.repeatSource) {
    const source = sources[0]!;
    refs.push({
      ...refs[0]!,
      referenceId: randomUUID(),
      location: { kind: "text", start: 1, end: source.sourceText.length - 1 },
      excerptHash: createHash("sha256")
        .update(source.sourceText.slice(1, -1), "utf8")
        .digest("hex"),
    });
  }
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
          kind: opts.kind ?? "sop",
          title: "合成 SOP",
          locale: opts.locale ?? "pt-BR",
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
          rules: (opts.rules ?? []).map((definition) => ({ sectionId, definition })),
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

export function createSyntheticQuote(repo: SqliteWorkspaceRepository) {
  const run = (command: TradeCommand) => {
    const result = repo.executeTrade(command, { actorId: "test-user", origin: "human_ui" });
    if (!result.ok) throw new Error(result.error.message);
    return result.data;
  };
  const envelope = () => ({
    schemaVersion: 1 as const,
    requestId: randomUUID(),
    idempotencyKey: randomUUID(),
  });
  const scenario = run({
    ...envelope(),
    method: "scenario.save",
    payload: { expectedVersion: 0, scenario: demoScenario },
  }).scenario!;
  const batch = run({
    ...envelope(),
    method: "catalog.stage",
    payload: { csv: demoCatalogCsv, sourceName: "synthetic.csv", sourceStatus: "synthetic" },
  }).batches[0]!;
  const product = run({
    ...envelope(),
    method: "catalog.publish",
    payload: { batchId: batch.id, sourceHash: batch.sourceHash },
  }).products.find((p) => p.sku === "DEMO-TEE")!;
  return run({
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
  }).quotes[0]!;
}
