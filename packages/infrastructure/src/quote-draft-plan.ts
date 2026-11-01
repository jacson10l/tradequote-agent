import { createHash, randomUUID } from "node:crypto";
import {
  type AgentCommand,
  type WikiCitationResolution,
  KnowledgeCitationSchema,
  type CheckReport,
  KnowledgeListResultSchema,
  type KnowledgeQuery,
  KnowledgeQuerySchema,
  type KnowledgeRevision,
  type QuoteSnapshot,
  QuoteSnapshotSchema,
  type RevisionProposal,
  type TradeBoard,
  type Understanding,
} from "@tradequote/contracts";
import { calculateQuoteV1, quoteCheckService, reviseQuote, TradeFault } from "@tradequote/domain";
import { z } from "zod";

export const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function ruleCategory(quote: QuoteSnapshot): string {
  const categories = [...new Set(quote.lines.map((line) => line.product.category))];
  if (categories.length !== 1 || !categories[0])
    throw new TradeFault(
      "MISSING_FACTS",
      "本轮规则检查需单一商品品类，请拆分混合品类报价后新建任务",
    );
  return categories[0];
}
function singleCategory(quote: QuoteSnapshot): QuoteSnapshot {
  ruleCategory(quote);
  return quote;
}
export function draftPlan(
  board: TradeBoard,
  command: AgentCommand,
  proposal: Understanding | RevisionProposal,
  workspaceId: string,
  asOf: string,
  candidateId: string,
): QuoteSnapshot {
  if (command.method === "agent.understand") {
    if (!board.scenario || board.scenario.id !== command.payload.scenarioId)
      throw new TradeFault("REVISION_CONFLICT", "场景已变化，请重新加载");
    if (!("lines" in proposal)) throw new TradeFault("VALIDATION_ERROR", "候选类型不匹配");
    return singleCategory(
      QuoteSnapshotSchema.parse(
        calculateQuoteV1(
          {
            scenarioId: command.payload.scenarioId,
            buyer: command.payload.buyer,
            inquiry: command.payload.inquiry,
            lines: proposal.lines,
            payment: proposal.payment,
            delivery: proposal.delivery,
          },
          board.scenario,
          board.products,
          { id: candidateId, workspaceId, createdAt: asOf },
        ),
      ),
    );
  }
  const base = board.quotes.find(
    (quote) => quote.id === command.payload.baseId && quote.workspaceId === workspaceId,
  );
  if (!base) throw new TradeFault("NOT_FOUND", "报价基线不存在");
  if (
    base.version !== command.payload.expectedVersion ||
    board.quotes.some(
      (quote) =>
        (quote.rootId ?? quote.id) === (base.rootId ?? base.id) && quote.version > base.version,
    )
  )
    throw new TradeFault("REVISION_CONFLICT", "报价已有新版本，请重新加载");
  if (!("patches" in proposal)) throw new TradeFault("VALIDATION_ERROR", "候选类型不匹配");
  return singleCategory(reviseQuote(base, proposal, { id: candidateId, createdAt: asOf }));
}
export function semanticQuote(quote: QuoteSnapshot) {
  const { id: _id, number: _number, createdAt: _createdAt, ...content } = quote;
  return content;
}
export function knowledgeQuery(quote: QuoteSnapshot, at: string): KnowledgeQuery {
  return KnowledgeQuerySchema.parse({
    scope: {
      platform: quote.scenario.platform,
      market: quote.scenario.market,
      category: ruleCategory(quote),
    },
    at,
  });
}
export function checkedKnowledge(value: unknown): KnowledgeRevision[] {
  const result = KnowledgeListResultSchema.parse(value);
  if (!result.ok) throw new TradeFault(result.error.code, result.error.message);
  if (result.data.revisions.length > 50)
    throw new TradeFault("VALIDATION_ERROR", "适用知识超过本轮50版本预算，请缩小资料范围");
  for (const revision of result.data.revisions)
    if (
      createHash("sha256").update(revision.content.sourceText).digest("hex") !== revision.sourceHash
    )
      throw new TradeFault("STORAGE_ERROR", "知识原文与来源hash不一致");
  return result.data.revisions;
}
export const knowledgeStamp = (revisions: KnowledgeRevision[]) =>
  digest([...revisions].sort((a, b) => a.revisionId.localeCompare(b.revisionId)));
export function checkDraft(
  quote: QuoteSnapshot,
  knowledge: KnowledgeRevision[],
  at: string,
  reportId: string = randomUUID(),
): CheckReport {
  return quoteCheckService.evaluate({
    quote: { ...quote, scenario: { ...quote.scenario, category: ruleCategory(quote) } },
    knowledge,
    checkedAt: at,
    reportId,
  });
}
export const wikiKnowledgeStamp = (resolutions: WikiCitationResolution[]) => digest(
  resolutions.map(r => ({ citation: r.citation, contentHash: r.revision.contentHash, sourceSetHash: r.revision.sourceSetHash }))
    .sort((a,b) => `${a.citation.revisionId}:${a.citation.sectionId}`.localeCompare(`${b.citation.revisionId}:${b.citation.sectionId}`)),
);
export const DraftAuthorizationSchema = z.strictObject({
  calculated: QuoteSnapshotSchema,
  knowledgeStamp: z.string().regex(/^[a-f0-9]{64}$/),
  wikiStamp: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  wikiCitations: z.array(KnowledgeCitationSchema).min(1).max(100).optional(),
  asOf: z.iso.datetime(),
});
export type DraftAuthorization = z.infer<typeof DraftAuthorizationSchema>;
