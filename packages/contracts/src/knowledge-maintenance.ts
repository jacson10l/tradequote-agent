import { z } from "zod";
import { SourceHashSchema } from "./knowledge";
import {
  WikiConsumptionInputSchema,
  type WikiHostContext,
  WikiLintReceiptSchema,
  WikiReviewBindingSchema,
  WikiSourceStateSchema,
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

export type KnowledgeLintIssue = z.infer<typeof KnowledgeLintIssueSchema>;
export type MaintenanceTarget = z.infer<typeof MaintenanceTargetSchema>;
export type MaintenanceQuery = z.infer<typeof MaintenanceQuerySchema>;
export type MaintenancePage = z.infer<typeof MaintenancePageSchema>;
export type KnowledgeImpactSubject = z.infer<typeof KnowledgeImpactSubjectSchema>;
export type KnowledgeImpactItem = z.infer<typeof KnowledgeImpactItemSchema>;
export type KnowledgeImpactPage = z.infer<typeof KnowledgeImpactPageSchema>;
export type KnowledgeIndexRebuild = z.infer<typeof KnowledgeIndexRebuildSchema>;
export type KnowledgeMaintenanceLifecycleEvent = z.infer<
  typeof KnowledgeMaintenanceLifecycleEventSchema
>;
