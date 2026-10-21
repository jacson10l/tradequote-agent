import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  demoCatalogCsv,
  demoScenario,
  type Product,
  type TradeResult,
} from "@tradequote/contracts";
import { SqliteWorkspaceRepository } from "@tradequote/infrastructure";

export const envelope = () => ({
  schemaVersion: 1 as const,
  requestId: randomUUID(),
  idempotencyKey: randomUUID(),
});
const human = { actorId: "synthetic-evaluator", origin: "human_ui" as const };
export function board(result: TradeResult) {
  if (!result.ok) throw new Error("Synthetic evaluation setup failed");
  return result.data;
}
export function evaluationWorkspace(sku: string) {
  const directory = mkdtempSync(join(tmpdir(), "tradequote-c04-synthetic-"));
  const repo = new SqliteWorkspaceRepository(join(directory, "evaluation.sqlite"));
  try {
    repo.commit(
      { ...envelope(), method: "workspace.create", payload: { name: "C04 synthetic evaluation" } },
      human,
    );
    const scenario = board(
      repo.executeTrade(
        {
          ...envelope(),
          method: "scenario.save",
          payload: {
            expectedVersion: 0,
            scenario: {
              ...demoScenario,
              name: "C04 synthetic",
              market: "Synthetic market",
              platform: "Synthetic RFQ",
            },
          },
        },
        human,
      ),
    ).scenario;
    const batch = board(
      repo.executeTrade(
        {
          ...envelope(),
          method: "catalog.stage",
          payload: {
            csv: demoCatalogCsv,
            sourceName: "c04-synthetic.csv",
            sourceStatus: "synthetic",
          },
        },
        human,
      ),
    ).batches[0];
    if (!scenario || !batch) throw new Error("Synthetic evaluation setup failed");
    const product = board(
      repo.executeTrade(
        {
          ...envelope(),
          method: "catalog.publish",
          payload: {
            batchId: batch.id,
            sourceHash: batch.sourceHash,
          },
        },
        human,
      ),
    ).products.find((p: Product) => p.sku === sku);
    if (!product) throw new Error("Synthetic evaluation setup failed");
    const sourceText =
      "Synthetic evaluation policy only: payment is required; delivery must not contain FORBIDDEN. Not an actual platform rule.";
    const staged = repo.executeKnowledge(
      {
        ...envelope(),
        method: "knowledge.stage",
        payload: {
          documentId: randomUUID(),
          expectedVersion: 0,
          title: "Synthetic evaluation rules",
          scope: {
            platforms: [scenario.platform],
            markets: [scenario.market],
            categories: [product.category],
          },
          sourceStatus: "synthetic",
          sourceLabel: "C04 synthetic policy",
          sourceText,
          location: { kind: "text", start: 0, end: sourceText.length },
          rules: [
            {
              ruleId: randomUUID(),
              category: "commercial_terms",
              title: "Payment",
              message: "Synthetic payment missing",
              suggestedAction: "Ask the synthetic buyer",
              field: "payment",
              condition: { kind: "required" },
              failureSeverity: "block",
            },
            {
              ruleId: randomUUID(),
              category: "platform_guidance",
              title: "Delivery",
              message: "Synthetic forbidden claim",
              suggestedAction: "Remove the synthetic claim",
              field: "delivery",
              condition: { kind: "forbidden_literal", literal: "FORBIDDEN" },
              failureSeverity: "block",
            },
          ],
        },
      },
      human,
    );
    if (!staged.ok || staged.data.kind !== "revision")
      throw new Error("Synthetic rule setup failed");
    const source = staged.data.revision;
    const published = repo.executeKnowledge(
      {
        ...envelope(),
        method: "knowledge.publish",
        payload: {
          revisionId: source.revisionId,
          sourceHash: source.sourceHash,
        },
      },
      human,
    );
    if (!published.ok) throw new Error("Synthetic rule setup failed");
    return {
      repo,
      scenario,
      product,
      source,
      close() {
        repo.close();
        rmSync(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    repo.close();
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}
