import { type AgentClient, AgentCommandSchema, ModelCredentialsSchema } from "./agent";

export * from "./agent";

import { z } from "zod";
import type { CheckClient } from "./checks";
import type { KnowledgeClient } from "./knowledge";
import type { WikiClient } from "./knowledge-wiki";
import { IssueSchema } from "./protocol";
import type { RunClient } from "./runs";

export * from "./checks";
export * from "./knowledge";
export * from "./knowledge-wiki";
export { unavailableFirstBatchClient } from "./pending-client";
export { FailureSchema, IssueSchema, PublicErrorSchema } from "./protocol";
export * from "./runs";
export * from "./wiki-integrity";

import { ErrorCodeSchema } from "./errors";
import { type TradeClient, TradeCommandSchema, TradeResultSchema } from "./trade";

export { ErrorCodeSchema } from "./errors";
export * from "./trade";

export const NameSchema = z.string().trim().min(1, "请输入工作区名称").max(80, "名称最多 80 字");
export const WorkspaceFormSchema = z.strictObject({ name: NameSchema });
export const WorkspaceSchema = z.strictObject({
  id: z.uuid(),
  name: NameSchema,
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;
const envelope = { schemaVersion: z.literal(1), requestId: z.uuid() };
const write = { ...envelope, idempotencyKey: z.uuid() };
export const CommandSchema = z.discriminatedUnion("method", [
  z.strictObject({ ...envelope, method: z.literal("workspace.get") }),
  z.strictObject({ ...write, method: z.literal("workspace.create"), payload: WorkspaceFormSchema }),
  z.strictObject({
    ...write,
    method: z.literal("workspace.rename"),
    payload: z.strictObject({ name: NameSchema, expectedVersion: z.number().int().positive() }),
  }),
]);
export type Command = z.infer<typeof CommandSchema>;
export type CreateWorkspace = Extract<Command, { method: "workspace.create" }>;
export type RenameWorkspace = Extract<Command, { method: "workspace.rename" }>;
export const ResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    data: WorkspaceSchema.nullable(),
    warnings: z.array(IssueSchema),
    evidenceIds: z.array(z.string()),
  }),
  z.strictObject({
    ok: z.literal(false),
    error: z.strictObject({
      code: ErrorCodeSchema,
      message: z.string(),
      retryable: z.boolean(),
      issues: z.array(IssueSchema),
      currentAggregateVersion: z.number().int().positive().optional(),
    }),
  }),
]);
export type WorkspaceResult = z.infer<typeof ResultSchema>;
export function failure(
  code: z.infer<typeof ErrorCodeSchema>,
  message: string,
  currentAggregateVersion?: number,
): Extract<WorkspaceResult, { ok: false }> {
  return {
    ok: false,
    error: {
      code,
      message,
      // CAPABILITY_UNAVAILABLE 是"能力尚未接入"而非瞬时故障，重试同一请求不会成功（A-W08）。
      // 与 pending-client.ts 及 B00a 协议（retryable=false）一致。
      retryable: false,
      issues: [],
      ...(currentAggregateVersion === undefined ? {} : { currentAggregateVersion }),
    },
  };
}
export function success(data: Workspace | null): WorkspaceResult {
  return { ok: true, data, warnings: [], evidenceIds: [] };
}
export interface DesktopClient
  extends TradeClient,
    AgentClient,
    KnowledgeClient,
    WikiClient,
    CheckClient,
    RunClient {
  getWorkspace(): Promise<WorkspaceResult>;
  createWorkspace(command: CreateWorkspace): Promise<WorkspaceResult>;
  renameWorkspace(command: RenameWorkspace): Promise<WorkspaceResult>;
}
export interface ExecutionContext {
  actorId: string;
  origin: "human_ui" | "agent_tool" | "system_job";
}
export const RuntimeCommandSchema = z.union([
  CommandSchema,
  TradeCommandSchema,
  AgentCommandSchema,
]);
export const RuntimeResultSchema = z.union([ResultSchema, TradeResultSchema]);
export type RuntimeCommand = z.infer<typeof RuntimeCommandSchema>;
export type RuntimeResult = z.infer<typeof RuntimeResultSchema>;
export const WorkerRequestSchema = z.strictObject({
  id: z.uuid(),
  command: RuntimeCommandSchema,
  credentials: ModelCredentialsSchema.optional(),
});
export const WorkerReplySchema = z.strictObject({ id: z.uuid(), result: RuntimeResultSchema });

export type { RunEvent } from "./events";
export { RunEventSchema, RunStatusSchema } from "./events";
export type { QuoteRevisionInput, TypedPatch } from "./quote";
export {
  ApprovalBindingSchema,
  PatchBatchSchema,
  patchToolJsonSchema,
  QuoteRevisionInputSchema,
  TypedPatchSchema,
} from "./quote";
export type { Evidence, Quantity } from "./values";
export {
  DecimalSchema,
  EvidenceSchema,
  factSchema,
  LocaleSchema,
  MoneySchema,
  QuantitySchema,
  SourceLocationSchema,
} from "./values";
