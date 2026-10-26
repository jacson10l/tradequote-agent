// Offline synthetic fixture/inspection only. No production IPC route imports this file.
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import Database from "better-sqlite3";
import { SqliteWorkspaceRepository } from "../../packages/infrastructure/src/index";
import {
  createSyntheticQuote,
  seedPublished,
} from "../../packages/infrastructure/src/wiki-test.fixture";

const [directory, action] = process.argv.slice(2);
if (!directory || !action) throw Error("fixture arguments required");
const file = join(directory, "workspaces", "default", "workspace.sqlite");
const envelope = () => ({
  schemaVersion: 1 as const,
  requestId: randomUUID(),
  idempotencyKey: randomUUID(),
});
const context = { actorId: "synthetic-fixture-user", origin: "human_ui" as const };
async function main() {
  if (action === "inspect") {
    const db = new Database(file, { readonly: true });
    try {
      const tables = [
        "quote_v1",
        "quote_revision",
        "quote_check_report",
        "knowledge_consumption",
        "agent_turn",
        "outbox",
        "idempotency",
      ];
      const rows = Object.fromEntries(
        tables.map((table) => [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]),
      );
      console.log(JSON.stringify({ rows }));
    } finally {
      db.close();
    }
    return;
  }
  // Only invoke writes while the desktop is closed; this helper is not a second live writer.
  const repo = new SqliteWorkspaceRepository(file);
  try {
    if (!repo.read()) {
      repo.commit(
        { ...envelope(), method: "workspace.create", payload: { name: "合成桌面检查" } },
        context,
      );
      createSyntheticQuote(repo);
    }
    if (action === "seed") {
      const seeded = await seedPublished(file, repo, repo.read()!.id, {
        locale: "en",
        kind: "rule",
        rules: [
          {
            ruleId: randomUUID(),
            category: "commercial_terms",
            title: "合成付款必填",
            field: "payment",
            condition: { kind: "required" },
            failureSeverity: "block",
            message: "合成付款条款缺失",
            suggestedAction: "请人工补齐付款条款",
          },
          {
            ruleId: randomUUID(),
            category: "platform_guidance",
            title: "合成交期必填",
            field: "delivery",
            condition: { kind: "required" },
            failureSeverity: "warning",
            message: "合成交期需要确认",
            suggestedAction: "请人工核实交期",
          },
        ],
      });
      console.log(
        JSON.stringify({
          revisionId: seeded.revision.revisionId,
          sources: seeded.sources.map((s) => s.sourceRevisionId),
        }),
      );
    } else if (action === "revise") {
      const board = repo.executeTrade(
        { schemaVersion: 1, requestId: randomUUID(), method: "trade.get" },
        context,
      );
      if (!board.ok || !board.data.quotes[0]) throw Error("synthetic quote missing");
      const quote = board.data.quotes[0];
      const result = repo.commitAgent(
        {
          ...envelope(),
          method: "agent.revise",
          payload: {
            baseId: quote.id,
            expectedVersion: quote.version,
            instruction: "合成条款修订，无模型请求",
          },
        },
        {
          patches: [
            { op: "setPayment", value: "30%预付" },
            { op: "setDelivery", value: "确认后30天交货" },
          ],
          summary: "合成 fixture 修订",
        },
        "synthetic-no-model",
      );
      if (!result.ok) throw Error(result.error.message);
      console.log(JSON.stringify({ quote: result.data.quotes[0] }));
    } else {
      const db = new Database(file);
      try {
        if (action === "fail")
          db.exec(
            "CREATE TRIGGER synthetic_check_failure BEFORE INSERT ON knowledge_consumption BEGIN SELECT RAISE(ABORT,'synthetic-private-consumption'); END",
          );
        else if (action === "repair") db.exec("DROP TRIGGER synthetic_check_failure");
        else if (action === "withdraw-source")
          db.exec(
            "UPDATE knowledge_source SET state='withdrawn',lifecycle_version=lifecycle_version+1 WHERE source_revision_id=(SELECT source_revision_id FROM knowledge_source ORDER BY rowid LIMIT 1)",
          );
        else throw Error("unknown fixture action");
        console.log(JSON.stringify({ action }));
      } finally {
        db.close();
      }
    }
  } finally {
    repo.close();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
