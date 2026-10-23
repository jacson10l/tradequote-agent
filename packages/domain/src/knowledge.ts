import {
  type ExecutionContext,
  failure,
  KnowledgeCommandSchema,
  type KnowledgeRepository,
  type KnowledgeResult,
} from "@tradequote/contracts";

/** A01b business service: channel policy + input validation in front of the store.
 *  stage/publish are human_ui only (task A01 acceptance #1); query/getRevision stay
 *  open so B01 and C can read published knowledge without a UI. */
export function createKnowledgeService(repository: KnowledgeRepository) {
  return {
    execute(input: unknown, context: ExecutionContext): KnowledgeResult {
      const parsed = KnowledgeCommandSchema.safeParse(input);
      if (!parsed.success) return failure("VALIDATION_ERROR", "请求字段不合法");
      const command = parsed.data;
      if (command.method === "knowledge.stage" || command.method === "knowledge.publish") {
        if (context.origin !== "human_ui")
          return failure("ACTION_NOT_ALLOWED", "知识暂存与发布仅允许人工界面确认");
        try {
          return command.method === "knowledge.stage"
            ? repository.stage(command.payload, context, command.idempotencyKey)
            : repository.publish(command.payload, context, command.idempotencyKey);
        } catch {
          return failure("STORAGE_ERROR", "本地保存失败，请重试；仍失败时保留数据并联系维护者");
        }
      }
      try {
        if (command.method === "knowledge.query")
          return {
            ok: true,
            data: { kind: "list", revisions: repository.findPublished(command.payload) },
            warnings: [],
            evidenceIds: [],
          };
        const revision = repository.getRevision(command.payload.revisionId);
        return revision
          ? {
              ok: true,
              data: { kind: "revision", revision },
              warnings: [],
              evidenceIds: [revision.revisionId],
            }
          : failure("NOT_FOUND", "版本不存在");
      } catch {
        return failure("STORAGE_ERROR", "本地读取失败，请重试；仍失败时保留数据并联系维护者");
      }
    },
  };
}
