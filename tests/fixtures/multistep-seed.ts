// Synthetic acceptance setup: real public A/quotation services, isolated userData only.
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { demoCatalogCsv, demoScenario } from "../../packages/contracts/src/index";
import { SqliteWorkspaceRepository } from "../../packages/infrastructure/src/index";

const root = process.argv[2];
if (!root) throw new Error("synthetic userData required");
const repo = new SqliteWorkspaceRepository(join(root, "workspaces/default/workspace.sqlite"));
const common = () => ({
  schemaVersion: 1 as const,
  requestId: randomUUID(),
  idempotencyKey: randomUUID(),
});
const actor = { actorId: "synthetic-human", origin: "human_ui" as const };
repo.commit(
  { ...common(), method: "workspace.create", payload: { name: "合成多步工具验收" } },
  actor,
);
repo.executeTrade(
  { ...common(), method: "scenario.save", payload: { expectedVersion: 0, scenario: demoScenario } },
  actor,
);
const staged = repo.executeTrade(
  {
    ...common(),
    method: "catalog.stage",
    payload: { csv: demoCatalogCsv, sourceName: "synthetic.csv", sourceStatus: "synthetic" },
  },
  actor,
);
if (!staged.ok || !staged.data.batches[0]) throw new Error("synthetic catalog");
const batch = staged.data.batches[0];
repo.executeTrade(
  {
    ...common(),
    method: "catalog.publish",
    payload: { batchId: batch.id, sourceHash: batch.sourceHash },
  },
  actor,
);
const text = "合成验收规则：付款必须明确；交期不得宣称全部合规。不是实际平台政策或法律意见。";
const knowledge = repo.executeKnowledge(
  {
    ...common(),
    method: "knowledge.stage",
    payload: {
      documentId: randomUUID(),
      expectedVersion: 0,
      title: "合成多步验收规则",
      scope: { platforms: [], markets: [], categories: [] },
      sourceStatus: "synthetic",
      sourceLabel: "合成多步规则原文",
      sourceText: text,
      location: { kind: "text", start: 0, end: text.length },
      rules: [
        {
          ruleId: randomUUID(),
          category: "commercial_terms",
          title: "付款",
          message: "付款条款为空，阻断保存",
          suggestedAction: "请补充实际付款要求",
          field: "payment",
          condition: { kind: "required" },
          failureSeverity: "block",
        },
        {
          ruleId: randomUUID(),
          category: "platform_guidance",
          title: "交期",
          message: "不可宣称全部合规",
          suggestedAction: "删除该承诺",
          field: "delivery",
          condition: { kind: "forbidden_literal", literal: "全部合规" },
          failureSeverity: "warning",
        },
      ],
    },
  },
  actor,
);
if (!knowledge.ok || knowledge.data.kind !== "revision") throw new Error("synthetic stage");
const revision = knowledge.data.revision;
const result = repo.executeKnowledge(
  {
    ...common(),
    method: "knowledge.publish",
    payload: { revisionId: revision.revisionId, sourceHash: revision.sourceHash },
  },
  actor,
);
if (!result.ok) throw new Error("synthetic publish");
repo.close();
process.stdout.write(
  JSON.stringify({ sourceRevisionId: revision.revisionId, sourceHash: revision.sourceHash }),
);
