import {
  failure,
  type KnowledgeMaintenanceCommand,
  KnowledgeMaintenanceCommandSchema,
  type KnowledgeMaintenanceResult,
  knowledgeMaintenanceMethodOrigins,
  type WikiHostContext,
} from "@tradequote/contracts";

/** S4 维护存储端口：按 B 契约的 wiki.lint/wiki.getLintReport 提供完整报告
 *  生成与重开回读。A 在 infrastructure 实现；domain 只负责命令校验、来源门禁与路由。 */
export interface WikiMaintenanceStore {
  lint(
    input: Extract<KnowledgeMaintenanceCommand, { method: "wiki.lint" }>["payload"],
    context: WikiHostContext,
  ): KnowledgeMaintenanceResult;
  getLintReport(reportId: string): KnowledgeMaintenanceResult;
}

/** A01 维护业务服务：严格校验 KnowledgeMaintenanceCommand 信封，按
 *  knowledgeMaintenanceMethodOrigins 执行来源门禁，再委托给存储端口。 */
export function createKnowledgeMaintenanceService(store: WikiMaintenanceStore) {
  return {
    async execute(input: unknown, context: WikiHostContext): Promise<KnowledgeMaintenanceResult> {
      const parsed = KnowledgeMaintenanceCommandSchema.safeParse(input);
      if (!parsed.success) return failure("VALIDATION_ERROR", "请求字段不合法");
      const command = parsed.data;
      if (!knowledgeMaintenanceMethodOrigins[command.method].includes(context.origin))
        return failure("ACTION_NOT_ALLOWED", "该操作不允许此来源");
      try {
        switch (command.method) {
          case "wiki.lint":
            return store.lint(command.payload, context);
          case "wiki.getLintReport":
            return store.getLintReport(command.payload.reportId);
          default:
            return failure("CAPABILITY_UNAVAILABLE", "该维护方法尚未接入");
        }
      } catch {
        return failure(
          "STORAGE_ERROR",
          "本地知识维护操作失败，请重试；仍失败时保留数据并联系维护者",
        );
      }
    },
  };
}
