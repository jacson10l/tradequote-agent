import {
  failure,
  type KnowledgeImpactSubject,
  type KnowledgeMaintenanceCommand,
  KnowledgeMaintenanceCommandSchema,
  type KnowledgeMaintenanceResult,
  knowledgeMaintenanceMethodOrigins,
  type MaintenanceQuery,
  type WikiHostContext,
} from "@tradequote/contracts";

/** S4 维护存储端口：按 B 契约提供 lint 报告生成/回读，以及 A01e 持续维护的
 *  问题队列、影响分析、索引状态/重建与来源撤回。A 在 infrastructure 实现；
 *  domain 只负责命令校验、来源门禁与路由。 */
export interface WikiMaintenanceStore {
  lint(
    input: Extract<KnowledgeMaintenanceCommand, { method: "wiki.lint" }>["payload"],
    context: WikiHostContext,
  ): KnowledgeMaintenanceResult;
  getLintReport(reportId: string): KnowledgeMaintenanceResult;
  getMaintenance(query: MaintenanceQuery, context: WikiHostContext): KnowledgeMaintenanceResult;
  resolveMaintenance(
    input: Extract<KnowledgeMaintenanceCommand, { method: "wiki.resolveMaintenance" }>["payload"],
    context: WikiHostContext,
  ): KnowledgeMaintenanceResult;
  analyzeImpact(
    subject: KnowledgeImpactSubject,
    context: WikiHostContext,
  ): KnowledgeMaintenanceResult;
  getImpact(
    query: Extract<KnowledgeMaintenanceCommand, { method: "wiki.getImpact" }>["payload"],
    context: WikiHostContext,
  ): KnowledgeMaintenanceResult;
  getIndexStatus(
    index: "keyword" | "markdown_view",
    context: WikiHostContext,
  ): KnowledgeMaintenanceResult;
  rebuildIndex(
    input: Extract<KnowledgeMaintenanceCommand, { method: "wiki.rebuildIndex" }>["payload"],
    context: WikiHostContext,
  ): KnowledgeMaintenanceResult;
  getIndexRebuild(rebuildId: string): KnowledgeMaintenanceResult;
  withdrawSource(
    input: Extract<KnowledgeMaintenanceCommand, { method: "source.withdraw" }>["payload"],
    context: WikiHostContext,
  ): KnowledgeMaintenanceResult;
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
          case "wiki.getMaintenance":
            return store.getMaintenance(command.payload, context);
          case "wiki.resolveMaintenance":
            return store.resolveMaintenance(command.payload, context);
          case "wiki.analyzeImpact":
            return store.analyzeImpact(command.payload, context);
          case "wiki.getImpact":
            return store.getImpact(command.payload, context);
          case "wiki.getIndexStatus":
            return store.getIndexStatus(command.payload.index, context);
          case "wiki.rebuildIndex":
            return store.rebuildIndex(command.payload, context);
          case "wiki.getIndexRebuild":
            return store.getIndexRebuild(command.payload.rebuildId);
          case "source.withdraw":
            return store.withdrawSource(command.payload, context);
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
