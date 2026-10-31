import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { CatalogQuoteReadService } from "./catalog-quote-read-service";
import { runFixture } from "./testing/run-fixture";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanups.splice(0).reverse()) close();
});
it("keeps invalid native read-tool attempts as observations when Codex corrects arguments", async () => {
  const f = runFixture(cleanups);
  const service = new CatalogQuoteReadService(f.repo, undefined, undefined, {
    run: async (task) => {
      const tool = task.tools.find((tool) => tool.name === "search_catalog")!;
      await expect(tool.invoke({ injected: true }, task.cancellation)).rejects.toBeDefined();
      await tool.invoke({ query: "DEMO-TEE" }, task.cancellation);
      return { outcome: "completed", summary: "查到商品，未保存", toolCalls: 2 };
    },
  });
  const result = await service.execute(
    {
      schemaVersion: 1,
      requestId: randomUUID(),
      method: "agent.read",
      payload: { executionMode: "codex_harness", instruction: "查询商品", quoteRevisionIds: [] },
    },
    { key: "synthetic-read-key", model: "synthetic-model" },
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  expect(result.data.observations).toHaveLength(2);
  expect(result.data.observations.map((o) => o.result.ok)).toEqual([false, true]);
  expect(f.counts().quote_v1).toBe(0);
});
