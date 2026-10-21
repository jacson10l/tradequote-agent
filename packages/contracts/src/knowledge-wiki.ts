import { z } from "zod";
import type { ExecutionContext } from "./index";
import {
  KnowledgeLocationSchema,
  KnowledgeScopeSchema,
  RuleDefinitionSchema,
  SourceHashSchema,
  SourceStatusSchema,
} from "./knowledge";
import { readEnvelope, resultSchema, writeEnvelope } from "./protocol";
import { LocaleSchema } from "./values";

const label = z.string().trim().min(1).max(200);
const note = z.string().trim().min(1).max(2000);
const version = z.number().int().positive();
const text = z.string().min(1).max(32000); // Exact bytes: never trim or normalize.
const unique = <T>(items: T[], key: (item: T) => string) =>
  new Set(items.map(key)).size === items.length;
export const WikiHostContextSchema = z.strictObject({
  workspaceId: z.uuid(),
  actorId: label,
  origin: z.enum(["human_ui", "agent_tool", "system_job"]),
  now: z.iso.datetime(),
});
export type WikiHostContext = z.infer<typeof WikiHostContextSchema> & ExecutionContext;
export const WikiEntryKindSchema = z.enum(["rule", "sop", "term"]);
export const WikiValiditySchema = z
  .strictObject({
    status: z.enum(["confirmed", "unknown", "conflict"]),
    validFrom: z.iso.datetime().nullable(),
    validUntil: z.iso.datetime().nullable(),
  })
  .refine(
    (v) =>
      v.validFrom === null ||
      v.validUntil === null ||
      Date.parse(v.validFrom) < Date.parse(v.validUntil),
    "有效期须为非空半开区间",
  );
export const WikiSourceStageInputSchema = z.strictObject({
  sourceId: z.uuid(),
  expectedVersion: z.number().int().nonnegative(),
  label,
  sourceStatus: SourceStatusSchema,
  mediaType: z.enum(["text/plain", "text/markdown"]),
  sourceText: text,
  acquiredAt: z.iso.datetime(),
  sourceUri: z
    .url()
    .max(2000)
    .refine((value) => {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
    }, "来源URL只接受不带凭据的HTTP(S)元数据")
    .nullable(),
  permissionNote: note,
  validity: WikiValiditySchema,
});
export const WikiSourceRevisionSchema = z
  .strictObject({
    workspaceId: z.uuid(),
    sourceId: z.uuid(),
    sourceRevisionId: z.uuid(),
    version,
    parentRevisionId: z.uuid().nullable(),
    label,
    sourceStatus: SourceStatusSchema,
    mediaType: z.enum(["text/plain", "text/markdown"]),
    sourceText: text,
    acquiredAt: z.iso.datetime(),
    sourceUri: z
      .url()
      .max(2000)
      .refine((value) => {
        const url = new URL(value);
        return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
      }, "来源URL只接受不带凭据的HTTP(S)元数据")
      .nullable(),
    permissionNote: note,
    validity: WikiValiditySchema,
    artifactId: SourceHashSchema,
    artifactHash: SourceHashSchema,
    createdAt: z.iso.datetime(),
  })
  .refine((v) => (v.version === 1) === (v.parentRevisionId === null), "来源父版本与序号不一致")
  .refine((v) => v.artifactId === v.artifactHash, "当前 ArtifactStore 使用内容寻址");
export const WikiSourceReferenceSchema = z.strictObject({
  referenceId: z.uuid(),
  sourceId: z.uuid(),
  sourceRevisionId: z.uuid(),
  sourceVersion: version,
  artifactHash: SourceHashSchema,
  location: KnowledgeLocationSchema,
  excerptHash: SourceHashSchema,
  assertion: z.enum(["fact", "inference", "human_note"]),
});
export const WikiSectionSchema = z.strictObject({
  sectionId: z.uuid(),
  title: label,
  location: KnowledgeLocationSchema,
  sourceReferenceIds: z
    .array(z.uuid())
    .min(1)
    .max(100)
    .refine((v) => unique(v, (x) => x), "段落来源身份不能重复"),
});
export const WikiContentSchema = z
  .strictObject({
    kind: WikiEntryKindSchema,
    title: label,
    locale: LocaleSchema,
    scope: KnowledgeScopeSchema,
    markdown: text,
    validity: WikiValiditySchema,
    sections: z.array(WikiSectionSchema).min(1).max(100),
    sourceRefs: z.array(WikiSourceReferenceSchema).min(1).max(100),
    relations: z
      .array(
        z.strictObject({
          kind: z.enum(["related", "supersedes"]),
          documentId: z.uuid(),
          revisionId: z.uuid(),
        }),
      )
      .max(100),
    rules: z
      .array(z.strictObject({ sectionId: z.uuid(), definition: RuleDefinitionSchema }))
      .max(100),
  })
  .superRefine((v, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (
      !unique(v.sections, (x) => x.sectionId) ||
      !unique(v.sourceRefs, (x) => x.referenceId) ||
      !unique(v.rules, (x) => x.definition.ruleId) ||
      !unique(v.relations, (x) => `${x.kind}:${x.revisionId}`)
    )
      fail("知识内身份不能重复");
    if ((v.kind === "rule") !== v.rules.length > 0)
      fail("规则页须有结构化规则，SOP/术语不得伪造规则");
    const refs = new Set(v.sourceRefs.map((x) => x.referenceId));
    const used = new Set(v.sections.flatMap((x) => x.sourceReferenceIds));
    if (refs.size !== used.size || [...used].some((id) => !refs.has(id)))
      fail("段落来源须完整且不能悬空");
    for (const section of v.sections)
      if (!validTextLocation(v.markdown, section.location)) fail("Markdown段落范围越界或截断字符");
    for (const rule of v.rules)
      if (!v.sections.some((s) => s.sectionId === rule.sectionId)) fail("规则必须绑定已有段落");
    const identities = new Map<string, string>();
    for (const ref of v.sourceRefs) {
      const identity = JSON.stringify([ref.sourceId, ref.sourceVersion, ref.artifactHash]);
      if (identities.has(ref.sourceRevisionId) && identities.get(ref.sourceRevisionId) !== identity)
        fail("同一来源版本元数据冲突");
      identities.set(ref.sourceRevisionId, identity);
    }
  });
export function validTextLocation(
  value: string,
  location: z.infer<typeof KnowledgeLocationSchema>,
): boolean {
  const splits = (i: number) =>
    i > 0 &&
    i < value.length &&
    /[\uD800-\uDBFF]/.test(value[i - 1] ?? "") &&
    /[\uDC00-\uDFFF]/.test(value[i] ?? "");
  return (
    Number.isInteger(location.start) &&
    Number.isInteger(location.end) &&
    location.start >= 0 &&
    location.end > location.start &&
    location.end <= value.length &&
    !splits(location.start) &&
    !splits(location.end)
  );
}
export const WikiStageInputSchema = z
  .strictObject({
    documentId: z.uuid(),
    expectedVersion: z.number().int().nonnegative(),
    parentRevisionId: z.uuid().nullable(),
    content: WikiContentSchema,
  })
  .refine(
    (v) => (v.expectedVersion === 0) === (v.parentRevisionId === null),
    "知识父版本与预期序号不一致",
  );
export const WikiRevisionSchema = z
  .strictObject({
    workspaceId: z.uuid(),
    revisionId: z.uuid(),
    documentId: z.uuid(),
    version,
    parentRevisionId: z.uuid().nullable(),
    content: WikiContentSchema,
    artifactId: SourceHashSchema,
    contentHash: SourceHashSchema,
    sourceSetHash: SourceHashSchema,
    createdAt: z.iso.datetime(),
  })
  .refine((v) => (v.version === 1) === (v.parentRevisionId === null), "知识父版本与序号不一致")
  .refine((v) => v.artifactId === v.contentHash, "当前 Markdown artifact 使用内容寻址");
export const WikiReviewBindingSchema = z.strictObject({
  revisionId: z.uuid(),
  contentHash: SourceHashSchema,
  sourceSetHash: SourceHashSchema,
});
export const WikiReviewInputSchema = WikiReviewBindingSchema.extend({
  expectedLifecycleVersion: version,
  decision: z.enum(["approve", "reject"]),
  note,
  lintReceiptId: z.uuid(),
});
export const WikiLintReceiptSchema = WikiReviewBindingSchema.extend({
  receiptId: z.uuid(),
  workspaceId: z.uuid(),
  checkedAt: z.iso.datetime(),
  policyVersion: label,
  outcome: z.enum(["passed", "blocked", "unknown"]),
});
export const WikiReviewDecisionSchema = WikiReviewInputSchema.extend({
  workspaceId: z.uuid(),
  lintReceipt: WikiLintReceiptSchema,
  reviewId: z.uuid(),
  actorId: label,
  decidedAt: z.iso.datetime(),
}).refine(
  (v) =>
    v.lintReceiptId === v.lintReceipt.receiptId &&
    v.workspaceId === v.lintReceipt.workspaceId &&
    v.revisionId === v.lintReceipt.revisionId &&
    v.contentHash === v.lintReceipt.contentHash &&
    v.sourceSetHash === v.lintReceipt.sourceSetHash &&
    (v.decision !== "approve" || v.lintReceipt.outcome === "passed") &&
    Date.parse(v.decidedAt) >= Date.parse(v.lintReceipt.checkedAt),
  "审核须绑定同工作区/版本/hash的已存lint事实，批准必须通过",
);
export const WikiPublicationEventSchema = z.strictObject({
  eventId: z.uuid(),
  revisionId: z.uuid(),
  lifecycleVersion: version,
  type: z.enum(["published", "withdrawn"]),
  reviewId: z.uuid(),
  contentHash: SourceHashSchema,
  sourceSetHash: SourceHashSchema,
  actorId: label,
  occurredAt: z.iso.datetime(),
  note,
});
// Immutable revision bytes and mutable lifecycle projection deliberately have separate versions.
export const WikiLifecycleSchema = z
  .strictObject({
    revisionId: z.uuid(),
    lifecycleVersion: version,
    state: z.enum(["candidate", "approved", "rejected", "published", "withdrawn"]),
    review: WikiReviewDecisionSchema.nullable(),
    publication: WikiPublicationEventSchema.nullable(),
  })
  .superRefine((v, ctx) => {
    const fail = () => ctx.addIssue({ code: "custom", message: "生命周期与审核发布记录不一致" });
    if (
      (v.review && v.review.revisionId !== v.revisionId) ||
      (v.publication && v.publication.revisionId !== v.revisionId)
    )
      fail();
    if (v.review && v.lifecycleVersion <= v.review.expectedLifecycleVersion) fail();
    if (v.state === "candidate" && (v.review !== null || v.publication !== null)) fail();
    if (v.state === "rejected" && (v.review?.decision !== "reject" || v.publication !== null))
      fail();
    if (v.state === "approved" && (v.review?.decision !== "approve" || v.publication !== null))
      fail();
    if (v.state === "published" || v.state === "withdrawn") {
      if (
        v.review?.decision !== "approve" ||
        v.publication?.type !== (v.state === "published" ? "published" : "withdrawn") ||
        v.publication?.reviewId !== v.review?.reviewId ||
        v.publication?.lifecycleVersion !== v.lifecycleVersion ||
        v.publication?.contentHash !== v.review?.contentHash ||
        v.publication?.sourceSetHash !== v.review?.sourceSetHash ||
        Date.parse(v.publication?.occurredAt ?? "") < Date.parse(v.review?.decidedAt ?? "")
      )
        fail();
    }
  });
export const WikiRevisionRecordSchema = z
  .strictObject({ revision: WikiRevisionSchema, lifecycle: WikiLifecycleSchema })
  .superRefine((v, ctx) => {
    const { revision: r, lifecycle: l } = v;
    if (
      r.revisionId !== l.revisionId ||
      (l.review &&
        (l.review.workspaceId !== r.workspaceId ||
          l.review.contentHash !== r.contentHash ||
          l.review.sourceSetHash !== r.sourceSetHash))
    )
      ctx.addIssue({ code: "custom", message: "审核不得复用其他版本或旧hash" });
  });
export const KnowledgeCitationSchema = WikiReviewBindingSchema.extend({
  documentId: z.uuid(),
  version,
  sectionId: z.uuid(),
  sourceRefs: z.array(WikiSourceReferenceSchema).min(1).max(100),
}).refine((v) => unique(v.sourceRefs, (x) => x.referenceId), "引用来源身份不能重复");
export const WikiIneligibilityReasonSchema = z.enum([
  "candidate",
  "rejected",
  "withdrawn",
  "expired",
  "not_yet_valid",
  "unknown",
  "conflict",
  "superseded",
  "source_unavailable",
  "source_updated",
  "scope_mismatch",
  "locale_mismatch",
]);
export const WikiEligibilitySchema = z.discriminatedUnion("eligible", [
  z.strictObject({ eligible: z.literal(true), reasons: z.tuple([]) }),
  z.strictObject({
    eligible: z.literal(false),
    reasons: z.array(WikiIneligibilityReasonSchema).min(1),
  }),
]);
const scopeQuery = z.strictObject({ platform: label, market: label, category: label });
export const WikiSearchFiltersSchema = z.strictObject({
  keywords: z
    .array(label)
    .max(20)
    .refine((v) => unique(v, (x) => x.toLocaleLowerCase("und")), "关键词不能重复"),
  scope: scopeQuery,
  locale: LocaleSchema,
  kinds: z
    .array(WikiEntryKindSchema)
    .max(3)
    .refine((v) => unique(v, (x) => x), "类型不能重复"),
});
export const WikiPageCursorSchema = z.strictObject({
  snapshotId: z.uuid(),
  queryHash: SourceHashSchema,
  afterDocumentId: z.uuid(),
  afterRevisionId: z.uuid(),
});
export const WikiSearchQuerySchema = z.strictObject({
  ...WikiSearchFiltersSchema.shape,
  limit: z.number().int().min(1).max(100),
  cursor: WikiPageCursorSchema.nullable(),
});
export const WikiPublicationHeadSchema = z.strictObject({
  snapshotRevisionId: z.uuid(),
  currentRevisionId: z.uuid(),
});
export const WikiSearchHitSchema = z
  .strictObject({
    revision: WikiRevisionSchema,
    lifecycle: WikiLifecycleSchema,
    eligibility: WikiEligibilitySchema.options[0],
    publicationHead: WikiPublicationHeadSchema,
    citations: z.array(KnowledgeCitationSchema).min(1).max(100),
  })
  .superRefine((v, ctx) => {
    if (
      !WikiRevisionRecordSchema.safeParse({ revision: v.revision, lifecycle: v.lifecycle }).success
    )
      ctx.addIssue({ code: "custom", message: "命中版本与状态不一致" });
    if (
      v.publicationHead.snapshotRevisionId !== v.revision.revisionId ||
      v.publicationHead.currentRevisionId !== v.revision.revisionId
    )
      ctx.addIssue({ code: "custom", message: "不能以旧版本绕过最新发布事实" });
    if (v.lifecycle.state !== "published")
      ctx.addIssue({ code: "custom", message: "检索只能返回有效已发布版本" });
    if (!unique(v.citations, (x) => x.sectionId))
      ctx.addIssue({ code: "custom", message: "命中段落不能重复" });
    for (const citation of v.citations)
      if (!citationMatches(citation, v.revision))
        ctx.addIssue({ code: "custom", message: "引用须含段落的全部准确来源" });
  });
export const WikiSearchPageSchema = z
  .strictObject({
    snapshotId: z.uuid(),
    queryHash: SourceHashSchema,
    snapshotAt: z.iso.datetime(),
    checkedAt: z.iso.datetime(),
    hits: z.array(WikiSearchHitSchema).max(100),
    nextCursor: WikiPageCursorSchema.nullable(),
  })
  .superRefine((v, ctx) => {
    const keys = v.hits.map((x) => `${x.revision.documentId}:${x.revision.revisionId}`);
    if (
      !unique(v.hits, (x) => x.revision.documentId) ||
      keys.some((key, i) => i > 0 && key <= (keys[i - 1] ?? ""))
    )
      ctx.addIssue({ code: "custom", message: "检索页必须按稳定身份排序且文档不能重复" });
    if (v.hits.some((hit) => !wikiValidityAllows(hit.revision.content.validity, v.checkedAt)))
      ctx.addIssue({ code: "custom", message: "未知/冲突/过期/尚未生效版本不可作为新依据" });
    if (Date.parse(v.checkedAt) < Date.parse(v.snapshotAt))
      ctx.addIssue({ code: "custom", message: "实时资格校验不能早于快照" });
    if (
      v.nextCursor &&
      (v.nextCursor.snapshotId !== v.snapshotId ||
        v.nextCursor.queryHash !== v.queryHash ||
        (keys.length > 0 &&
          `${v.nextCursor.afterDocumentId}:${v.nextCursor.afterRevisionId}` < (keys.at(-1) ?? "")))
    )
      ctx.addIssue({ code: "custom", message: "游标须固定快照/查询且不能倒退" });
  });
export const WikiSearchExchangeSchema = z
  .strictObject({ query: WikiSearchQuerySchema, page: WikiSearchPageSchema })
  .superRefine((v, ctx) => {
    const { query, page } = v;
    if (
      query.cursor &&
      page.nextCursor &&
      `${page.nextCursor.afterDocumentId}:${page.nextCursor.afterRevisionId}` <=
        `${query.cursor.afterDocumentId}:${query.cursor.afterRevisionId}`
    )
      ctx.addIssue({ code: "custom", message: "非终页游标必须严格前进，包括空页" });
    for (const hit of page.hits) {
      const { scope, locale, kind, title, markdown } = hit.revision.content;
      const dimensions = [
        [scope.platforms, query.scope.platform],
        [scope.markets, query.scope.market],
        [scope.categories, query.scope.category],
      ] as const;
      const haystack = `${title}\n${markdown}`.toLocaleLowerCase("und");
      if (
        dimensions.some(([values, value]) => values.length > 0 && !values.includes(value)) ||
        Intl.getCanonicalLocales(locale)[0] !== Intl.getCanonicalLocales(query.locale)[0] ||
        (query.kinds.length > 0 && !query.kinds.includes(kind)) ||
        query.keywords.some((word) => !haystack.includes(word.toLocaleLowerCase("und"))) ||
        Date.parse(hit.lifecycle.publication?.occurredAt ?? "") > Date.parse(page.snapshotAt)
      )
        ctx.addIssue({ code: "custom", message: "命中须匹配当前查询且不能插入快照后发布" });
    }
    if (
      page.hits.length > query.limit ||
      (query.cursor &&
        (query.cursor.snapshotId !== page.snapshotId ||
          query.cursor.queryHash !== page.queryHash ||
          page.hits.some(
            (hit) =>
              `${hit.revision.documentId}:${hit.revision.revisionId}` <=
              `${query.cursor?.afterDocumentId}:${query.cursor?.afterRevisionId}`,
          )))
    )
      ctx.addIssue({ code: "custom", message: "跨页须固定快照/查询并严格前进" });
  });
function wikiValidityAllows(validity: z.infer<typeof WikiValiditySchema>, at: string): boolean {
  return (
    validity.status === "confirmed" &&
    (validity.validFrom === null || Date.parse(validity.validFrom) <= Date.parse(at)) &&
    (validity.validUntil === null || Date.parse(at) < Date.parse(validity.validUntil))
  );
}
export const WikiCitationResolveInputSchema = z.strictObject({
  citation: KnowledgeCitationSchema,
  purpose: z.enum(["history", "new_reference"]),
  scope: scopeQuery,
  locale: LocaleSchema,
});
export const WikiSourceStateSchema = z.strictObject({
  sourceRevisionId: z.uuid(),
  lifecycleVersion: version,
  state: z.enum(["active", "withdrawn"]),
  changedAt: z.iso.datetime(),
});
export const WikiCitationResolutionSchema = z
  .strictObject({
    purpose: z.enum(["history", "new_reference"]),
    lifecycle: WikiLifecycleSchema,
    currentPublicationRevisionId: z.uuid().nullable(),
    citation: KnowledgeCitationSchema,
    revision: WikiRevisionSchema,
    sources: z.array(WikiSourceRevisionSchema).min(1).max(100),
    sourceStates: z.array(WikiSourceStateSchema).min(1).max(100),
    eligibility: WikiEligibilitySchema,
    checkedAt: z.iso.datetime(),
  })
  .superRefine((v, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (
      !WikiRevisionRecordSchema.safeParse({ revision: v.revision, lifecycle: v.lifecycle }).success
    )
      fail("解析须保留准确生命周期");
    if (
      v.eligibility.eligible &&
      (v.lifecycle.state !== "published" ||
        v.currentPublicationRevisionId !== v.revision.revisionId ||
        !wikiValidityAllows(v.revision.content.validity, v.checkedAt) ||
        v.sources.some((source) => !wikiValidityAllows(source.validity, v.checkedAt)))
    )
      fail("候选/撤回/失效知识或来源不可新引");
    if (v.purpose === "new_reference" && !v.eligibility.eligible)
      fail("新引用不得成功解析失效依据");
    if (!citationMatches(v.citation, v.revision)) fail("引用与知识段落不一致或来源不全");
    if (!unique(v.sources, (x) => x.sourceRevisionId)) fail("来源版本不能重复");
    if (
      !unique(v.sourceStates, (x) => x.sourceRevisionId) ||
      v.sourceStates.length !== v.sources.length ||
      v.sourceStates.some(
        (state) => !v.sources.some((source) => source.sourceRevisionId === state.sourceRevisionId),
      )
    )
      fail("来源状态必须逐版本完整对应");
    if (v.eligibility.eligible && v.sourceStates.some((state) => state.state !== "active"))
      fail("撤回来源不可新引");
    const needed = new Set(v.citation.sourceRefs.map((x) => x.sourceRevisionId));
    if (needed.size !== v.sources.length) fail("仅返回且必须返回全部引用来源");
    for (const ref of v.citation.sourceRefs) {
      const source = v.sources.find((x) => x.sourceRevisionId === ref.sourceRevisionId);
      if (
        !source ||
        source.workspaceId !== v.revision.workspaceId ||
        source.sourceId !== ref.sourceId ||
        source.version !== ref.sourceVersion ||
        source.artifactHash !== ref.artifactHash ||
        !validTextLocation(source.sourceText, ref.location)
      )
        fail("来源身份/hash/位置不一致");
    }
  });
function citationMatches(
  c: z.infer<typeof KnowledgeCitationSchema>,
  r: z.infer<typeof WikiRevisionSchema>,
): boolean {
  const section = r.content.sections.find((s) => s.sectionId === c.sectionId);
  if (
    !section ||
    c.revisionId !== r.revisionId ||
    c.documentId !== r.documentId ||
    c.version !== r.version ||
    c.contentHash !== r.contentHash ||
    c.sourceSetHash !== r.sourceSetHash ||
    section.sourceReferenceIds.length !== c.sourceRefs.length
  )
    return false;
  return section.sourceReferenceIds.every((id) => {
    const expected = r.content.sourceRefs.find((ref) => ref.referenceId === id);
    const actual = c.sourceRefs.find((ref) => ref.referenceId === id);
    return (
      expected &&
      actual &&
      expected.sourceId === actual.sourceId &&
      expected.sourceRevisionId === actual.sourceRevisionId &&
      expected.sourceVersion === actual.sourceVersion &&
      expected.artifactHash === actual.artifactHash &&
      expected.excerptHash === actual.excerptHash &&
      expected.assertion === actual.assertion &&
      expected.location.start === actual.location.start &&
      expected.location.end === actual.location.end
    );
  });
}
export const WikiConsumptionInputSchema = z
  .strictObject({
    consumer: z.strictObject({
      kind: z.enum(["quote", "artifact"]),
      entityId: z.uuid(),
      revisionId: z.uuid(),
      contentHash: SourceHashSchema,
    }),
    citations: z.array(KnowledgeCitationSchema).min(1).max(100),
  })
  .refine(
    (v) => unique(v.citations, (c) => `${c.revisionId}:${c.sectionId}`),
    "消费段落不能重复登记",
  );
export const WikiConsumptionSchema = WikiConsumptionInputSchema.extend({
  workspaceId: z.uuid(),
  consumptionId: z.uuid(),
  registeredAt: z.iso.datetime(),
  actorId: label,
});

export const WikiCommandSchema = z.discriminatedUnion("method", [
  z.strictObject({
    ...writeEnvelope,
    method: z.literal("source.stage"),
    payload: WikiSourceStageInputSchema,
  }),
  z.strictObject({
    ...readEnvelope,
    method: z.literal("source.getRevision"),
    payload: z.strictObject({ sourceRevisionId: z.uuid() }),
  }),
  z.strictObject({
    ...writeEnvelope,
    method: z.literal("wiki.stage"),
    payload: WikiStageInputSchema,
  }),
  z.strictObject({
    ...readEnvelope,
    method: z.literal("wiki.getRevision"),
    payload: z.strictObject({ revisionId: z.uuid() }),
  }),
  z.strictObject({
    ...readEnvelope,
    method: z.literal("wiki.listRevisions"),
    payload: z.strictObject({
      documentId: z.uuid(),
      beforeVersion: version.nullable(),
      limit: z.number().int().min(1).max(100),
    }),
  }),
  z.strictObject({
    ...writeEnvelope,
    method: z.literal("wiki.review"),
    payload: WikiReviewInputSchema,
  }),
  z.strictObject({
    ...writeEnvelope,
    method: z.literal("wiki.publish"),
    payload: WikiReviewBindingSchema.extend({
      reviewId: z.uuid(),
      expectedLifecycleVersion: version,
    }),
  }),
  z.strictObject({
    ...writeEnvelope,
    method: z.literal("wiki.withdraw"),
    payload: z.strictObject({ revisionId: z.uuid(), expectedLifecycleVersion: version, note }),
  }),
  z.strictObject({
    ...readEnvelope,
    method: z.literal("wiki.search"),
    payload: WikiSearchQuerySchema,
  }),
  z.strictObject({
    ...readEnvelope,
    method: z.literal("wiki.resolveCitation"),
    payload: WikiCitationResolveInputSchema,
  }),
  z.strictObject({
    ...writeEnvelope,
    method: z.literal("wiki.registerConsumption"),
    payload: WikiConsumptionInputSchema,
  }),
  z.strictObject({
    ...readEnvelope,
    method: z.literal("wiki.getConsumption"),
    payload: WikiConsumptionInputSchema.shape.consumer.pick({ kind: true, revisionId: true }),
  }),
]);
export const WikiConsumptionResultSchema = resultSchema(
  z.strictObject({ kind: z.literal("consumption"), consumption: WikiConsumptionSchema }),
);
export const WikiResultSchema = resultSchema(
  z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("sourceRevision"), revision: WikiSourceRevisionSchema }),
    z.strictObject({ kind: z.literal("wikiRevision"), record: WikiRevisionRecordSchema }),
    z.strictObject({
      kind: z.literal("wikiRevisions"),
      records: z.array(WikiRevisionRecordSchema).max(100),
      nextBeforeVersion: version.nullable(),
    }),
    z.strictObject({ kind: z.literal("searchPage"), page: WikiSearchPageSchema }),
    z.strictObject({
      kind: z.literal("citationResolution"),
      resolution: WikiCitationResolutionSchema,
    }),
    z.strictObject({ kind: z.literal("consumption"), consumption: WikiConsumptionSchema }),
  ]),
);
export type WikiEntryKind = z.infer<typeof WikiEntryKindSchema>;
export type WikiValidity = z.infer<typeof WikiValiditySchema>;
export type WikiSourceStageInput = z.infer<typeof WikiSourceStageInputSchema>;
export type WikiStageInput = z.infer<typeof WikiStageInputSchema>;
export type WikiReviewInput = z.infer<typeof WikiReviewInputSchema>;
export type WikiReviewDecision = z.infer<typeof WikiReviewDecisionSchema>;
export type WikiPublicationEvent = z.infer<typeof WikiPublicationEventSchema>;
export type WikiSourceState = z.infer<typeof WikiSourceStateSchema>;
export type WikiSearchPage = z.infer<typeof WikiSearchPageSchema>;
export type WikiConsumption = z.infer<typeof WikiConsumptionSchema>;
export type WikiSourceRevision = z.infer<typeof WikiSourceRevisionSchema>;
export type WikiSourceReference = z.infer<typeof WikiSourceReferenceSchema>;
export type WikiContent = z.infer<typeof WikiContentSchema>;
export type WikiRevision = z.infer<typeof WikiRevisionSchema>;
export type WikiLifecycle = z.infer<typeof WikiLifecycleSchema>;
export type WikiRevisionRecord = z.infer<typeof WikiRevisionRecordSchema>;
export type KnowledgeCitation = z.infer<typeof KnowledgeCitationSchema>;
export type WikiSearchQuery = z.infer<typeof WikiSearchQuerySchema>;
export type WikiCitationResolution = z.infer<typeof WikiCitationResolutionSchema>;
export type WikiConsumptionInput = z.infer<typeof WikiConsumptionInputSchema>;
export type WikiConsumptionResult = z.infer<typeof WikiConsumptionResultSchema>;
export type WikiCommand = z.infer<typeof WikiCommandSchema>;
export type WikiResult = z.infer<typeof WikiResultSchema>;
/** Async blob verification precedes synchronous authoritative DB commit. Never publish a projection. */
export interface WikiService {
  execute(command: WikiCommand, context: WikiHostContext): Promise<WikiResult>;
}
/** Main supplies workspace/actor/origin; no path, actor, clock or approval authority crosses the wire. */
export interface WikiClient {
  executeWiki(command: WikiCommand): Promise<WikiResult>;
}
/** Host-only participant in the SAME transaction as the immutable consumer revision/outbox/idempotency.
 * Revalidate all citations against authoritative lifecycle/source state within that transaction.
 * A standalone registration must verify that the exact consumer revision/hash already exists.
 */
export interface WikiConsumptionWriter {
  register(
    input: WikiConsumptionInput,
    context: WikiHostContext,
    idempotencyKey: string,
  ): WikiConsumptionResult;
}

/** Explicit host policy. Consumption additionally requires a verified actual consumer/transaction. */
export const wikiMethodOrigins: Record<
  WikiCommand["method"],
  readonly WikiHostContext["origin"][]
> = {
  "source.stage": ["human_ui"],
  "source.getRevision": ["human_ui", "agent_tool", "system_job"],
  "wiki.stage": ["human_ui", "agent_tool"],
  "wiki.getRevision": ["human_ui", "agent_tool", "system_job"],
  "wiki.listRevisions": ["human_ui", "agent_tool", "system_job"],
  "wiki.review": ["human_ui"],
  "wiki.publish": ["human_ui"],
  "wiki.withdraw": ["human_ui"],
  "wiki.search": ["human_ui", "agent_tool", "system_job"],
  "wiki.resolveCitation": ["human_ui", "agent_tool", "system_job"],
  "wiki.registerConsumption": ["human_ui", "agent_tool", "system_job"],
  "wiki.getConsumption": ["human_ui", "agent_tool", "system_job"],
};
