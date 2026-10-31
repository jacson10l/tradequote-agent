import {
  type Command,
  CommandSchema,
  type ExecutionContext,
  failure,
  success,
  type Workspace,
  type WorkspaceResult,
} from "@tradequote/contracts";

export interface WorkspaceRepository {
  read(): Workspace | null;
  commit(
    command: Exclude<Command, { method: "workspace.get" }>,
    context: ExecutionContext,
  ): WorkspaceResult;
}
export interface ArtifactStore {
  putImmutable(bytes: Uint8Array): Promise<string>;
  readById(id: string): Promise<Uint8Array>;
  verifyHash(id: string): Promise<boolean>;
}
export function transitionWorkspace(
  current: Workspace | null,
  command: Exclude<Command, { method: "workspace.get" }>,
  newId: string,
  now: string,
): WorkspaceResult {
  if (command.method === "workspace.create") {
    if (current) return failure("REVISION_CONFLICT", "已有工作区，请重新加载", current.version);
    return success({ id: newId, name: command.payload.name, version: 1, createdAt: now });
  }
  if (!current) return failure("NOT_FOUND", "请先创建工作区");
  if (current.version !== command.payload.expectedVersion)
    return failure("REVISION_CONFLICT", "工作区已更新，请重新加载后修改", current.version);
  return success({ ...current, name: command.payload.name, version: current.version + 1 });
}
export function createWorkspaceService(repository: WorkspaceRepository) {
  return {
    execute(input: unknown, context: ExecutionContext): WorkspaceResult {
      const parsed = CommandSchema.safeParse(input);
      if (!parsed.success) return failure("VALIDATION_ERROR", "请求字段不合法");
      if (context.origin !== "human_ui")
        return failure("ACTION_NOT_ALLOWED", "工作区设置仅允许人工操作");
      try {
        return parsed.data.method === "workspace.get"
          ? success(repository.read())
          : repository.commit(parsed.data, context);
      } catch {
        return failure("STORAGE_ERROR", "本地保存失败，请重试；仍失败时保留数据并联系维护者");
      }
    },
  };
}

export { type AgentRunAction, transitionAgentRun } from "./agent-run";
export { evaluateQuoteChecks, type QuoteCheckEvaluation } from "./quote-checks";
export { reviseQuote } from "./revision";
export type { TradeRepository } from "./trade";
export {
  calculateQuoteV1,
  createTradeService,
  sortedTiers,
  TradeFault,
  validateCatalogRows,
} from "./trade";
