import { randomUUID } from "node:crypto";
import { WikiResultSchema } from "@tradequote/contracts";
import { afterEach, expect, it } from "vitest";
import { AgentRunCoordinator } from "./agent-run-coordinator";
import type { ModelMessage } from "./deepseek";
import { common, runFixture } from "./testing/run-fixture";

const cleanup: (() => void)[] = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });
const sourceText = "企业演示规则：付款内容不得出现 FREE，出现时必须阻断报价。";
const output = () => ({ title: "付款用语规则", sections: [{ title: "禁止承诺免费", text: "付款内容包含 FREE 时阻断报价。", sourceExcerpt: sourceText, rules: [{ category: "commercial_terms", title: "禁止FREE", field: "payment", condition: { kind: "forbidden_literal", literal: "FREE" }, failureSeverity: "block", message: "付款内容含禁止用语FREE", suggestedAction: "请核对付款要求" }] }] });
async function setup() {
  const f = runFixture(cleanup);
  const context = { actorId: "synthetic-operator", origin: "human_ui" as const, workspaceId: f.scenario.id, now: new Date().toISOString() };
  context.workspaceId = f.repo.read()!.id;
  const result = WikiResultSchema.parse(await f.repo.executeWiki({ ...common(), method: "source.stage", payload: { sourceId: randomUUID(), expectedVersion: 0, label: "明确合成企业规则", sourceStatus: "synthetic", mediaType: "text/plain", sourceText, acquiredAt: context.now, sourceUri: null, permissionNote: "测试自编资料", validity: { status: "confirmed", validFrom: null, validUntil: null } } }, context));
  if (!result.ok || result.data.kind !== "sourceRevision") throw new Error("source fixture");
  const source = result.data.revision;
  const command = { ...common(), method: "knowledge.organize" as const, payload: { source: { sourceRevisionId: source.sourceRevisionId, artifactHash: source.artifactHash }, target: { kind: "rule" as const, locale: "en", scope: { platforms: [f.scenario.platform], markets: [f.scenario.market], categories: [f.product.category] } }, instructions: "整理为付款规则，不修改来源含义" } };
  return { ...f, source, context, command };
}
it("organizes original text into an unconfirmed candidate exactly once; publishing still requires human confirmation and lint", async () => {
  const f = await setup(); let calls = 0;
  expect(f.repo.executeKnowledgeDesktop).toBeTypeOf("function");
  const provider = { json: async () => { calls++; return output(); } };
  const result = await f.repo.executeKnowledgeDesktop(f.command, provider);
  expect(result.ok).toBe(true);
  if (!result.ok || result.data.kind !== "organized") throw new Error("organize");
  const { record } = result.data;
  expect(record.lifecycle.state).toBe("candidate");
  expect(record.revision.content.validity.status).toBe("unknown");
  expect(record.revision.content.sourceRefs[0]?.artifactHash).toBe(f.source.artifactHash);
  expect(await f.repo.executeKnowledgeDesktop(f.command, provider)).toEqual(result);
  expect(calls).toBe(1);
  const lint = f.repo.runWikiLint(record.revision.revisionId, { ...f.context, now: new Date().toISOString() });
  expect(lint?.outcome).toBe("unknown");
});
it("rejects invented excerpts, remembers failure without charging again, and rejects changed input under one operation key", async () => {
  const f = await setup(); let calls = 0;
  const provider = { json: async () => { calls++; const value = output(); value.sections[0]!.sourceExcerpt = "not present"; return value; } };
  const first = await f.repo.executeKnowledgeDesktop(f.command, provider);
  expect(first).toMatchObject({ ok: false, error: { code: "MODEL_INVALID_OUTPUT" } });
  expect(await f.repo.executeKnowledgeDesktop(f.command, provider)).toEqual(first);
  expect(calls).toBe(1);
  expect(await f.repo.executeKnowledgeDesktop({ ...f.command, payload: { ...f.command.payload, instructions: "changed" } }, provider)).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_CONFLICT" } });
  expect(f.db.prepare("SELECT count(*) n FROM knowledge_wiki").get()).toEqual({ n: 0 });
});
async function publish(f: Awaited<ReturnType<typeof setup>>) {
  const result = await f.repo.executeKnowledgeDesktop(f.command, { json: async () => output() });
  if (!result.ok || result.data.kind !== "organized") throw new Error("organize");
  const original = result.data.record.revision;
  const candidate = WikiResultSchema.parse(await f.repo.executeWiki({ ...common(), method: "wiki.stage", payload: { documentId: original.documentId, expectedVersion: original.version, parentRevisionId: original.revisionId, content: { ...original.content, validity: { status: "confirmed", validFrom: null, validUntil: null } } } }, { ...f.context, now: new Date().toISOString() }));
  if (!candidate.ok || candidate.data.kind !== "wikiRevision") throw new Error("confirm");
  const {revision,lifecycle} = candidate.data.record;
  const lint = f.repo.runWikiLint(revision.revisionId,{...f.context,now:new Date().toISOString()});
  expect(lint?.outcome).toBe("passed");
  const binding = {revisionId:revision.revisionId,contentHash:revision.contentHash,sourceSetHash:revision.sourceSetHash};
  const reviewed = WikiResultSchema.parse(await f.repo.executeWiki({...common(),method:"wiki.review",payload:{...binding,expectedLifecycleVersion:lifecycle.lifecycleVersion,decision:"approve",note:"人工核对合成规则及摘录",lintReceiptId:lint!.receiptId}}, {...f.context,now:new Date().toISOString()}));
  if(!reviewed.ok || reviewed.data.kind!=="wikiRevision") throw new Error(JSON.stringify(reviewed));
  const published=await f.repo.executeWiki({...common(),method:"wiki.publish",payload:{...binding,expectedLifecycleVersion:reviewed.data.record.lifecycle.lifecycleVersion,reviewId:reviewed.data.record.lifecycle.review!.reviewId}}, {...f.context,now:new Date().toISOString()});
  expect(published).toMatchObject({ok:true,data:{kind:"wikiRevision",record:{lifecycle:{state:"published"}}}});
  return revision;
}
it("human-confirmed candidate passes actual lint/review/publish and can be listed", async () => {
  const f = await setup(); await publish(f);
  const overview=await f.repo.executeKnowledgeDesktop({schemaVersion:1,requestId:randomUUID(),method:"knowledge.overview",payload:{}});
  expect(overview.ok).toBe(true);
});

it("quote agent consumes published Wiki rules, records sources atomically, preserves historical reports after withdrawal and blocks forbidden terms", async () => {
  const f = await setup(); const revision = await publish(f); let payment = "T/T";
  const json = async (messages: ModelMessage[]) => {
    const seen = messages.filter(m => m.role === "user" && m.content.startsWith('{"toolResult":')).map(m => JSON.parse(m.content).toolResult);
    const last = seen.at(-1); const tool = (name: string,input: unknown) => ({kind:"tool",name,input});
    if (!last) return tool("search_catalog",{query:f.product.sku});
    if (last.name === "search_catalog") return tool("get_product_revisions",{productIds:[f.product.id]});
    if (last.name === "get_product_revisions") return tool("calculate_quote",{proposal:{...f.proposal,payment}});
    if (last.name === "calculate_quote") return tool("search_knowledge",{});
    const calculation = seen.find(x => x.name === "calculate_quote").data.data;
    if (last.name === "search_knowledge") return tool("validate_quote",{candidateId:calculation.candidateId});
    if (!last.data.data.allowed) return {kind:"complete",summary:"存在阻断规则，未保存"};
    return tool("create_draft",{candidateId:calculation.candidateId,validationId:last.data.data.validationId});
  };
  const coordinator = new AgentRunCoordinator(f.repo,() => ({json}));
  const command = () => ({...common(),method:"agent.understand" as const,payload:{...f.start().payload.payload,executionMode:"tool_loop" as const}});
  const credentials = {key:"synthetic-key-not-a-secret",model:"synthetic-model"};
  const first = await coordinator.executeLegacy(command(),credentials);
  expect(first.ok, JSON.stringify(first)).toBe(true);
  const run = f.store.list().runs.find(r => r.status === "completed")!;
  expect(run.validation?.report.wikiCitations?.[0]?.revisionId).toBe(revision.revisionId);
  expect(run.toolSteps?.find(s => s.tool === "search_knowledge")?.evidenceIds).toContain(revision.revisionId);
  expect(f.db.prepare("SELECT count(*) n FROM knowledge_consumption").get()).toEqual({n:1});
  payment = "FREE";
  expect(await coordinator.executeLegacy(command(),credentials)).toMatchObject({ok:false,error:{code:"RULE_BLOCKED"}});
  const record = WikiResultSchema.parse(await f.repo.executeWiki({schemaVersion:1,requestId:randomUUID(),method:"wiki.getRevision",payload:{revisionId:revision.revisionId}},f.context));
  if(!record.ok || record.data.kind!=="wikiRevision") throw new Error("record");
  await f.repo.executeWiki({...common(),method:"wiki.withdraw",payload:{revisionId:revision.revisionId,expectedLifecycleVersion:record.data.record.lifecycle.lifecycleVersion,note:"合成撤回验证"}}, {...f.context,now:new Date().toISOString()});
  expect(f.store.get(run.runId).validation?.report).toEqual(run.validation?.report);
  expect(f.repo.executeChecks({schemaVersion:1,requestId:randomUUID(),method:"quote.getChecks",payload:{revisionId:run.committedRevisionId}}, {actorId:"local-user",origin:"human_ui"})).toMatchObject({ok:true});
  await coordinator.close();
});
