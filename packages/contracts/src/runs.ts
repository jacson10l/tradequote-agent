import { z } from "zod";
import { AgentCommandSchema, ClarificationSchema } from "./agent";
import { CheckReportSchema } from "./checks";
import { ErrorCodeSchema } from "./errors";
import { RunStatusSchema } from "./events";
import { PublicErrorSchema, readEnvelope, resultSchema, writeEnvelope } from "./protocol";
import {
  AgentReadCommandSchema,
  AgentReadDataSchema,
  CalculationPreviewSchema,
  ReadToolObservationSchema,
} from "./read-tools";

export const RunOperationCommandSchema = z.discriminatedUnion("method", [
  ...AgentCommandSchema.options,
  AgentReadCommandSchema.extend({ idempotencyKey: z.uuid() }),
]);
// Reuse the executable command payloads. No second envelope or operation key at start.
export const AgentOperationSchema = z.discriminatedUnion("method", [
  AgentCommandSchema.options[0].pick({ method: true, payload: true }),
  AgentCommandSchema.options[1].pick({ method: true, payload: true }),
  AgentReadCommandSchema.pick({ method: true, payload: true }),
]);
export const AgentToolNameSchema = z.enum([
  "search_catalog",
  "get_product_revisions",
  "get_quote",
  "search_knowledge",
  "calculate_quote",
  "validate_quote",
  "create_draft",
  "apply_patch",
]);
export const AgentToolStepSchema = z
  .strictObject({
    toolCallId: z.uuid(),
    attempt: z.number().int().positive(),
    ordinal: z.number().int().min(1).max(12),
    tool: AgentToolNameSchema,
    ok: z.boolean(),
    evidenceIds: z.array(z.string().min(1).max(200)).max(500),
    errorCode: ErrorCodeSchema.nullable(),
  })
  .refine((step) => step.ok === (step.errorCode === null), "工具失败须保留错误码");
export type AgentToolStep = z.infer<typeof AgentToolStepSchema>;
export const AgentRunSchema = z
  .strictObject({
    runId: z.uuid(),
    operationKey: z.uuid(),
    command: RunOperationCommandSchema,
    continuationOf: z.uuid().optional(),
    continuationMessage: z.string().trim().min(1).max(8000).optional(),
    clarificationHistory: z
      .array(
        z.strictObject({
          question: z.string().min(1).max(2000),
          answer: z.string().min(1).max(8000),
        }),
      )
      .max(20)
      .optional(),
    resolvedByRunId: z.uuid().optional(),
    readResult: AgentReadDataSchema.optional(),
    readObservations: z.array(ReadToolObservationSchema).max(12).optional(),
    status: RunStatusSchema,
    attempt: z.number().int().positive(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    baseRevisionId: z.uuid().nullable(),
    committedRevisionId: z.uuid().nullable(),
    error: PublicErrorSchema.nullable(),
    clarification: ClarificationSchema.shape.clarification.nullable(),
    toolSteps: z.array(AgentToolStepSchema).max(12).optional(),
    calculationPreview: CalculationPreviewSchema.optional(),
    validation: z
      .strictObject({
        kind: z.enum(["calculation_preview", "saved_revision"]),
        report: CheckReportSchema,
      })
      .optional(),
  })
  .superRefine((run, context) => {
    const invalid = (message: string) => context.addIssue({ code: "custom", message });
    if (run.command.idempotencyKey !== run.operationKey) invalid("业务操作键不能改变");
    if (
      run.toolSteps?.some(
        (step, index) => step.attempt !== run.attempt || step.ordinal !== index + 1,
      )
    )
      invalid("工具步骤须属于当前attempt且连续");
    if (
      run.validation?.kind === "saved_revision" &&
      (run.status !== "completed" || run.validation.report.revisionId !== run.committedRevisionId)
    )
      invalid("检查报告须关联真实已保存版本");
    const base = run.command.method === "agent.revise" ? run.command.payload.baseId : null;
    if (run.baseRevisionId !== base) invalid("基线必须与原业务命令一致");
    if (Date.parse(run.updatedAt) < Date.parse(run.createdAt)) invalid("更新时间不能早于创建时间");
    if (run.command.method === "agent.read") {
      if (run.committedRevisionId !== null || run.validation) invalid("只读运行不可保存报价");
      if ((run.status === "completed") !== (run.readResult?.outcome === "completed"))
        invalid("只读完成须有持久结果");
    } else {
      if (run.readResult || run.readObservations) invalid("报价任务不可带只读结果");
      if ((run.status === "completed") !== (run.committedRevisionId !== null))
        invalid("提交后的运行必须保留完成事实");
    }
    if ((run.status === "resolved") !== !!run.resolvedByRunId)
      invalid("已解决澄清须有完成运行关联");
    if (!!run.continuationOf !== !!run.continuationMessage) invalid("补充任务须保留用户原文");
    if (run.continuationOf === run.runId || run.resolvedByRunId === run.runId)
      invalid("关联运行不能引用自身");
    if (["waiting_input", "resolved"].includes(run.status) !== (run.clarification !== null))
      invalid("等待输入必须保存澄清正文，其他状态须清空正文");
    if (run.status === "failed" && run.error === null) invalid("失败运行须有公开错误");
    if (run.status !== "failed" && run.status !== "interrupted" && run.error !== null)
      invalid("非失败运行不可带失败错误");
  });
export const RunCursorSchema = z.strictObject({ createdAt: z.iso.datetime(), runId: z.uuid() });
export const RunListQuerySchema = z.strictObject({
  limit: z.number().int().min(1).max(100).default(20),
  status: RunStatusSchema.optional(),
  cursor: RunCursorSchema.optional(),
});
export const RunCommandSchema = z.discriminatedUnion("method", [
  z.strictObject({
    ...writeEnvelope,
    method: z.literal("agent.start"),
    payload: AgentOperationSchema,
  }),
  z.strictObject({
    ...readEnvelope,
    method: z.literal("agent.get"),
    payload: z.strictObject({ runId: z.uuid() }),
  }),
  z.strictObject({
    ...writeEnvelope,
    method: z.literal("agent.cancel"),
    payload: z.strictObject({ runId: z.uuid() }),
  }),
  z.strictObject({
    ...writeEnvelope,
    method: z.literal("agent.retry"),
    payload: z.strictObject({ runId: z.uuid() }),
  }),
  z.strictObject({
    ...readEnvelope,
    method: z.literal("agent.list"),
    payload: RunListQuerySchema,
  }),
  z.strictObject({
    ...writeEnvelope,
    method: z.literal("agent.continue"),
    payload: z.strictObject({ runId: z.uuid(), supplement: z.string().trim().min(1).max(8000) }),
  }),
]);
export const RunListResultSchema = resultSchema(
  z.strictObject({
    runs: z.array(AgentRunSchema).max(100),
    nextCursor: RunCursorSchema.nullable(),
  }),
);
export type RunListQuery = z.input<typeof RunListQuerySchema>;
export type RunListResult = z.infer<typeof RunListResultSchema>;
export const RunResultSchema = resultSchema(AgentRunSchema);
export type AgentOperation = z.infer<typeof AgentOperationSchema>;
export type AgentRun = z.infer<typeof AgentRunSchema>;
export type RunCommand = z.infer<typeof RunCommandSchema>;
export type RunResult = z.infer<typeof RunResultSchema>;
export interface RunClient {
  listAgentRuns(command: Extract<RunCommand, { method: "agent.list" }>): Promise<RunListResult>;
  continueAgentRun(command: Extract<RunCommand, { method: "agent.continue" }>): Promise<RunResult>;
  startAgentRun(command: Extract<RunCommand, { method: "agent.start" }>): Promise<RunResult>;
  getAgentRun(command: Extract<RunCommand, { method: "agent.get" }>): Promise<RunResult>;
  cancelAgentRun(command: Extract<RunCommand, { method: "agent.cancel" }>): Promise<RunResult>;
  retryAgentRun(command: Extract<RunCommand, { method: "agent.retry" }>): Promise<RunResult>;
}
