import { z } from "zod";
import { AgentCommandSchema, ClarificationSchema } from "./agent";
import { RunStatusSchema } from "./events";
import { PublicErrorSchema, readEnvelope, resultSchema, writeEnvelope } from "./protocol";

// Reuse the executable command payloads. No second envelope or operation key at start.
export const AgentOperationSchema = z.discriminatedUnion("method", [
  AgentCommandSchema.options[0].pick({ method: true, payload: true }),
  AgentCommandSchema.options[1].pick({ method: true, payload: true }),
]);
export const AgentRunSchema = z
  .strictObject({
    runId: z.uuid(),
    operationKey: z.uuid(),
    command: AgentCommandSchema,
    status: RunStatusSchema,
    attempt: z.number().int().positive(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    baseRevisionId: z.uuid().nullable(),
    committedRevisionId: z.uuid().nullable(),
    error: PublicErrorSchema.nullable(),
    clarification: ClarificationSchema.shape.clarification.nullable(),
  })
  .superRefine((run, context) => {
    const invalid = (message: string) => context.addIssue({ code: "custom", message });
    if (run.command.idempotencyKey !== run.operationKey) invalid("业务操作键不能改变");
    const base = run.command.method === "agent.revise" ? run.command.payload.baseId : null;
    if (run.baseRevisionId !== base) invalid("基线必须与原业务命令一致");
    if (Date.parse(run.updatedAt) < Date.parse(run.createdAt)) invalid("更新时间不能早于创建时间");
    if ((run.status === "completed") !== (run.committedRevisionId !== null))
      invalid("提交后的运行必须保留完成事实");
    if ((run.status === "waiting_input") !== (run.clarification !== null))
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
  startAgentRun(command: Extract<RunCommand, { method: "agent.start" }>): Promise<RunResult>;
  getAgentRun(command: Extract<RunCommand, { method: "agent.get" }>): Promise<RunResult>;
  cancelAgentRun(command: Extract<RunCommand, { method: "agent.cancel" }>): Promise<RunResult>;
  retryAgentRun(command: Extract<RunCommand, { method: "agent.retry" }>): Promise<RunResult>;
}
