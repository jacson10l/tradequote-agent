import { z } from "zod";

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
export const ErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "REVISION_CONFLICT",
  "IDEMPOTENCY_CONFLICT",
  "NOT_FOUND",
  "ACTION_NOT_ALLOWED",
  "CAPABILITY_UNAVAILABLE",
  "STORAGE_ERROR",
]);
export const IssueSchema = z.strictObject({
  code: z.string(),
  fieldPath: z.string().optional(),
  severity: z.enum(["info", "warning", "block", "pending"]),
  message: z.string(),
  evidenceIds: z.array(z.string()),
  suggestedAction: z.string().optional(),
});
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
): WorkspaceResult {
  return {
    ok: false,
    error: {
      code,
      message,
      retryable: code === "CAPABILITY_UNAVAILABLE",
      issues: [],
      ...(currentAggregateVersion === undefined ? {} : { currentAggregateVersion }),
    },
  };
}
export function success(data: Workspace | null): WorkspaceResult {
  return { ok: true, data, warnings: [], evidenceIds: [] };
}
export interface DesktopClient {
  getWorkspace(): Promise<WorkspaceResult>;
  createWorkspace(command: CreateWorkspace): Promise<WorkspaceResult>;
  renameWorkspace(command: RenameWorkspace): Promise<WorkspaceResult>;
}
export interface ExecutionContext {
  actorId: string;
  origin: "human_ui" | "agent_tool" | "system_job";
}
export const WorkerRequestSchema = z.strictObject({ id: z.uuid(), command: CommandSchema });
export const WorkerReplySchema = z.strictObject({ id: z.uuid(), result: ResultSchema });

// Contract seed only: M3 implements calculations and all remaining patch operations.
export const DecimalSchema = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/);
export const TypedPatchSchema = z.discriminatedUnion("op", [
  z.strictObject({
    op: z.literal("setQuantity"),
    lineId: z.uuid(),
    quantity: DecimalSchema,
    unit: z.string().min(1).max(32),
  }),
  z.strictObject({
    op: z.literal("setCommercialTerm"),
    key: z.string().min(1).max(64),
    value: z.string().max(2000),
  }),
]);
export const patchToolJsonSchema = () =>
  z.toJSONSchema(z.strictObject({ patches: z.array(TypedPatchSchema).min(1).max(50) }), {
    target: "draft-7",
  });
