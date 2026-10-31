import {
  failure,
  type WikiCitationResolveInput,
  type WikiCommand,
  WikiCommandSchema,
  type WikiConsumptionInput,
  type WikiHostContext,
  type WikiResult,
  type WikiReviewInput,
  type WikiSearchQuery,
  type WikiSourceStageInput,
  type WikiStageInput,
  wikiMethodOrigins,
} from "@tradequote/contracts";

type PublishPayload = Extract<WikiCommand, { method: "wiki.publish" }>["payload"];
type WithdrawPayload = Extract<WikiCommand, { method: "wiki.withdraw" }>["payload"];
type GetConsumptionPayload = Extract<WikiCommand, { method: "wiki.getConsumption" }>["payload"];

/** A01c storage port. A implements this in infrastructure; domain only owns
 *  channel policy, input validation and command routing. Every method is
 *  synchronous because better-sqlite3 transactions cannot span await. */
export interface WikiStore {
  stageSource(
    input: WikiSourceStageInput,
    context: WikiHostContext,
    idempotencyKey: string,
  ): WikiResult;
  getSourceRevision(sourceRevisionId: string): WikiResult;
  stageWiki(input: WikiStageInput, context: WikiHostContext, idempotencyKey: string): WikiResult;
  getWikiRevision(revisionId: string): WikiResult;
  listWikiRevisions(documentId: string, beforeVersion: number | null, limit: number): WikiResult;
  review(input: WikiReviewInput, context: WikiHostContext, idempotencyKey: string): WikiResult;
  publish(input: PublishPayload, context: WikiHostContext, idempotencyKey: string): WikiResult;
  withdraw(input: WithdrawPayload, context: WikiHostContext, idempotencyKey: string): WikiResult;
  search(query: WikiSearchQuery, context: WikiHostContext): WikiResult;
  resolveCitation(input: WikiCitationResolveInput, context: WikiHostContext): WikiResult;
  registerConsumption(
    input: WikiConsumptionInput,
    context: WikiHostContext,
    idempotencyKey: string,
  ): WikiResult;
  getConsumption(consumer: GetConsumptionPayload): WikiResult;
}

/** A01c business service: validate the strict command envelope, enforce the
 *  per-method origin policy declared by B00a, then delegate to the store. */
export function createWikiService(store: WikiStore) {
  return {
    async execute(input: unknown, context: WikiHostContext): Promise<WikiResult> {
      const parsed = WikiCommandSchema.safeParse(input);
      if (!parsed.success) return failure("VALIDATION_ERROR", "请求字段不合法");
      const command = parsed.data;
      if (!wikiMethodOrigins[command.method].includes(context.origin))
        return failure("ACTION_NOT_ALLOWED", "该操作不允许此来源");
      try {
        switch (command.method) {
          case "source.stage":
            return store.stageSource(command.payload, context, command.idempotencyKey);
          case "source.getRevision":
            return store.getSourceRevision(command.payload.sourceRevisionId);
          case "wiki.stage":
            return store.stageWiki(command.payload, context, command.idempotencyKey);
          case "wiki.getRevision":
            return store.getWikiRevision(command.payload.revisionId);
          case "wiki.listRevisions":
            return store.listWikiRevisions(
              command.payload.documentId,
              command.payload.beforeVersion,
              command.payload.limit,
            );
          case "wiki.review":
            return store.review(command.payload, context, command.idempotencyKey);
          case "wiki.publish":
            return store.publish(command.payload, context, command.idempotencyKey);
          case "wiki.withdraw":
            return store.withdraw(command.payload, context, command.idempotencyKey);
          case "wiki.search":
            return store.search(command.payload, context);
          case "wiki.resolveCitation":
            return store.resolveCitation(command.payload, context);
          case "wiki.registerConsumption":
            return store.registerConsumption(command.payload, context, command.idempotencyKey);
          case "wiki.getConsumption":
            return store.getConsumption(command.payload);
        }
      } catch {
        return failure("STORAGE_ERROR", "本地知识库操作失败，请重试；仍失败时保留数据并联系维护者");
      }
    },
  };
}
