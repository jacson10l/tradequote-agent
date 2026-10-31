import { z } from "zod";
import type { ErrorCodeSchema } from "./errors";
import { SourceHashSchema } from "./knowledge";
import {
  WikiConsumptionInputSchema,
  type WikiHostContext,
  WikiHostContextSchema,
  WikiLintReceiptSchema,
  WikiReviewBindingSchema,
  WikiSourceStateSchema,
  WikiValiditySchema,
} from "./knowledge-wiki";
import { PublicErrorSchema, readEnvelope, resultSchema, writeEnvelope } from "./protocol";

const note = z.string().trim().min(1).max(2000);
const version = z.number().int().positive();
const unique = <T>(values: readonly T[], identity: (value: T) => string) =>
  new Set(values.map(identity)).size === values.length;
export const KnowledgeLintCheckSchema = z.enum([
  "source_integrity",
  "section_references",
  "relations",
  "scope_validity",
  "source_updates",
  "duplicates_conflicts",
  "orphans",
]);
export const KnowledgeLintIssueSchema = z.strictObject({
  issueKey: SourceHashSchema,
  check: KnowledgeLintCheckSchema,
  severity: z.enum(["block", "warning", "unknown"]),
  message: note,
  sectionIds: z
    .array(z.uuid())
    .max(100)
    .refine((v) => unique(v, (x) => x), "段落身份不能重复"),
  sourceRevisionIds: z
    .array(z.uuid())
    .max(20)
    .refine((v) => unique(v, (x) => x), "来源身份不能重复"),
});
export const KnowledgeLintReportSchema = z
  .strictObject({
    reportId: z.uuid(),
    receipt: WikiLintReceiptSchema,
    status: z.enum(["completed", "partial", "failed"]),
    coverage: z
      .array(
        z.strictObject({
          check: KnowledgeLintCheckSchema,
          status: z.enum(["passed", "issues", "unknown", "not_run"]),
        }),
      )
      .length(KnowledgeLintCheckSchema.options.length),
    issues: z.array(KnowledgeLintIssueSchema).max(100),
    error: PublicErrorSchema.nullable(),
  })
  .superRefine((v, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (
      v.reportId !== v.receipt.receiptId ||
      !unique(v.coverage, (x) => x.check) ||
      !unique(v.issues, (x) => x.issueKey)
    )
      fail("lint身份/覆盖或问题不能重复、遗漏");
    const incomplete =
      v.coverage.some((c) => c.status === "unknown" || c.status === "not_run") ||
      v.issues.some((i) => i.severity === "unknown");
    if (
      (v.status === "failed") !== (v.error !== null) ||
      (v.status === "completed" && incomplete) ||
      (v.status === "partial" && !incomplete)
    )
      fail("lint完成/未完成/失败必须如实表述");
    for (const c of v.coverage) {
      const issues = v.issues.filter((i) => i.check === c.check);
      if (
        (c.status === "passed" && issues.length > 0) ||
        (c.status === "issues" && issues.length === 0)
      )
        fail("覆盖与发现问题不一致");
    }
    const outcome =
      v.status !== "completed"
        ? "unknown"
        : v.issues.some((i) => i.severity === "block")
          ? "blocked"
          : "passed";
    if (v.receipt.outcome !== outcome) fail("不能用未完成、未知或阻断报告生成通过回执");
  });
export const MaintenanceTargetSchema = z.discriminatedUnion("kind", [
  WikiReviewBindingSchema.extend({ kind: z.literal("knowledge"), documentId: z.uuid() }),
  z.strictObject({
    kind: z.literal("source"),
    sourceId: z.uuid(),
    sourceRevisionId: z.uuid(),
    artifactHash: SourceHashSchema,
  }),
  WikiConsumptionInputSchema.shape.consumer.extend({
    kind: z.literal("consumer"),
    consumerKind: z.enum(["quote", "artifact"]),
  }),
]);
export const MaintenanceIssueKindSchema = z.enum([
  "source_updated",
  "source_withdrawn",
  "expired",
  "unknown_validity",
  "conflict",
  "broken_reference",
  "hash_mismatch",
  "orphan",
  "duplicate",
  "index_stale",
]);
export const MaintenanceResolutionSchema = z.strictObject({
  action: z.enum(["resolve", "dismiss"]),
  note,
  evidenceIds: z
    .array(z.uuid())
    .min(1)
    .max(100)
    .refine((v) => unique(v, (x) => x), "处理证据不能重复"),
  actorId: z.string().trim().min(1).max(200),
  resolvedAt: z.iso.datetime(),
});
export const MaintenanceIssueSchema = z
  .strictObject({
    workspaceId: z.uuid(),
    issueId: z.uuid(),
    issueVersion: version,
    dedupKey: SourceHashSchema,
    kind: MaintenanceIssueKindSchema,
    target: MaintenanceTargetSchema,
    severity: z.enum(["block", "warning", "unknown"]),
    message: note,
    state: z.enum(["open", "in_progress", "resolved", "dismissed"]),
    evidenceIds: z.array(z.uuid()).min(1).max(100),
    firstDetectedAt: z.iso.datetime(),
    lastDetectedAt: z.iso.datetime(),
    resolution: MaintenanceResolutionSchema.nullable(),
  })
  .refine(
    (v) =>
      Date.parse(v.lastDetectedAt) >= Date.parse(v.firstDetectedAt) &&
      (v.state === "resolved" || v.state === "dismissed") === (v.resolution !== null) &&
      (v.resolution === null ||
        (v.resolution.action === (v.state === "resolved" ? "resolve" : "dismiss") &&
          Date.parse(v.resolution.resolvedAt) >= Date.parse(v.firstDetectedAt))),
    "维护问题状态/时间与处理事实不一致",
  );
const maintenanceCursor = z.strictObject({
  snapshotId: z.uuid(),
  queryHash: SourceHashSchema,
  afterIssueId: z.uuid(),
});
export const MaintenanceQuerySchema = z.strictObject({
  kinds: z
    .array(MaintenanceIssueKindSchema)
    .max(10)
    .refine((v) => unique(v, (x) => x), "问题类型不能重复"),
  states: z
    .array(MaintenanceIssueSchema.shape.state)
    .max(4)
    .refine((v) => unique(v, (x) => x), "状态不能重复"),
  limit: z.number().int().min(1).max(100),
  cursor: maintenanceCursor.nullable(),
});
export const MaintenancePageSchema = z
  .strictObject({
    snapshotId: z.uuid(),
    queryHash: SourceHashSchema,
    checkedAt: z.iso.datetime(),
    issues: z.array(MaintenanceIssueSchema).max(100),
    nextCursor: maintenanceCursor.nullable(),
  })
  .refine(
    (v) =>
      unique(v.issues, (x) => x.issueId) &&
      v.issues.every((x, i) => i === 0 || x.issueId > (v.issues[i - 1]?.issueId ?? "")) &&
      (v.nextCursor === null ||
        (v.nextCursor.snapshotId === v.snapshotId &&
          v.nextCursor.queryHash === v.queryHash &&
          v.nextCursor.afterIssueId >= (v.issues.at(-1)?.issueId ?? ""))),
    "维护页须固定快照/查询且按issueId稳定前进",
  );
export const MaintenanceExchangeSchema = z
  .strictObject({ query: MaintenanceQuerySchema, page: MaintenancePageSchema })
  .refine(
    ({ query: q, page: p }) =>
      p.issues.length <= q.limit &&
      p.issues.every(
        (i) =>
          (q.kinds.length === 0 || q.kinds.includes(i.kind)) &&
          (q.states.length === 0 || q.states.includes(i.state)),
      ) &&
      (q.cursor === null ||
        (q.cursor.snapshotId === p.snapshotId &&
          q.cursor.queryHash === p.queryHash &&
          p.issues.every((i) => i.issueId > q.cursor!.afterIssueId) &&
          (p.nextCursor === null || p.nextCursor.afterIssueId > q.cursor.afterIssueId))),
    "跨页不可变更查询/快照或返回相等/倒退游标",
  );
export const KnowledgeImpactSubjectSchema = z
  .strictObject({
    target: MaintenanceTargetSchema,
    reason: z.enum(["source_updated", "withdrawn", "expired", "conflict"]),
    replacementRevisionId: z.uuid().nullable(),
  })
  .refine(
    (v) =>
      (v.reason === "source_updated") === (v.replacementRevisionId !== null) &&
      v.target.kind !== "consumer" &&
      (v.reason !== "source_updated" ||
        (v.target.kind === "source" && v.replacementRevisionId !== v.target.sourceRevisionId)),
    "来源更新须固定新版本，其余失效不伪造替代版本",
  );
export const KnowledgeImpactReportSchema = z
  .strictObject({
    workspaceId: z.uuid(),
    reportId: z.uuid(),
    subject: KnowledgeImpactSubjectSchema,
    snapshotSeq: z.number().int().nonnegative(),
    checkedAt: z.iso.datetime(),
    status: z.enum(["completed", "partial", "failed"]),
    totalItems: z.number().int().nonnegative().nullable(),
    unknownReasons: z.array(note).max(20),
    error: PublicErrorSchema.nullable(),
  })
  .refine(
    (v) =>
      v.status === "completed"
        ? v.totalItems !== null && v.unknownReasons.length === 0 && v.error === null
        : v.status === "partial"
          ? v.unknownReasons.length > 0 && v.error === null && v.totalItems === null
          : v.error !== null && v.totalItems === null,
    "未知/部分/失败影响分析不能冒充完整空集",
  );
export const KnowledgeImpactItemSchema = z
  .strictObject({
    itemId: z.uuid(),
    target: MaintenanceTargetSchema,
    viaKnowledgeRevisionIds: z
      .array(z.uuid())
      .min(1)
      .max(100)
      .refine((v) => unique(v, (x) => x), "影响路径版本不能重复"),
    consumptionId: z.uuid().nullable(),
    consumerState: z.enum(["draft", "final", "unknown"]).nullable(),
    requiresReview: z.boolean(),
  })
  .refine(
    (v) =>
      v.target.kind === "consumer"
        ? v.consumptionId !== null &&
          v.consumerState !== null &&
          (v.consumerState !== "final" || !v.requiresReview)
        : v.consumptionId === null && v.consumerState === null && !v.requiresReview,
    "影响项须绑定真实消费，历史最终产出只报告影响不改写",
  );
const impactCursor = z.strictObject({ reportId: z.uuid(), afterItemId: z.uuid() });
export const KnowledgeImpactPageSchema = z
  .strictObject({
    report: KnowledgeImpactReportSchema,
    items: z.array(KnowledgeImpactItemSchema).max(100),
    nextCursor: impactCursor.nullable(),
  })
  .refine(
    (v) =>
      unique(v.items, (x) => x.itemId) &&
      v.items.every((x, i) => i === 0 || x.itemId > (v.items[i - 1]?.itemId ?? "")) &&
      (v.nextCursor === null ||
        (v.nextCursor.reportId === v.report.reportId &&
          v.nextCursor.afterItemId >= (v.items.at(-1)?.itemId ?? ""))) &&
      (v.report.status !== "completed" ||
        v.items.every(
          (item) => item.target.kind !== "consumer" || item.consumerState !== "unknown",
        )) &&
      (v.report.status !== "failed" || (v.items.length === 0 && v.nextCursor === null)) &&
      (v.report.totalItems === null ||
        (v.items.length <= v.report.totalItems &&
          (v.report.totalItems !== 0 || v.nextCursor === null))),
    "影响页不得重排/重复、混报告或在失败时伪造结果",
  );
export const KnowledgeImpactQuerySchema = z
  .strictObject({
    reportId: z.uuid(),
    limit: z.number().int().min(1).max(100),
    cursor: impactCursor.nullable(),
  })
  .refine((v) => v.cursor === null || v.cursor.reportId === v.reportId, "影响查询游标不得跨报告");
export const KnowledgeImpactExchangeSchema = z
  .strictObject({ query: KnowledgeImpactQuerySchema, page: KnowledgeImpactPageSchema })
  .refine(
    ({ query: q, page: p }) =>
      q.reportId === p.report.reportId &&
      p.items.length <= q.limit &&
      (q.cursor !== null ||
        p.report.totalItems === null ||
        (p.nextCursor === null
          ? p.items.length === p.report.totalItems
          : p.items.length < p.report.totalItems)) &&
      (q.cursor === null ||
        (p.items.every((i) => i.itemId > q.cursor!.afterItemId) &&
          (p.nextCursor === null || p.nextCursor.afterItemId > q.cursor.afterItemId))),
    "影响分析跨页须固定报告并严格前进",
  );
export const KnowledgeIndexStatusSchema = z
  .strictObject({
    workspaceId: z.uuid(),
    index: z.enum(["keyword", "markdown_view"]),
    generation: z.number().int().nonnegative(),
    authoritativeSeq: z.number().int().nonnegative(),
    indexedSeq: z.number().int().nonnegative(),
    state: z.enum(["missing", "ready", "stale", "rebuilding", "failed"]),
    rebuildId: z.uuid().nullable(),
    checkedAt: z.iso.datetime(),
    error: PublicErrorSchema.nullable(),
  })
  .refine(
    (v) =>
      v.indexedSeq <= v.authoritativeSeq &&
      (v.state === "failed") === (v.error !== null) &&
      (v.state === "rebuilding") === (v.rebuildId !== null) &&
      (v.state !== "ready" || (v.generation > 0 && v.indexedSeq === v.authoritativeSeq)) &&
      (v.state !== "missing" || (v.generation === 0 && v.indexedSeq === 0)) &&
      (v.state !== "stale" || v.indexedSeq < v.authoritativeSeq),
    "索引缺失/滞后/失败不等于ready",
  );
export const KnowledgeIndexRebuildSchema = z
  .strictObject({
    workspaceId: z.uuid(),
    rebuildId: z.uuid(),
    operationKey: z.uuid(),
    index: KnowledgeIndexStatusSchema.shape.index,
    requestedSeq: z.number().int().nonnegative(),
    targetGeneration: version,
    status: z.enum(["queued", "running", "completed", "failed", "interrupted"]),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    result: KnowledgeIndexStatusSchema.nullable(),
    error: PublicErrorSchema.nullable(),
  })
  .refine(
    (v) =>
      Date.parse(v.updatedAt) >= Date.parse(v.createdAt) &&
      (v.status === "completed") === (v.result !== null) &&
      (v.status === "failed" || v.status === "interrupted") === (v.error !== null) &&
      (v.result === null ||
        (v.result.workspaceId === v.workspaceId &&
          v.result.index === v.index &&
          v.result.generation === v.targetGeneration &&
          v.result.indexedSeq === v.requestedSeq &&
          ["ready", "stale"].includes(v.result.state))),
    "重建只在验证并切换投影后完成，不能越过权威快照",
  );
export const KnowledgeMaintenanceLifecycleEventSchema = z.strictObject({
  schemaVersion: z.literal(1),
  workspaceId: z.uuid(),
  eventId: z.uuid(),
  entityId: z.uuid(),
  entityVersion: version,
  type: z.enum([
    "maintenance.discovered",
    "maintenance.in_progress",
    "maintenance.resolved",
    "maintenance.dismissed",
    "source.withdrawn",
    "index.rebuilt",
  ]),
  evidenceIds: z.array(z.uuid()).min(1).max(100),
  actorId: z.string().trim().min(1).max(200),
  occurredAt: z.iso.datetime(),
  note,
});
export const KnowledgeMaintenanceCommandSchema = z.discriminatedUnion("method", [
  z.strictObject({
    ...writeEnvelope,
    method: z.literal("wiki.lint"),
    payload: WikiReviewBindingSchema.extend({ expectedLifecycleVersion: version }),
  }),
  z.strictObject({
    ...readEnvelope,
    method: z.literal("wiki.getLintReport"),
    payload: z.strictObject({ reportId: z.uuid() }),
  }),
  z.strictObject({
    ...readEnvelope,
    method: z.literal("wiki.getMaintenance"),
    payload: MaintenanceQuerySchema,
  }),
  z.strictObject({
    ...writeEnvelope,
    method: z.literal("wiki.resolveMaintenance"),
    payload: z.strictObject({
      issueId: z.uuid(),
      expectedIssueVersion: version,
      action: z.enum(["start_review", "resolve", "dismiss"]),
      note,
      evidenceIds: z.array(z.uuid()).min(1).max(100),
    }),
  }),
  z.strictObject({
    ...writeEnvelope,
    method: z.literal("wiki.analyzeImpact"),
    payload: KnowledgeImpactSubjectSchema,
  }),
  z.strictObject({
    ...readEnvelope,
    method: z.literal("wiki.getImpact"),
    payload: KnowledgeImpactQuerySchema,
  }),
  z.strictObject({
    ...readEnvelope,
    method: z.literal("wiki.getIndexStatus"),
    payload: z.strictObject({ index: KnowledgeIndexStatusSchema.shape.index }),
  }),
  z.strictObject({
    ...writeEnvelope,
    method: z.literal("wiki.rebuildIndex"),
    payload: z.strictObject({
      index: KnowledgeIndexStatusSchema.shape.index,
      expectedGeneration: z.number().int().nonnegative(),
      expectedAuthoritativeSeq: z.number().int().nonnegative(),
    }),
  }),
  z.strictObject({
    ...readEnvelope,
    method: z.literal("wiki.getIndexRebuild"),
    payload: z.strictObject({ rebuildId: z.uuid() }),
  }),
  z.strictObject({
    ...writeEnvelope,
    method: z.literal("source.withdraw"),
    payload: z.strictObject({
      sourceRevisionId: z.uuid(),
      expectedLifecycleVersion: version,
      note,
    }),
  }),
]);
export const KnowledgeMaintenanceResultSchema = resultSchema(
  z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("lintReport"), report: KnowledgeLintReportSchema }),
    z.strictObject({ kind: z.literal("maintenancePage"), page: MaintenancePageSchema }),
    z.strictObject({ kind: z.literal("maintenanceIssue"), issue: MaintenanceIssueSchema }),
    z.strictObject({ kind: z.literal("impactReport"), report: KnowledgeImpactReportSchema }),
    z.strictObject({ kind: z.literal("impactPage"), page: KnowledgeImpactPageSchema }),
    z.strictObject({ kind: z.literal("indexStatus"), status: KnowledgeIndexStatusSchema }),
    z.strictObject({ kind: z.literal("indexRebuild"), rebuild: KnowledgeIndexRebuildSchema }),
    z
      .strictObject({
        kind: z.literal("sourceWithdrawal"),
        state: WikiSourceStateSchema,
        event: KnowledgeMaintenanceLifecycleEventSchema,
      })
      .refine(
        (v) =>
          v.state.state === "withdrawn" &&
          v.event.type === "source.withdrawn" &&
          v.state.sourceRevisionId === v.event.entityId &&
          v.state.lifecycleVersion === v.event.entityVersion &&
          v.state.changedAt === v.event.occurredAt,
        "来源撤回状态须绑定真实事件",
      ),
  ]),
);
export type KnowledgeLintReport = z.infer<typeof KnowledgeLintReportSchema>;
export type MaintenanceIssue = z.infer<typeof MaintenanceIssueSchema>;
export type KnowledgeImpactReport = z.infer<typeof KnowledgeImpactReportSchema>;
export type KnowledgeIndexStatus = z.infer<typeof KnowledgeIndexStatusSchema>;
export type KnowledgeMaintenanceCommand = z.infer<typeof KnowledgeMaintenanceCommandSchema>;
export type KnowledgeMaintenanceResult = z.infer<typeof KnowledgeMaintenanceResultSchema>;
export interface KnowledgeMaintenanceService {
  execute(
    command: KnowledgeMaintenanceCommand,
    context: WikiHostContext,
  ): Promise<KnowledgeMaintenanceResult>;
}
export interface KnowledgeMaintenanceClient {
  executeWikiMaintenance(command: KnowledgeMaintenanceCommand): Promise<KnowledgeMaintenanceResult>;
}
export const knowledgeMaintenanceMethodOrigins: Record<
  KnowledgeMaintenanceCommand["method"],
  readonly WikiHostContext["origin"][]
> = {
  "wiki.lint": ["human_ui", "system_job"],
  "wiki.getLintReport": ["human_ui", "agent_tool", "system_job"],
  "wiki.getMaintenance": ["human_ui", "agent_tool", "system_job"],
  "wiki.resolveMaintenance": ["human_ui"],
  "wiki.analyzeImpact": ["human_ui", "system_job"],
  "wiki.getImpact": ["human_ui", "agent_tool", "system_job"],
  "wiki.getIndexStatus": ["human_ui", "agent_tool", "system_job"],
  "wiki.rebuildIndex": ["human_ui"],
  "wiki.getIndexRebuild": ["human_ui", "system_job"],
  "source.withdraw": ["human_ui"],
};

/** Atomic index swap conformance: only the currently fenced job may advance the projection. */
export const KnowledgeIndexCommitExchangeSchema = z
  .strictObject({
    before: KnowledgeIndexStatusSchema,
    rebuild: KnowledgeIndexRebuildSchema,
    after: KnowledgeIndexStatusSchema,
  })
  .refine(
    ({ before: b, rebuild: r, after: a }) =>
      b.state === "rebuilding" &&
      b.rebuildId === r.rebuildId &&
      b.workspaceId === r.workspaceId &&
      a.workspaceId === b.workspaceId &&
      b.index === r.index &&
      a.index === b.index &&
      r.status === "completed" &&
      r.targetGeneration === b.generation + 1 &&
      a.generation === r.targetGeneration &&
      a.authoritativeSeq === b.authoritativeSeq &&
      a.indexedSeq === r.requestedSeq &&
      a.indexedSeq >= b.indexedSeq &&
      JSON.stringify(a) === JSON.stringify(r.result),
    "旧重建票据/生成代不能覆盖当前索引或权威历史",
  );

/**
 * B evidence qualification. Closing or dismissing a maintenance issue is a factual claim: the host
 * must resolve every evidenceId to a stored event that (a) belongs to the same workspace, (b) is
 * about the issue's own target/version, (c) happened after the last detection and before the
 * resolution, and (d) is decisive for that exact issue kind. Candidates, model proposals, quotes and
 * approvals are never evidence: they change nothing about the knowledge/source fact.
 */
export const MaintenanceEvidenceKindSchema = z.enum([
  "knowledge.revision_published",
  "source.revised",
  "source.validity_confirmed",
  "source.integrity_reverified",
  "index.rebuilt",
  "issue.review_decision",
]);
export const MaintenanceAdjudicationOutcomeSchema = z.enum([
  "duplicate_of",
  "superseded",
  "false_positive",
  "not_applicable",
]);
export const MaintenanceEvidenceSchema = z
  .discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("knowledge.revision_published"),
      workspaceId: z.uuid(),
      evidenceId: z.uuid(),
      occurredAt: z.iso.datetime(),
      actorId: z.string().trim().min(1).max(200),
      revision: z.strictObject({
        documentId: z.uuid(),
        revisionId: z.uuid(),
        version,
        contentHash: SourceHashSchema,
        sourceSetHash: SourceHashSchema,
        publishedAt: z.iso.datetime(),
      }),
    }),
    z.strictObject({
      kind: z.literal("source.revised"),
      workspaceId: z.uuid(),
      evidenceId: z.uuid(),
      occurredAt: z.iso.datetime(),
      actorId: z.string().trim().min(1).max(200),
      source: z.strictObject({
        sourceId: z.uuid(),
        sourceRevisionId: z.uuid(),
        previousSourceRevisionId: z.uuid(),
        artifactHash: SourceHashSchema,
        validity: WikiValiditySchema,
      }),
    }),
    z.strictObject({
      kind: z.literal("source.validity_confirmed"),
      workspaceId: z.uuid(),
      evidenceId: z.uuid(),
      occurredAt: z.iso.datetime(),
      actorId: z.string().trim().min(1).max(200),
      confirmation: z.strictObject({
        sourceId: z.uuid(),
        sourceRevisionId: z.uuid(),
        validity: WikiValiditySchema,
      }),
    }),
    z.strictObject({
      kind: z.literal("source.integrity_reverified"),
      workspaceId: z.uuid(),
      evidenceId: z.uuid(),
      occurredAt: z.iso.datetime(),
      actorId: z.string().trim().min(1).max(200),
      verification: z.strictObject({
        sourceRevisionId: z.uuid(),
        artifactHash: SourceHashSchema,
        matchesRecordedHash: z.literal(true),
      }),
    }),
    z.strictObject({
      kind: z.literal("index.rebuilt"),
      workspaceId: z.uuid(),
      evidenceId: z.uuid(),
      occurredAt: z.iso.datetime(),
      actorId: z.string().trim().min(1).max(200),
      index: z.strictObject({
        index: KnowledgeIndexStatusSchema.shape.index,
        generation: version,
        indexedSeq: z.number().int().nonnegative(),
        authoritativeSeq: z.number().int().nonnegative(),
      }),
    }),
    z.strictObject({
      kind: z.literal("issue.review_decision"),
      workspaceId: z.uuid(),
      evidenceId: z.uuid(),
      occurredAt: z.iso.datetime(),
      actorId: z.string().trim().min(1).max(200),
      decision: z.strictObject({
        issueId: z.uuid(),
        issueVersion: version,
        outcome: MaintenanceAdjudicationOutcomeSchema,
        canonicalIssueId: z.uuid().nullable(),
        rationale: note,
      }),
    }),
  ])
  .superRefine((value, context) => {
    const fail = (message: string) => context.addIssue({ code: "custom", message });
    if (
      value.kind === "knowledge.revision_published" &&
      Date.parse(value.revision.publishedAt) > Date.parse(value.occurredAt)
    )
      fail("发布事件不能早于版本发布时间");
    if (
      value.kind === "source.validity_confirmed" &&
      value.confirmation.validity.status !== "confirmed"
    )
      fail("有效性未知/冲突不能作为确认证据");
    if (
      value.kind === "index.rebuilt" &&
      (value.index.indexedSeq !== value.index.authoritativeSeq || value.index.generation < 1)
    )
      fail("重建证据必须已追平权威快照");
    if (
      value.kind === "issue.review_decision" &&
      (value.decision.outcome === "duplicate_of") !== (value.decision.canonicalIssueId !== null)
    )
      fail("仅重复裁决需指向规范问题");
  });
export const MaintenanceResolutionActionSchema = z.enum(["start_review", "resolve", "dismiss"]);
type ResolutionAction = z.infer<typeof MaintenanceResolutionActionSchema>;
type EvidenceKind = z.infer<typeof MaintenanceEvidenceKindSchema>;
type IssueKind = z.infer<typeof MaintenanceIssueKindSchema>;
/** Decidable eligibility matrix: which stored fact may prove this issue kind fixed (resolve) or moot (dismiss). */
export const maintenanceResolutionEligibility: Record<
  IssueKind,
  { readonly resolve: readonly EvidenceKind[]; readonly dismiss: readonly EvidenceKind[] }
> = {
  source_updated: {
    resolve: ["knowledge.revision_published", "source.revised"],
    dismiss: ["issue.review_decision"],
  },
  source_withdrawn: {
    resolve: ["knowledge.revision_published"],
    dismiss: ["issue.review_decision"],
  },
  expired: {
    resolve: ["knowledge.revision_published", "source.revised", "source.validity_confirmed"],
    dismiss: ["issue.review_decision"],
  },
  unknown_validity: {
    resolve: ["source.validity_confirmed", "source.revised", "knowledge.revision_published"],
    dismiss: ["issue.review_decision"],
  },
  conflict: { resolve: ["knowledge.revision_published"], dismiss: ["issue.review_decision"] },
  broken_reference: {
    resolve: ["knowledge.revision_published"],
    dismiss: ["issue.review_decision"],
  },
  hash_mismatch: {
    resolve: ["source.integrity_reverified", "source.revised", "knowledge.revision_published"],
    dismiss: ["issue.review_decision"],
  },
  orphan: { resolve: ["knowledge.revision_published"], dismiss: ["issue.review_decision"] },
  duplicate: { resolve: ["issue.review_decision"], dismiss: ["issue.review_decision"] },
  index_stale: { resolve: ["index.rebuilt"], dismiss: ["issue.review_decision"] },
};
export const MaintenanceRejectionReasonSchema = z.enum([
  "actor_not_human",
  "workspace_mismatch",
  "issue_version_stale",
  "issue_already_closed",
  "evidence_workspace_mismatch",
  "evidence_predates_detection",
  "evidence_after_resolution",
  "evidence_kind_not_eligible",
  "evidence_target_mismatch",
  "evidence_snapshot_mismatch",
  "evidence_not_decisive",
  "evidence_void",
]);
export type MaintenanceResolutionVerdict =
  | { ok: true; action: ResolutionAction; evidenceIds: string[] }
  | {
      ok: false;
      code: z.infer<typeof ErrorCodeSchema>;
      reason: z.infer<typeof MaintenanceRejectionReasonSchema>;
      message: string;
    };
function reject(
  code: z.infer<typeof ErrorCodeSchema>,
  reason: z.infer<typeof MaintenanceRejectionReasonSchema>,
  message: string,
): MaintenanceResolutionVerdict {
  return { ok: false, code, reason, message };
}
function validityCovers(validity: z.infer<typeof WikiValiditySchema>, at: string): boolean {
  return (
    validity.status === "confirmed" &&
    (validity.validFrom === null || Date.parse(validity.validFrom) <= Date.parse(at)) &&
    (validity.validUntil === null || Date.parse(at) < Date.parse(validity.validUntil))
  );
}
export interface MaintenanceResolutionIntent {
  workspaceId: string;
  actorId: string;
  origin: WikiHostContext["origin"];
  action: ResolutionAction;
  issue: MaintenanceIssue;
  expectedIssueVersion: number;
  resolvedAt: string;
  evidence: readonly MaintenanceEvidence[];
}
export const MaintenanceResolutionIntentSchema = z.strictObject({
  workspaceId: z.uuid(),
  actorId: z.string().trim().min(1).max(200),
  origin: WikiHostContextSchema.shape.origin,
  action: MaintenanceResolutionActionSchema,
  issue: MaintenanceIssueSchema,
  expectedIssueVersion: version,
  resolvedAt: z.iso.datetime(),
  evidence: z.array(MaintenanceEvidenceSchema).min(1).max(100),
});
function bindingFailure(
  intent: MaintenanceResolutionIntent,
  evidence: MaintenanceEvidence,
): MaintenanceResolutionVerdict | null {
  const { issue, action, resolvedAt } = intent;
  const target = issue.target;
  const mismatch = (message: string) =>
    reject("REVISION_CONFLICT", "evidence_target_mismatch", message);
  switch (evidence.kind) {
    case "knowledge.revision_published": {
      if (target.kind !== "knowledge") return mismatch("知识发布证据只适用于知识目标问题");
      const { revision } = evidence;
      if (revision.documentId !== target.documentId) return mismatch("发布证据须为同一知识文档");
      if (revision.revisionId === target.revisionId || revision.contentHash === target.contentHash)
        return reject(
          "VALIDATION_ERROR",
          "evidence_not_decisive",
          "重新发布同一版本不能证明问题已解决",
        );
      return null;
    }
    case "source.revised": {
      if (target.kind !== "source") return mismatch("来源更新证据只适用于来源目标问题");
      const { source } = evidence;
      if (
        source.sourceId !== target.sourceId ||
        source.previousSourceRevisionId !== target.sourceRevisionId ||
        source.sourceRevisionId === target.sourceRevisionId ||
        source.artifactHash === target.artifactHash
      )
        return mismatch("来源更新证据须替换问题固定来源版本");
      if (
        (issue.kind === "expired" || issue.kind === "unknown_validity") &&
        !validityCovers(source.validity, resolvedAt)
      )
        return reject("SOURCE_CONFLICT", "evidence_void", "新来源有效性仍未确认或未覆盖处理时点");
      return null;
    }
    case "source.validity_confirmed": {
      if (target.kind !== "source") return mismatch("有效性确认证据只适用于来源目标问题");
      const { confirmation } = evidence;
      if (
        confirmation.sourceId !== target.sourceId ||
        confirmation.sourceRevisionId !== target.sourceRevisionId
      )
        return mismatch("有效性确认须针对问题固定来源版本");
      if (!validityCovers(confirmation.validity, resolvedAt))
        return reject("SOURCE_CONFLICT", "evidence_void", "确认的有效期未覆盖处理时点");
      return null;
    }
    case "source.integrity_reverified": {
      if (target.kind !== "source") return mismatch("完整性复核证据只适用于来源目标问题");
      const { verification } = evidence;
      if (
        verification.sourceRevisionId !== target.sourceRevisionId ||
        verification.artifactHash !== target.artifactHash
      )
        return mismatch("完整性复核须针对问题固定来源版本与记录hash");
      return null;
    }
    case "index.rebuilt": {
      if (issue.kind !== "index_stale") return mismatch("重建证据只适用于索引滞后问题");
      return null;
    }
    case "issue.review_decision": {
      const { decision } = evidence;
      if (decision.issueId !== issue.issueId || decision.issueVersion !== issue.issueVersion)
        return reject(
          "REVISION_CONFLICT",
          "evidence_snapshot_mismatch",
          "裁决须绑定当前问题版本，旧裁决不能关闭再次发现的问题",
        );
      const outcomes =
        action === "resolve"
          ? ["duplicate_of", "superseded"]
          : ["false_positive", "not_applicable"];
      if (!outcomes.includes(decision.outcome))
        return reject(
          "VALIDATION_ERROR",
          "evidence_not_decisive",
          action === "resolve"
            ? "仅重复/被取代的裁决可解决处理项"
            : "仅误报/不适用于的裁决可驳回处理项",
        );
      if (decision.outcome === "duplicate_of" && decision.canonicalIssueId === issue.issueId)
        return reject("VALIDATION_ERROR", "evidence_not_decisive", "重复裁决不能指向自身");
      return null;
    }
  }
}
/** Deterministic first-failure verdict. The host calls this inside the write transaction. */
export function evaluateMaintenanceResolution(
  intent: MaintenanceResolutionIntent,
): MaintenanceResolutionVerdict {
  const { issue, action, evidence } = intent;
  if (intent.origin !== "human_ui")
    return reject("ACTION_NOT_ALLOWED", "actor_not_human", "维护处理只允许人工入口");
  if (intent.workspaceId !== issue.workspaceId)
    return reject("ACTION_NOT_ALLOWED", "workspace_mismatch", "不得跨工作区处理维护问题");
  if (intent.expectedIssueVersion !== issue.issueVersion)
    return reject("REVISION_CONFLICT", "issue_version_stale", "问题版本已变化，请重新读取");
  if (issue.state !== "open" && issue.state !== "in_progress")
    return reject("REVISION_CONFLICT", "issue_already_closed", "问题已关闭，不能重复处理");
  if (action === "start_review") {
    // Review never closes anything, but a foreign workspace record is still unreadable here.
    if (evidence.some((item) => item.workspaceId !== issue.workspaceId))
      return reject(
        "ACTION_NOT_ALLOWED",
        "evidence_workspace_mismatch",
        "处理证据必须属于同一工作区",
      );
    return { ok: true, action, evidenceIds: evidence.map((item) => item.evidenceId) };
  }
  if (!unique(evidence, (item) => item.evidenceId))
    return reject("VALIDATION_ERROR", "evidence_not_decisive", "处理证据不能重复");
  for (const item of evidence) {
    if (item.workspaceId !== issue.workspaceId)
      return reject(
        "ACTION_NOT_ALLOWED",
        "evidence_workspace_mismatch",
        "处理证据必须属于同一工作区",
      );
    if (Date.parse(item.occurredAt) > Date.parse(intent.resolvedAt))
      return reject("VALIDATION_ERROR", "evidence_after_resolution", "证据不能晚于处理时点");
    if (Date.parse(item.occurredAt) <= Date.parse(issue.lastDetectedAt))
      return reject(
        "REVISION_CONFLICT",
        "evidence_predates_detection",
        "证据须晚于最近一次发现，旧事实不能关闭当前问题",
      );
  }
  for (const item of evidence) {
    if (!maintenanceResolutionEligibility[issue.kind][action].includes(item.kind))
      return reject(
        "VALIDATION_ERROR",
        "evidence_kind_not_eligible",
        `${issue.kind} 的 ${action} 不接受 ${item.kind} 作为依据`,
      );
  }
  for (const item of evidence) {
    const failure = bindingFailure(intent, item);
    if (failure) return failure;
  }
  return { ok: true, action, evidenceIds: evidence.map((item) => item.evidenceId) };
}
export const MaintenanceResolutionExchangeSchema = z
  .strictObject({
    intent: MaintenanceResolutionIntentSchema,
    after: MaintenanceIssueSchema,
    event: KnowledgeMaintenanceLifecycleEventSchema,
  })
  .superRefine((value, context) => {
    const fail = (message: string) => context.addIssue({ code: "custom", message });
    const { intent, after: next, event } = value;
    const before = intent.issue;
    if (!evaluateMaintenanceResolution(intent).ok) fail("处理依据不满足证据资格");
    if (
      next.issueId !== before.issueId ||
      next.workspaceId !== before.workspaceId ||
      next.dedupKey !== before.dedupKey ||
      next.kind !== before.kind ||
      next.firstDetectedAt !== before.firstDetectedAt ||
      JSON.stringify(next.target) !== JSON.stringify(before.target) ||
      JSON.stringify(next.evidenceIds) !== JSON.stringify(before.evidenceIds) ||
      next.issueVersion !== before.issueVersion + 1 ||
      Date.parse(next.lastDetectedAt) < Date.parse(before.lastDetectedAt)
    )
      fail("处理不得改写问题身份/目标/首末发现时点或跳过版本");
    if (intent.action === "start_review") {
      if (
        next.state !== "in_progress" ||
        next.resolution !== null ||
        event.type !== "maintenance.in_progress"
      )
        fail("开始复核只能转为处理中，不能留下解决事实");
    } else {
      const expected = intent.action === "resolve" ? "resolved" : "dismissed";
      if (next.state !== expected || next.resolution === null)
        fail("解决/驳回必须留下对应处理事实");
      else if (
        next.resolution.action !== intent.action ||
        next.resolution.actorId !== intent.actorId ||
        next.resolution.resolvedAt !== intent.resolvedAt ||
        !unique(intent.evidence, (item) => item.evidenceId) ||
        JSON.stringify([...next.resolution.evidenceIds].sort()) !==
          JSON.stringify(intent.evidence.map((item) => item.evidenceId).sort())
      )
        fail("处理事实须与本次请求的证据/处理人/时点一致");
      if (
        event.type !==
        (intent.action === "resolve" ? "maintenance.resolved" : "maintenance.dismissed")
      )
        fail("生命周期事件类型必须与处理动作一致");
    }
    if (
      event.workspaceId !== before.workspaceId ||
      event.entityId !== before.issueId ||
      event.entityVersion !== next.issueVersion ||
      event.actorId !== intent.actorId ||
      event.occurredAt !== intent.resolvedAt ||
      JSON.stringify([...event.evidenceIds].sort()) !==
        JSON.stringify(intent.evidence.map((item) => item.evidenceId).sort())
    )
      fail("生命周期事件须绑定同一问题版本、处理人、时点和证据");
  });
/** Canonical idempotency payload: method/workspace/actor/origin/issue version/action/note/evidence set, no requestId or host clock. */
export function maintenanceResolutionPayload(input: {
  workspaceId: string;
  actorId: string;
  origin: WikiHostContext["origin"];
  issueId: string;
  expectedIssueVersion: number;
  action: ResolutionAction;
  note: string;
  evidenceIds: readonly string[];
}): string {
  return JSON.stringify({
    workspaceId: input.workspaceId,
    method: "wiki.resolveMaintenance",
    actorId: input.actorId,
    origin: input.origin,
    issueId: input.issueId,
    expectedIssueVersion: input.expectedIssueVersion,
    action: input.action,
    note: input.note,
    evidenceIds: [...new Set(input.evidenceIds)].sort(),
  });
}
export const MaintenanceResolutionReplaySchema = z
  .strictObject({
    request: z.strictObject({
      idempotencyKey: z.uuid(),
      workspaceId: z.uuid(),
      payload: z.string().min(2).max(20000),
    }),
    stored: z
      .strictObject({
        idempotencyKey: z.uuid(),
        workspaceId: z.uuid(),
        payload: z.string().min(2).max(20000),
      })
      .nullable(),
    outcome: z.enum(["new", "replay", "idempotency_conflict"]),
  })
  .refine(
    (v) =>
      v.stored === null
        ? v.outcome === "new"
        : v.stored.idempotencyKey === v.request.idempotencyKey &&
          v.stored.workspaceId === v.request.workspaceId &&
          v.outcome ===
            (v.stored.payload === v.request.payload ? "replay" : "idempotency_conflict"),
    "同键同参只回放原结果，同键异参必须 IDEMPOTENCY_CONFLICT",
  );

export type KnowledgeLintIssue = z.infer<typeof KnowledgeLintIssueSchema>;
export type MaintenanceTarget = z.infer<typeof MaintenanceTargetSchema>;
export type MaintenanceEvidence = z.infer<typeof MaintenanceEvidenceSchema>;
export type MaintenanceEvidenceKind = z.infer<typeof MaintenanceEvidenceKindSchema>;
export type MaintenanceAdjudicationOutcome = z.infer<typeof MaintenanceAdjudicationOutcomeSchema>;
export type MaintenanceRejectionReason = z.infer<typeof MaintenanceRejectionReasonSchema>;
export type MaintenanceResolutionAction = z.infer<typeof MaintenanceResolutionActionSchema>;
export type MaintenanceQuery = z.infer<typeof MaintenanceQuerySchema>;
export type MaintenancePage = z.infer<typeof MaintenancePageSchema>;
export type KnowledgeImpactSubject = z.infer<typeof KnowledgeImpactSubjectSchema>;
export type KnowledgeImpactItem = z.infer<typeof KnowledgeImpactItemSchema>;
export type KnowledgeImpactPage = z.infer<typeof KnowledgeImpactPageSchema>;
export type KnowledgeIndexRebuild = z.infer<typeof KnowledgeIndexRebuildSchema>;
export type KnowledgeMaintenanceLifecycleEvent = z.infer<
  typeof KnowledgeMaintenanceLifecycleEventSchema
>;
