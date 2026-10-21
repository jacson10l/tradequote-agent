import { z } from "zod";
import {
  KnowledgeLocationSchema,
  KnowledgeScopeSchema,
  RuleDefinitionSchema,
  SourceHashSchema,
} from "./knowledge";
import {
  validTextLocation,
  WikiEntryKindSchema,
  type WikiHostContext,
  WikiReviewBindingSchema,
  WikiRevisionSchema,
  WikiValiditySchema,
} from "./knowledge-wiki";
import { PublicErrorSchema, readEnvelope, resultSchema, writeEnvelope } from "./protocol";
import { LocaleSchema } from "./values";

const label = z.string().trim().min(1).max(200);
const note = z.string().trim().min(1).max(2000);
const key = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
const unique = <T>(values: readonly T[], identity: (value: T) => string) =>
  new Set(values.map(identity)).size === values.length;
export const KnowledgeBuildSourcePinSchema = z.strictObject({
  sourceRevisionId: z.uuid(),
  artifactHash: SourceHashSchema,
});
export const KnowledgeBuildInputSchema = z
  .strictObject({
    operation: z.enum(["create", "revise", "merge"]),
    sources: z.array(KnowledgeBuildSourcePinSchema).min(1).max(20),
    target: z.strictObject({
      kind: WikiEntryKindSchema,
      locale: LocaleSchema,
      scope: KnowledgeScopeSchema,
    }),
    base: WikiReviewBindingSchema.extend({
      documentId: z.uuid(),
      expectedVersion: z.number().int().positive(),
    }).nullable(),
    relatedRevisionIds: z.array(z.uuid()).max(20),
    instructions: note,
    maxCandidates: z.number().int().min(1).max(10),
    budget: z.strictObject({
      maxModelCalls: z.number().int().min(1).max(5),
      timeoutMs: z.number().int().min(1000).max(120000),
      maxOutputBytes: z.number().int().min(1024).max(128000),
    }),
  })
  .refine(
    (v) => unique(v.sources, (x) => x.sourceRevisionId) && unique(v.relatedRevisionIds, (x) => x),
    "来源或关联基线不能重复",
  )
  .refine(
    (v) =>
      (v.operation === "create") === (v.base === null) &&
      (v.operation !== "merge" || v.relatedRevisionIds.length > 0) &&
      (v.operation === "create" || v.maxCandidates === 1),
    "修改/合并必须固定知识基线，合并还需关联基线",
  );
// Provider output: local keys and allowlisted references, never authoritative IDs/hashes/approval.
export const KnowledgeBuildProposalSchema = z
  .strictObject({
    proposalKey: key,
    title: label,
    markdown: z.string().min(1).max(32000),
    validity: WikiValiditySchema.refine((v) => v.status === "unknown", "模型不能确认现实有效性"),
    sections: z
      .array(
        z.strictObject({
          sectionKey: key,
          title: label,
          location: KnowledgeLocationSchema,
          citations: z
            .array(
              z.strictObject({
                sourceRevisionId: z.uuid(),
                location: KnowledgeLocationSchema,
                assertion: z.enum(["fact", "inference"]),
              }),
            )
            .min(1)
            .max(20),
        }),
      )
      .min(1)
      .max(100),
    rules: z
      .array(
        z.strictObject({
          ruleKey: key,
          sectionKey: key,
          definition: RuleDefinitionSchema.omit({ ruleId: true }),
        }),
      )
      .max(100),
    relations: z
      .array(
        z.strictObject({ kind: z.enum(["related", "supersedes"]), targetRevisionId: z.uuid() }),
      )
      .max(20),
    suggestions: z
      .array(
        z.discriminatedUnion("kind", [
          z.strictObject({ kind: z.literal("merge"), targetRevisionId: z.uuid(), reason: note }),
          z.strictObject({
            kind: z.literal("conflict"),
            sourceRevisionIds: z
              .array(z.uuid())
              .min(2)
              .max(20)
              .refine((v) => unique(v, (x) => x), "冲突来源不能重复"),
            reason: note,
          }),
        ]),
      )
      .max(20),
  })
  .superRefine((v, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (
      !unique(v.sections, (x) => x.sectionKey) ||
      !unique(v.rules, (x) => x.ruleKey) ||
      !unique(v.relations, (x) => `${x.kind}:${x.targetRevisionId}`)
    )
      fail("提案临时身份或关系不能重复");
    for (const section of v.sections) {
      if (!validTextLocation(v.markdown, section.location)) fail("提案段落范围越界或截断字符");
      if (
        !unique(
          section.citations,
          (c) => `${c.sourceRevisionId}:${c.location.start}:${c.location.end}:${c.assertion}`,
        )
      )
        fail("段落引用不能重复");
    }
    for (const rule of v.rules)
      if (!v.sections.some((s) => s.sectionKey === rule.sectionKey)) fail("提案规则段落悬空");
  });
export const KnowledgeBuildProposalExchangeSchema = z
  .strictObject({ input: KnowledgeBuildInputSchema, proposal: KnowledgeBuildProposalSchema })
  .superRefine((v, ctx) => {
    const allowedSources = new Set(v.input.sources.map((s) => s.sourceRevisionId));
    const allowedRevisions = new Set([
      ...v.input.relatedRevisionIds,
      ...(v.input.base ? [v.input.base.revisionId] : []),
    ]);
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if ((v.input.target.kind === "rule") !== v.proposal.rules.length > 0)
      fail("仅规则页生成结构化规则");
    if (
      v.proposal.sections.some((s) =>
        s.citations.some((c) => !allowedSources.has(c.sourceRevisionId)),
      )
    )
      fail("模型不能扩大来源允许集合");
    if (v.proposal.relations.some((r) => !allowedRevisions.has(r.targetRevisionId)))
      fail("模型不能扩大知识基线允许集合");
    for (const suggestion of v.proposal.suggestions) {
      if (
        suggestion.kind === "merge"
          ? !allowedRevisions.has(suggestion.targetRevisionId)
          : suggestion.sourceRevisionIds.some((id) => !allowedSources.has(id))
      )
        fail("建议不能引用未授权来源或基线");
    }
  });
export const KnowledgeBuildStartCommandSchema = z.strictObject({
  ...writeEnvelope,
  method: z.literal("knowledgeBuild.start"),
  payload: KnowledgeBuildInputSchema,
});
export const KnowledgeBuildCompletionSchema = z
  .strictObject({
    receiptId: z.uuid(),
    workspaceId: z.uuid(),
    runId: z.uuid(),
    operationKey: z.uuid(),
    attempt: z.number().int().positive(),
    executionTicketId: z.uuid(),
    inputSourceSetHash: SourceHashSchema,
    committedAt: z.iso.datetime(),
    candidates: z
      .array(
        z.strictObject({
          lifecycleState: z.literal("candidate"),
          proposalKey: key,
          candidateRevisionId: z.uuid(),
          documentId: z.uuid(),
          version: z.number().int().positive(),
          contentHash: SourceHashSchema,
          sourceSetHash: SourceHashSchema,
          sources: z
            .array(KnowledgeBuildSourcePinSchema)
            .min(1)
            .max(20)
            .refine((v) => unique(v, (x) => x.sourceRevisionId), "候选来源不能重复"),
        }),
      )
      .min(1)
      .max(10),
    candidateRevisionIds: z.array(z.uuid()).min(1).max(10),
  })
  .refine(
    (v) =>
      unique(v.candidates, (x) => x.proposalKey) &&
      unique(v.candidates, (x) => x.documentId) &&
      unique(v.candidateRevisionIds, (x) => x) &&
      v.candidates.length === v.candidateRevisionIds.length &&
      v.candidates.every((c, i) => c.candidateRevisionId === v.candidateRevisionIds[i]),
    "完成结果须精确列出每个已提交候选，禁止部分或重复提交",
  );
export const KnowledgeBuildRunSchema = z
  .strictObject({
    workspaceId: z.uuid(),
    runId: z.uuid(),
    operationKey: z.uuid(),
    runVersion: z.number().int().positive(),
    executionTicketId: z.uuid().nullable(),
    usage: z.strictObject({
      modelCalls: z.number().int().nonnegative(),
      outputBytes: z.number().int().nonnegative(),
      elapsedMs: z.number().int().nonnegative(),
    }),
    command: KnowledgeBuildStartCommandSchema,
    sourceSetHash: SourceHashSchema,
    status: z.enum(["queued", "running", "completed", "failed", "cancelled", "interrupted"]),
    attempt: z.number().int().positive(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    checkpoint: z.strictObject({
      lastEventSeq: z.number().int().nonnegative(),
      phase: z.enum(["queued", "model_requested", "proposal_validated", "candidates_committed"]),
      proposalKeys: z
        .array(key)
        .max(10)
        .refine((v) => unique(v, (x) => x), "检查点提案键不能重复"),
    }),
    completion: KnowledgeBuildCompletionSchema.nullable(),
    error: PublicErrorSchema.nullable(),
  })
  .superRefine((v, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (v.operationKey !== v.command.idempotencyKey) fail("原始整理操作键不可改变");
    if (Date.parse(v.updatedAt) < Date.parse(v.createdAt)) fail("运行时间倒序");
    if (
      (v.status === "completed") !== (v.completion !== null) ||
      (v.status === "completed") !== (v.checkpoint.phase === "candidates_committed")
    )
      fail("完成事实必须与原子候选提交一致");
    if (v.status === "failed" || v.status === "interrupted" ? v.error === null : v.error !== null)
      fail("失败/中断必须保留公开错误，其余状态不携带错误");
    if (
      (v.status === "queued" &&
        (v.executionTicketId !== null ||
          v.checkpoint.phase !== "queued" ||
          v.checkpoint.proposalKeys.length > 0)) ||
      (["running", "completed"].includes(v.status) && v.executionTicketId === null)
    )
      fail("执行票据须与当前attempt/阶段一致");
    if (
      v.status === "queued" &&
      (v.usage.modelCalls !== 0 || v.usage.outputBytes !== 0 || v.usage.elapsedMs !== 0)
    )
      fail("新attempt排队时必须清零使用计数");
    if (v.checkpoint.proposalKeys.length > v.command.payload.maxCandidates)
      fail("检查点不能超过候选预算");
    if (v.completion) {
      if (
        v.completion.workspaceId !== v.workspaceId ||
        v.completion.runId !== v.runId ||
        v.completion.operationKey !== v.operationKey ||
        v.completion.attempt !== v.attempt ||
        v.completion.executionTicketId !== v.executionTicketId ||
        v.completion.inputSourceSetHash !== v.sourceSetHash
      )
        fail("完成回执不得跨workspace/run/attempt/操作键或执行票据");
      const budget = v.command.payload.budget;
      if (
        v.usage.modelCalls > budget.maxModelCalls ||
        v.usage.outputBytes > budget.maxOutputBytes ||
        v.usage.elapsedMs > budget.timeoutMs
      )
        fail("超预算运行不能完成");
      if (
        v.completion.candidates.length > v.command.payload.maxCandidates ||
        v.completion.candidates.some(
          (c) =>
            c.sources.some(
              (source) =>
                !v.command.payload.sources.some(
                  (pin) =>
                    pin.sourceRevisionId === source.sourceRevisionId &&
                    pin.artifactHash === source.artifactHash,
                ),
            ) || !v.checkpoint.proposalKeys.includes(c.proposalKey),
        ) ||
        v.completion.candidates.length !== v.checkpoint.proposalKeys.length
      )
        fail("提交候选须绑定完整已验证提案及冻结来源集合");
      if (
        Date.parse(v.completion.committedAt) < Date.parse(v.createdAt) ||
        Date.parse(v.completion.committedAt) > Date.parse(v.updatedAt)
      )
        fail("候选提交时间不一致");
      const base = v.command.payload.base;
      if (
        base &&
        (v.completion.candidates.length !== 1 ||
          v.completion.candidates[0]?.documentId !== base.documentId ||
          v.completion.candidates[0]?.version !== base.expectedVersion + 1)
      )
        fail("修订/合并只创建指定文档的下一候选版本");
      if (!base && v.completion.candidates.some((c) => c.version !== 1))
        fail("新建候选从版本1开始");
    }
  });
const buildCursor = z.strictObject({ snapshotId: z.uuid(), afterRunId: z.uuid() });
export const KnowledgeBuildListQuerySchema = z.strictObject({
  limit: z.number().int().min(1).max(100),
  cursor: buildCursor.nullable(),
});
export const KnowledgeBuildListPageSchema = z
  .strictObject({
    workspaceId: z.uuid(),
    snapshotId: z.uuid(),
    runs: z.array(KnowledgeBuildRunSchema).max(100),
    nextCursor: buildCursor.nullable(),
  })
  .refine(
    (v) =>
      unique(v.runs, (r) => r.runId) &&
      v.runs.every(
        (r, i) =>
          r.workspaceId === v.workspaceId && (i === 0 || r.runId < (v.runs[i - 1]?.runId ?? "")),
      ) &&
      (v.nextCursor === null ||
        (v.nextCursor.snapshotId === v.snapshotId &&
          (v.runs.length === 0 || v.nextCursor.afterRunId <= (v.runs.at(-1)?.runId ?? "")))),
    "运行列表须绑定workspace/快照并稳定倒序",
  );
export const KnowledgeBuildListExchangeSchema = z
  .strictObject({ query: KnowledgeBuildListQuerySchema, page: KnowledgeBuildListPageSchema })
  .refine(
    ({ query: q, page: p }) =>
      p.runs.length <= q.limit &&
      (q.cursor === null ||
        (q.cursor.snapshotId === p.snapshotId &&
          p.runs.every((r) => r.runId < q.cursor!.afterRunId) &&
          (p.nextCursor === null || p.nextCursor.afterRunId < q.cursor.afterRunId))),
    "运行分页包括空页均须严格前进且固定快照",
  );
const control = z.strictObject({
  runId: z.uuid(),
  expectedRunVersion: z.number().int().positive(),
});
export const KnowledgeBuildCommandSchema = z.discriminatedUnion("method", [
  KnowledgeBuildStartCommandSchema,
  z.strictObject({
    ...readEnvelope,
    method: z.literal("knowledgeBuild.get"),
    payload: z.strictObject({ runId: z.uuid() }),
  }),
  z.strictObject({
    ...readEnvelope,
    method: z.literal("knowledgeBuild.list"),
    payload: KnowledgeBuildListQuerySchema,
  }),
  z.strictObject({
    ...writeEnvelope,
    method: z.literal("knowledgeBuild.cancel"),
    payload: control,
  }),
  z.strictObject({ ...writeEnvelope, method: z.literal("knowledgeBuild.retry"), payload: control }),
]);
export const KnowledgeBuildResultSchema = resultSchema(
  z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("knowledgeBuildRun"), run: KnowledgeBuildRunSchema }),
    z.strictObject({ kind: z.literal("knowledgeBuildRuns"), page: KnowledgeBuildListPageSchema }),
  ]),
);
const eventEnvelope = {
  schemaVersion: z.literal(1),
  workspaceId: z.uuid(),
  eventId: z.uuid(),
  runId: z.uuid(),
  seq: z.number().int().positive(),
  attempt: z.number().int().positive(),
  timestamp: z.iso.datetime(),
};
export const KnowledgeBuildEventSchema = z
  .discriminatedUnion("type", [
    z.strictObject({
      ...eventEnvelope,
      type: z.literal("knowledgeBuild.started"),
      payload: z.strictObject({ sourceSetHash: SourceHashSchema }),
    }),
    z.strictObject({
      ...eventEnvelope,
      type: z.literal("knowledgeBuild.proposalValidated"),
      payload: z.strictObject({ proposalKey: key }),
    }),
    z.strictObject({
      ...eventEnvelope,
      type: z.literal("knowledgeBuild.completed"),
      payload: KnowledgeBuildCompletionSchema,
    }),
    z.strictObject({
      ...eventEnvelope,
      type: z.literal("knowledgeBuild.failed"),
      payload: PublicErrorSchema,
    }),
    z.strictObject({
      ...eventEnvelope,
      type: z.literal("knowledgeBuild.interrupted"),
      payload: PublicErrorSchema,
    }),
    z.strictObject({
      ...eventEnvelope,
      type: z.literal("knowledgeBuild.cancelled"),
      payload: z.strictObject({ completion: z.null() }),
    }),
  ])
  .superRefine((event, ctx) => {
    if (
      event.type === "knowledgeBuild.completed" &&
      (event.payload.workspaceId !== event.workspaceId ||
        event.payload.runId !== event.runId ||
        event.payload.attempt !== event.attempt ||
        event.payload.committedAt !== event.timestamp)
    )
      ctx.addIssue({ code: "custom", message: "完成事件须绑定同一执行回执/时点" });
  });
/** Host conformance validator; does not implement storage, permission checks or ticket issuance. */
export const KnowledgeBuildTransitionSchema = z
  .strictObject({
    before: KnowledgeBuildRunSchema,
    after: KnowledgeBuildRunSchema,
    action: z.enum(["start", "cancel", "retry", "interrupt", "fail", "complete"]),
  })
  .superRefine(({ before: b, after: a, action }, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (
      a.workspaceId !== b.workspaceId ||
      a.runId !== b.runId ||
      a.operationKey !== b.operationKey ||
      a.sourceSetHash !== b.sourceSetHash ||
      a.createdAt !== b.createdAt ||
      JSON.stringify(a.command) !== JSON.stringify(b.command)
    )
      fail("运行身份/冻结输入不可改变");
    if (
      action === "cancel" &&
      ["completed", "failed", "cancelled", "interrupted"].includes(b.status)
    ) {
      if (JSON.stringify(a) !== JSON.stringify(b)) fail("终态取消只回读原事实");
      return;
    }
    if (a.runVersion !== b.runVersion + 1 || Date.parse(a.updatedAt) < Date.parse(b.updatedAt))
      fail("状态更新必须递增runVersion及时间");
    if (action === "retry") {
      if (
        !["failed", "interrupted", "cancelled"].includes(b.status) ||
        a.status !== "queued" ||
        a.attempt !== b.attempt + 1 ||
        a.executionTicketId !== null ||
        a.checkpoint.lastEventSeq <= b.checkpoint.lastEventSeq
      )
        fail("重试只可从失败/中断/取消重新排队并追加attempt历史");
    } else {
      if (a.attempt !== b.attempt) fail("非重试不得改变attempt");
      const allowed =
        action === "start"
          ? b.status === "queued" && a.status === "running"
          : action === "complete"
            ? b.status === "running" && a.status === "completed"
            : ["queued", "running"].includes(b.status) &&
              a.status ===
                (action === "cancel" ? "cancelled" : action === "fail" ? "failed" : "interrupted");
      if (!allowed) fail("非法知识整理状态转换");
      if (action === "complete" && a.executionTicketId !== b.executionTicketId)
        fail("晚到旧worker不能提交完成");
    }
  });
export type KnowledgeBuildInput = z.infer<typeof KnowledgeBuildInputSchema>;
export type KnowledgeBuildProposal = z.infer<typeof KnowledgeBuildProposalSchema>;
export type KnowledgeBuildRun = z.infer<typeof KnowledgeBuildRunSchema>;
export type KnowledgeBuildCommand = z.infer<typeof KnowledgeBuildCommandSchema>;
export type KnowledgeBuildResult = z.infer<typeof KnowledgeBuildResultSchema>;
export type KnowledgeBuildEvent = z.infer<typeof KnowledgeBuildEventSchema>;
export interface KnowledgeBuildService {
  execute(command: KnowledgeBuildCommand, context: WikiHostContext): Promise<KnowledgeBuildResult>;
}
export interface KnowledgeBuildClient {
  executeKnowledgeBuild(command: KnowledgeBuildCommand): Promise<KnowledgeBuildResult>;
}
export const knowledgeBuildMethodOrigins: Record<
  KnowledgeBuildCommand["method"],
  readonly WikiHostContext["origin"][]
> = {
  "knowledgeBuild.start": ["human_ui"],
  "knowledgeBuild.get": ["human_ui", "agent_tool", "system_job"],
  "knowledgeBuild.list": ["human_ui", "agent_tool", "system_job"],
  "knowledgeBuild.cancel": ["human_ui"],
  "knowledgeBuild.retry": ["human_ui"],
};

export const KnowledgeBuildCandidateCommitSchema = z
  .strictObject({
    runId: z.uuid(),
    expectedRunVersion: z.number().int().positive(),
    attempt: z.number().int().positive(),
    operationKey: z.uuid(),
    executionTicketId: z.uuid(),
    candidates: z
      .array(
        z.strictObject({
          proposalKey: key,
          expectedVersion: z.number().int().nonnegative(),
          revision: WikiRevisionSchema,
        }),
      )
      .min(1)
      .max(10),
  })
  .refine(
    (v) =>
      unique(v.candidates, (x) => x.proposalKey) &&
      unique(v.candidates, (x) => x.revision.revisionId) &&
      unique(v.candidates, (x) => x.revision.documentId) &&
      v.candidates.every((c) => c.revision.version === c.expectedVersion + 1),
    "宿主候选批次须有独立身份并满足乐观版本",
  );
export type KnowledgeBuildCandidateCommit = z.infer<typeof KnowledgeBuildCandidateCommitSchema>;
/** Host-only synchronous participant: verify the active ticket and pinned inputs from DB again,
 * then atomically save all candidates as unreviewed, completion receipt, run, idempotency and outbox.
 * Immutable blobs are written/verified before this transaction. Never expose as a renderer command.
 */
export interface KnowledgeBuildCandidateWriter {
  commit(input: KnowledgeBuildCandidateCommit, context: WikiHostContext): KnowledgeBuildResult;
}
export type KnowledgeBuildCompletion = z.infer<typeof KnowledgeBuildCompletionSchema>;

export const KnowledgeBuildCandidateCommitExchangeSchema = z
  .strictObject({ run: KnowledgeBuildRunSchema, commit: KnowledgeBuildCandidateCommitSchema })
  .refine(
    ({ run: r, commit: c }) =>
      r.status === "running" &&
      r.checkpoint.phase === "proposal_validated" &&
      c.runId === r.runId &&
      c.expectedRunVersion === r.runVersion &&
      c.attempt === r.attempt &&
      c.operationKey === r.operationKey &&
      c.executionTicketId === r.executionTicketId &&
      c.candidates.length === r.checkpoint.proposalKeys.length &&
      c.candidates.length <= r.command.payload.maxCandidates &&
      c.candidates.every((candidate) => {
        const v = candidate.revision;
        const input = r.command.payload;
        const base = input.base;
        return (
          r.checkpoint.proposalKeys.includes(candidate.proposalKey) &&
          v.workspaceId === r.workspaceId &&
          v.content.kind === input.target.kind &&
          Intl.getCanonicalLocales(v.content.locale)[0] ===
            Intl.getCanonicalLocales(input.target.locale)[0] &&
          JSON.stringify(v.content.scope) === JSON.stringify(input.target.scope) &&
          v.content.sourceRefs.every((ref) =>
            input.sources.some(
              (pin) =>
                pin.sourceRevisionId === ref.sourceRevisionId &&
                pin.artifactHash === ref.artifactHash,
            ),
          ) &&
          (base
            ? c.candidates.length === 1 &&
              candidate.expectedVersion === base.expectedVersion &&
              v.documentId === base.documentId &&
              v.parentRevisionId === base.revisionId
            : candidate.expectedVersion === 0 && v.parentRevisionId === null)
        );
      }),
    "候选批次须绑定当前执行票据、验证检查点、冻结来源/目标及知识基线",
  );
