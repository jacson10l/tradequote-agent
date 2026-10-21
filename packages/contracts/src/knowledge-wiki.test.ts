import { describe, expect, it } from "vitest";
import {
  type KnowledgeCitation,
  KnowledgeCitationSchema,
  KnowledgeRevisionSchema,
  RuntimeCommandSchema,
  verifyWikiIntegrity,
  WikiCitationResolutionSchema,
  WikiCommandSchema,
  WikiConsumptionInputSchema,
  WikiContentSchema,
  WikiHostContextSchema,
  type WikiLifecycle,
  WikiReviewDecisionSchema,
  type WikiRevision,
  WikiRevisionRecordSchema,
  WikiRevisionSchema,
  WikiSearchExchangeSchema,
  WikiSearchPageSchema,
  type WikiSourceRevision,
  WikiSourceStageInputSchema,
  WikiStageInputSchema,
  WikiValiditySchema,
  WorkerRequestSchema,
  wikiMethodOrigins,
  wikiSourceSetPayload,
} from "./index";
import { mockKnowledgeRevision, mockWikiCommands, mockWikiStageInput, mockWorkspace } from "./mock";

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const hash = async (value: string) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
const now = "2026-10-22T00:00:00.000Z";
const validity = { status: "confirmed" as const, validFrom: null, validUntil: null };
async function fixture() {
  const sources: WikiSourceRevision[] = await Promise.all(
    ["  合成 😀来源A\n", "Synthetic second source"].map(async (sourceText, i) => ({
      workspaceId: id(1),
      sourceId: id(10 + i),
      sourceRevisionId: id(20 + i),
      version: 1,
      parentRevisionId: null,
      label: "Synthetic original",
      sourceStatus: "synthetic",
      mediaType: "text/plain",
      sourceText,
      acquiredAt: now,
      sourceUri: null,
      permissionNote: "Synthetic fixture only",
      validity,
      artifactId: await hash(sourceText),
      artifactHash: await hash(sourceText),
      createdAt: now,
    })),
  );
  const refs = sources.map((source, i) => ({
    referenceId: id(30 + i),
    sourceId: source.sourceId,
    sourceRevisionId: source.sourceRevisionId,
    sourceVersion: 1,
    artifactHash: source.artifactHash,
    location: { kind: "text" as const, start: 0, end: source.sourceText.length },
    excerptHash: source.artifactHash,
    assertion: "fact" as const,
  }));
  const markdown = "# Synthetic SOP\nInspect both sources.\n";
  const revision: WikiRevision = {
    workspaceId: id(1),
    revisionId: id(40),
    documentId: id(41),
    version: 1,
    parentRevisionId: null,
    content: {
      kind: "sop",
      title: "Synthetic SOP",
      locale: "pt-BR",
      scope: { platforms: [], markets: [], categories: [] },
      markdown,
      validity,
      sections: [
        {
          sectionId: id(42),
          title: "Inspect",
          location: { kind: "text", start: 0, end: markdown.length },
          sourceReferenceIds: refs.map((x) => x.referenceId),
        },
      ],
      sourceRefs: refs,
      relations: [],
      rules: [],
    },
    artifactId: await hash(markdown),
    contentHash: await hash(markdown),
    sourceSetHash: await hash(wikiSourceSetPayload(refs)),
    createdAt: now,
  };
  const binding = {
    revisionId: revision.revisionId,
    contentHash: revision.contentHash,
    sourceSetHash: revision.sourceSetHash,
  };
  const review = {
    ...binding,
    workspaceId: id(1),
    expectedLifecycleVersion: 1,
    decision: "approve" as const,
    note: "Synthetic approved receipt",
    lintReceiptId: id(50),
    lintReceipt: {
      ...binding,
      receiptId: id(50),
      workspaceId: id(1),
      checkedAt: now,
      policyVersion: "synthetic-v1",
      outcome: "passed" as const,
    },
    reviewId: id(51),
    actorId: "host-human",
    decidedAt: now,
  };
  const lifecycle: WikiLifecycle = {
    revisionId: revision.revisionId,
    lifecycleVersion: 3,
    state: "published",
    review,
    publication: {
      ...binding,
      eventId: id(52),
      lifecycleVersion: 3,
      type: "published",
      reviewId: review.reviewId,
      actorId: "host-human",
      occurredAt: now,
      note: "Synthetic publication",
    },
  };
  const citation: KnowledgeCitation = {
    ...binding,
    documentId: revision.documentId,
    version: 1,
    sectionId: id(42),
    sourceRefs: refs,
  };
  const resolution = {
    purpose: "new_reference" as const,
    currentPublicationRevisionId: revision.revisionId,
    citation,
    revision,
    lifecycle,
    sources,
    sourceStates: sources.map((s) => ({
      sourceRevisionId: s.sourceRevisionId,
      lifecycleVersion: 1,
      state: "active" as const,
      changedAt: now,
    })),
    eligibility: { eligible: true as const, reasons: [] },
    checkedAt: now,
  };
  const hit = {
    revision,
    lifecycle,
    eligibility: { eligible: true as const, reasons: [] },
    publicationHead: {
      snapshotRevisionId: revision.revisionId,
      currentRevisionId: revision.revisionId,
    },
    citations: [citation],
  };
  const page = {
    snapshotId: id(60),
    queryHash: await hash("synthetic query"),
    snapshotAt: now,
    checkedAt: now,
    hits: [hit],
    nextCursor: null,
  };
  return { sources, revision, lifecycle, citation, review, resolution, hit, page };
}
const query = {
  keywords: ["inspect"],
  scope: { platform: "RFQ", market: "Brazil", category: "板材" },
  locale: "pt-BR",
  kinds: [],
  limit: 20,
  cursor: null,
};
describe("B00a P0 Wiki contracts", async () => {
  it("supports Markdown SOP/term without fabricated rules and explicit section-bound rules", async () => {
    const { revision } = await fixture();
    for (const kind of ["sop", "term"])
      expect(WikiContentSchema.safeParse({ ...revision.content, kind }).success).toBe(true);
    const rule = mockKnowledgeRevision.content.rules[0];
    expect(
      WikiContentSchema.safeParse({
        ...revision.content,
        kind: "rule",
        rules: [{ sectionId: id(42), definition: rule }],
      }).success,
    ).toBe(true);
    for (const content of [
      { ...revision.content, kind: "rule" },
      { ...revision.content, rules: [{ sectionId: id(42), definition: rule }] },
      { ...revision.content, kind: "rule", rules: [{ sectionId: id(999), definition: rule }] },
      {
        ...revision.content,
        kind: "rule",
        rules: [
          { sectionId: id(42), definition: rule },
          { sectionId: id(42), definition: rule },
        ],
      },
    ])
      expect(WikiContentSchema.safeParse(content).success).toBe(false);
  });
  it("rejects dangling, omitted, duplicate and conflicting source/section identities", async () => {
    const { revision } = await fixture();
    const content = revision.content;
    for (const value of [
      { ...content, sourceRefs: [] },
      { ...content, sections: [] },
      { ...content, sourceRefs: [...content.sourceRefs, ...content.sourceRefs] },
      { ...content, sections: [...content.sections, ...content.sections] },
      { ...content, sections: [{ ...content.sections[0], sourceReferenceIds: [id(999)] }] },
      { ...content, sections: [{ ...content.sections[0], sourceReferenceIds: [id(30)] }] },
      {
        ...content,
        sourceRefs: [content.sourceRefs[0], { ...content.sourceRefs[1], sourceRevisionId: id(20) }],
      },
    ])
      expect(WikiContentSchema.safeParse(value).success).toBe(false);
  });
  it("preserves whitespace and rejects out-of-bounds/split-surrogate Markdown and source positions", async () => {
    const { revision, sources } = await fixture();
    expect(await verifyWikiIntegrity(revision, sources, hash)).toEqual({ valid: true });
    expect(WikiStageInputSchema.parse(mockWikiStageInput).content.markdown).toBe(
      mockWikiStageInput.content.markdown,
    );
    expect(
      WikiContentSchema.safeParse({
        ...revision.content,
        sections: [
          { ...revision.content.sections[0], location: { kind: "text", start: 0, end: 9999 } },
        ],
      }).success,
    ).toBe(false);
    const first = sources[0];
    expect(first).toBeDefined();
    const bad = structuredClone(revision);
    bad.content.sourceRefs[0]!.location = { kind: "text", start: 5, end: 6 };
    expect(await verifyWikiIntegrity(bad, sources, hash)).toEqual({
      valid: false,
      reason: "source_mismatch",
    });
    expect(
      WikiValiditySchema.safeParse({ ...validity, validFrom: now, validUntil: now }).success,
    ).toBe(false);
  });
  it("verifies every original, Markdown, excerpt and canonical source-set hash", async () => {
    const { revision, sources } = await fixture();
    expect(wikiSourceSetPayload([...revision.content.sourceRefs].reverse())).toBe(
      wikiSourceSetPayload(revision.content.sourceRefs),
    );
    expect(
      wikiSourceSetPayload([...revision.content.sourceRefs, revision.content.sourceRefs[0]!]),
    ).toBe(wikiSourceSetPayload(revision.content.sourceRefs));
    const mutations = [
      async () => {
        const r = structuredClone(revision);
        r.content.markdown += "tampered";
        return [r, sources] as const;
      },
      async () => {
        const r = structuredClone(revision);
        r.content.sourceRefs[1]!.excerptHash = await hash("forged");
        return [r, sources] as const;
      },
      async () => {
        const r = structuredClone(revision);
        r.sourceSetHash = await hash("forged");
        return [r, sources] as const;
      },
      async () => {
        const s = structuredClone(sources);
        s[1]!.sourceText += "tampered";
        return [revision, s] as const;
      },
    ];
    for (const mutate of mutations) {
      const [r, s] = await mutate();
      expect(await verifyWikiIntegrity(r, s, hash)).toEqual({
        valid: false,
        reason: "hash_mismatch",
      });
    }
    expect((await verifyWikiIntegrity(revision, sources.slice(0, 1), hash)).valid).toBe(false);
    expect((await verifyWikiIntegrity(revision, [...sources, sources[0]!], hash)).valid).toBe(
      false,
    );
    const otherWorkspace = structuredClone(sources);
    otherWorkspace[1]!.workspaceId = id(999);
    expect(await verifyWikiIntegrity(revision, otherWorkspace, hash)).toEqual({
      valid: false,
      reason: "source_mismatch",
    });
  });
  it("separates immutable revisions, parent chains and host authority from candidate proposals", async () => {
    const { revision } = await fixture();
    expect(WikiRevisionSchema.safeParse(revision).success).toBe(true);
    expect(WikiRevisionSchema.safeParse({ ...revision, version: 2 }).success).toBe(false);
    expect(
      WikiRevisionSchema.safeParse({ ...revision, artifactId: await hash("wrong") }).success,
    ).toBe(false);
    for (const extra of [
      { actorId: "model" },
      { status: "published" },
      { contentHash: revision.contentHash },
      { workspaceId: id(1) },
      { path: "/tmp/original" },
    ])
      expect(WikiStageInputSchema.safeParse({ ...mockWikiStageInput, ...extra }).success).toBe(
        false,
      );
    expect(
      WikiSourceStageInputSchema.safeParse({
        ...mockWikiCommands[0]?.payload,
        artifactHash: await hash("forged"),
      }).success,
    ).toBe(false);
    expect(
      WikiHostContextSchema.safeParse({
        workspaceId: id(1),
        actorId: "host",
        origin: "human_ui",
        now,
      }).success,
    ).toBe(true);
    expect(WikiHostContextSchema.safeParse({ actorId: "host", origin: "human_ui" }).success).toBe(
      false,
    );
  });
  it("binds approval to workspace, exact revision/hashes and a passed host lint receipt", async () => {
    const { revision, lifecycle, review } = await fixture();
    expect(WikiRevisionRecordSchema.safeParse({ revision, lifecycle }).success).toBe(true);
    for (const changed of [
      { ...review, revisionId: id(999) },
      { ...review, contentHash: await hash("new body") },
      { ...review, sourceSetHash: await hash("new sources") },
      { ...review, workspaceId: id(999) },
      { ...review, lintReceipt: { ...review.lintReceipt, outcome: "unknown" } },
      { ...review, lintReceipt: { ...review.lintReceipt, outcome: "blocked" } },
    ])
      expect(WikiReviewDecisionSchema.safeParse(changed).success).toBe(false);
    expect(
      WikiRevisionRecordSchema.safeParse({
        revision: {
          ...revision,
          contentHash: await hash("new body"),
          artifactId: await hash("new body"),
        },
        lifecycle,
      }).success,
    ).toBe(false);
  });
  it("rejects fake published, mismatched approval and invalid lifecycle receipts", async () => {
    const { revision, lifecycle } = await fixture();
    for (const value of [
      { ...lifecycle, review: null },
      { ...lifecycle, state: "candidate" },
      { ...lifecycle, publication: null },
      { ...lifecycle, lifecycleVersion: 4 },
      { ...lifecycle, publication: { ...lifecycle.publication, reviewId: id(999) } },
      { ...lifecycle, publication: { ...lifecycle.publication, type: "withdrawn" } },
    ])
      expect(WikiRevisionRecordSchema.safeParse({ revision, lifecycle: value }).success).toBe(
        false,
      );
  });
  it("permits a multi-source historical read but cannot resolve it as new evidence after withdrawal", async () => {
    const { resolution, lifecycle } = await fixture();
    expect(WikiCitationResolutionSchema.safeParse(resolution).success).toBe(true);
    const withdrawn = {
      ...resolution,
      purpose: "history",
      eligibility: { eligible: false, reasons: ["withdrawn"] },
      lifecycle: {
        ...lifecycle,
        state: "withdrawn",
        publication: { ...lifecycle.publication, type: "withdrawn" },
      },
    };
    expect(WikiCitationResolutionSchema.safeParse(withdrawn).success).toBe(true);
    expect(
      WikiCitationResolutionSchema.safeParse({ ...withdrawn, purpose: "new_reference" }).success,
    ).toBe(false);
    expect(
      WikiCitationResolutionSchema.safeParse({
        ...withdrawn,
        eligibility: { eligible: true, reasons: [] },
      }).success,
    ).toBe(false);
    expect(
      WikiCitationResolutionSchema.safeParse({
        ...resolution,
        sourceStates: [
          { ...resolution.sourceStates[0], state: "withdrawn" },
          resolution.sourceStates[1],
        ],
      }).success,
    ).toBe(false);
  });
  it("refuses truncated references, unknown sources, altered hash and wrong source coordinates", async () => {
    const { resolution } = await fixture();
    for (const value of [
      { ...resolution, sources: resolution.sources.slice(0, 1) },
      { ...resolution, sourceStates: [] },
      {
        ...resolution,
        citation: {
          ...resolution.citation,
          sourceRefs: resolution.citation.sourceRefs.slice(0, 1),
        },
      },
      { ...resolution, citation: { ...resolution.citation, contentHash: await hash("wrong") } },
      {
        ...resolution,
        sources: [
          { ...resolution.sources[0], version: 2, parentRevisionId: id(9) },
          resolution.sources[1],
        ],
      },
    ])
      expect(WikiCitationResolutionSchema.safeParse(value).success).toBe(false);
    expect(
      KnowledgeCitationSchema.safeParse({
        ...resolution.citation,
        sourceRefs: [...resolution.citation.sourceRefs, ...resolution.citation.sourceRefs],
      }).success,
    ).toBe(false);
  });
  it.each(["unknown", "conflict", "expired", "not_yet_valid"])(
    "never labels %s knowledge or source as eligible",
    async (reason) => {
      const { resolution, page } = await fixture();
      const invalid =
        reason === "unknown" || reason === "conflict"
          ? { ...validity, status: reason }
          : reason === "expired"
            ? { ...validity, validUntil: now }
            : { ...validity, validFrom: "2027-01-01T00:00:00.000Z" };
      expect(
        WikiCitationResolutionSchema.safeParse({
          ...resolution,
          sources: [{ ...resolution.sources[0], validity: invalid }, resolution.sources[1]],
        }).success,
      ).toBe(false);
      expect(
        WikiSearchPageSchema.safeParse({
          ...page,
          hits: [
            {
              ...page.hits[0],
              revision: {
                ...resolution.revision,
                content: { ...resolution.revision.content, validity: invalid },
              },
            },
          ],
        }).success,
      ).toBe(false);
    },
  );
  it("rejects old-version fallback, candidates and invalid citations in search hits", async () => {
    const { page, hit, revision } = await fixture();
    expect(WikiSearchPageSchema.safeParse(page).success).toBe(true);
    for (const changed of [
      { ...hit, publicationHead: { ...hit.publicationHead, snapshotRevisionId: id(999) } },
      { ...hit, publicationHead: { ...hit.publicationHead, currentRevisionId: id(999) } },
      {
        ...hit,
        lifecycle: {
          revisionId: revision.revisionId,
          lifecycleVersion: 1,
          state: "candidate",
          review: null,
          publication: null,
        },
      },
      { ...hit, citations: [{ ...hit.citations[0], sourceRefs: [] }] },
    ])
      expect(WikiSearchPageSchema.safeParse({ ...page, hits: [changed] }).success).toBe(false);
  });
  it("binds stable pagination to one snapshot/query and rejects replay/backward/oversized pages", async () => {
    const { page, revision } = await fixture();
    const cursor = {
      snapshotId: page.snapshotId,
      queryHash: page.queryHash,
      afterDocumentId: revision.documentId,
      afterRevisionId: revision.revisionId,
    };
    expect(WikiSearchExchangeSchema.safeParse({ query, page }).success).toBe(true);
    for (const q of [
      { ...query, limit: 0 },
      { ...query, cursor },
      { ...query, cursor: { ...cursor, snapshotId: id(999) } },
      { ...query, cursor: { ...cursor, queryHash: await hash("other filters") } },
    ])
      expect(WikiSearchExchangeSchema.safeParse({ query: q, page }).success).toBe(false);
    expect(
      WikiSearchPageSchema.safeParse({ ...page, nextCursor: { ...cursor, afterDocumentId: id(1) } })
        .success,
    ).toBe(false);
    for (const nextCursor of [cursor, { ...cursor, afterDocumentId: id(1) }])
      expect(
        WikiSearchExchangeSchema.safeParse({
          query: { ...query, cursor },
          page: { ...page, hits: [], nextCursor },
        }).success,
      ).toBe(false);
    expect(
      WikiSearchExchangeSchema.safeParse({
        query: { ...query, cursor },
        page: { ...page, hits: [], nextCursor: { ...cursor, afterDocumentId: id(999) } },
      }).success,
    ).toBe(true);
    expect(
      WikiSearchExchangeSchema.safeParse({
        query: { ...query, cursor },
        page: { ...page, hits: [], nextCursor: null },
      }).success,
    ).toBe(true); // withdrawn between pages: shorten, never revive.
  });
  it("records immutable quote/artifact versions with all references and no client authority", async () => {
    const { citation } = await fixture();
    const consumer = {
      kind: "quote",
      entityId: id(70),
      revisionId: id(71),
      contentHash: await hash("quote snapshot"),
    };
    for (const kind of ["quote", "artifact"])
      expect(
        WikiConsumptionInputSchema.safeParse({
          consumer: { ...consumer, kind },
          citations: [citation],
        }).success,
      ).toBe(true);
    for (const input of [
      { consumer, citations: [] },
      { consumer, citations: [citation, citation] },
      { consumer: { ...consumer, version: 1 }, citations: [citation] },
      { consumer, citations: [citation], registeredAt: now },
    ])
      expect(WikiConsumptionInputSchema.safeParse(input).success).toBe(false);
  });
  it("publishes an explicit host-origin policy and never grants model approval authority", async () => {
    for (const method of ["source.stage", "wiki.review", "wiki.publish", "wiki.withdraw"] as const)
      expect(wikiMethodOrigins[method]).toEqual(["human_ui"]);
    expect(wikiMethodOrigins["wiki.stage"]).toContain("agent_tool");
    const { resolution } = await fixture();
    expect(
      WikiCitationResolutionSchema.safeParse({
        ...resolution,
        currentPublicationRevisionId: id(999),
      }).success,
    ).toBe(false);
  });
  it("keeps old B00 intact and rejects every new method at existing runtime/worker boundaries", async () => {
    expect(KnowledgeRevisionSchema.parse(mockKnowledgeRevision)).toEqual(mockKnowledgeRevision);
    expect(mockWikiCommands).toHaveLength(12);
    for (const command of mockWikiCommands) {
      expect(WikiCommandSchema.safeParse(command).success, command.method).toBe(true);
      expect(RuntimeCommandSchema.safeParse(command).success).toBe(false);
      expect(WorkerRequestSchema.safeParse({ id: mockWorkspace.id, command }).success).toBe(false);
      expect(WikiCommandSchema.safeParse({ ...command, origin: "human_ui" }).success).toBe(false);
      const { idempotencyKey: _key, ...read } = { idempotencyKey: undefined, ...command };
      expect(
        WikiCommandSchema.safeParse(
          "idempotencyKey" in command ? read : { ...command, idempotencyKey: mockWorkspace.id },
        ).success,
      ).toBe(false);
    }
  });
});
