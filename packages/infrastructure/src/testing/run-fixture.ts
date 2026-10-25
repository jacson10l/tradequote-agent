import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  demoCatalogCsv,
  demoScenario,
  type TradeResult,
  type Understanding,
} from "@tradequote/contracts";
import Database from "better-sqlite3";
import type { RunTicket } from "../agent-run-store";
import { SqliteWorkspaceRepository } from "../index";
export const common = () => ({
  schemaVersion: 1 as const,
  requestId: randomUUID(),
  idempotencyKey: randomUUID(),
});
const context = { actorId: "synthetic-user", origin: "human_ui" as const };
export function data(result: TradeResult) {
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}
export function runFixture(
  cleanups: (() => void)[],
  options: { category?: string; sku?: string } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), "tradequote-run-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, "workspace.sqlite");
  let repo = new SqliteWorkspaceRepository(file);
  cleanups.push(() => repo.close());
  repo.commit(
    { ...common(), method: "workspace.create", payload: { name: "合成恢复测试" } },
    context,
  );
  const scenario = data(
    repo.executeTrade(
      {
        ...common(),
        method: "scenario.save",
        payload: {
          expectedVersion: 0,
          scenario: { ...demoScenario, category: options.category ?? demoScenario.category },
        },
      },
      context,
    ),
  ).scenario;
  const batch = data(
    repo.executeTrade(
      {
        ...common(),
        method: "catalog.stage",
        payload: { csv: demoCatalogCsv, sourceName: "synthetic.csv", sourceStatus: "synthetic" },
      },
      context,
    ),
  ).batches[0];
  if (!scenario || !batch) throw new Error("fixture");
  const product = data(
    repo.executeTrade(
      {
        ...common(),
        method: "catalog.publish",
        payload: { batchId: batch.id, sourceHash: batch.sourceHash },
      },
      context,
    ),
  ).products.find((p) => p.sku === (options.sku ?? "DEMO-TEE"));
  if (!product) throw new Error("fixture");
  const db = new Database(file);
  cleanups.push(() => db.close());
  const start = () => ({
    ...common(),
    method: "agent.start" as const,
    payload: {
      method: "agent.understand" as const,
      payload: { scenarioId: scenario.id, buyer: "合成买方", inquiry: "100件" },
    },
  });
  const proposal: Understanding = {
    lines: [{ productId: product.id, quantity: "100", unit: product.unit }],
    payment: "",
    delivery: "",
    summary: "合成建议",
  };
  const control = (runId: string, method: "agent.cancel" | "agent.retry") => ({
    ...common(),
    method,
    payload: { runId },
  });
  const counts = () =>
    Object.fromEntries(
      [
        "quote_v1",
        "quote_revision",
        "agent_turn",
        "idempotency",
        "outbox",
        "agent_run_control",
      ].map((table) => [
        table,
        (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n,
      ]),
    );
  return {
    file,
    db,
    start,
    proposal,
    control,
    counts,
    product,
    scenario,
    get repo() {
      return repo;
    },
    get store() {
      return repo.runStore();
    },
    reopen() {
      repo.close();
      repo = new SqliteWorkspaceRepository(file);
    },
    claim(runId: string, attempt = 1): RunTicket {
      const ticket = repo.runStore().claim(runId, attempt, randomUUID()).ticket;
      if (!ticket) throw new Error("claim");
      return ticket;
    },
  };
}
