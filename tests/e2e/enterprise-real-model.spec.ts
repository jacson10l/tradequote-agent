import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { demoScenario } from "../../packages/contracts/src/trade";

const require = createRequire(resolve("apps/desktop/package.json"));
test("opt-in actual saved model organizes enterprise source and quotes with published Wiki evidence", async () => {
  test.skip(
    process.env.TRADEQUOTE_LIVE_KNOWLEDGE !== "1",
    "Explicit opt-in required for paid real model calls",
  );
  test.setTimeout(240000);
  const data = resolve(`.runtime/c14/live-${Date.now()}`);
  await mkdir(data, { recursive: true });
  const app = await electron.launch({
    executablePath: require("electron") as string,
    args: [resolve("tests/fixtures/rehearsal-host.cjs")],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "",
      ELECTRON_RENDERER_URL: "",
      TRADEQUOTE_TEST_DATA: "",
      TRADEQUOTE_TEST_MODEL_URL: "",
      TRADEQUOTE_REHEARSAL_DATA: data,
    },
  });
  try {
    const page = await app.firstWindow();
    const model = await page.evaluate(() =>
      window.tradequote.modelSettings({ method: "model.status" }),
    );
    expect(
      model.ok && model.data.hasKey,
      "Saved model configuration required; no credential extraction",
    ).toBe(true);
    await page.evaluate(() =>
      window.tradequote.createWorkspace({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        method: "workspace.create",
        payload: { name: "真实模型-合成企业资料验收" },
      }),
    );
    await page.getByRole("navigation").getByRole("link", { name: "知识图谱", exact: true }).click();
    await page.locator("summary").filter({ hasText: "企业资料录入" }).click();
    await page.getByLabel("资料名称", { exact: true }).fill("合成演示付款禁词政策");
    await page
      .getByLabel("原文", { exact: true })
      .fill(
        "内部演示检查规则：若付款内容包含连续字面量 FREE，则产生 block 级问题。其他付款文本不因此规则阻断。此为合成演示资料，不代表真实公司政策。",
      );
    await page.getByRole("checkbox", { name: "这是合成演示资料" }).check();
    await page.getByRole("button", { name: "保存来源", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "原文已保存" })).toBeVisible();
    await page.getByLabel("知识类型").selectOption("rule");
    await page.getByRole("button", { name: "LLM 整理为候选" }).click();
    await expect(page.getByRole("status").filter({ hasText: "模型候选已保存" })).toBeVisible({
      timeout: 60000,
    });
    await page.getByRole("checkbox", { name: /我已核对原文/ }).check();
    await page.getByRole("button", { name: "确认内容并创建审核版本" }).click();
    await expect(page.getByRole("status").filter({ hasText: "已创建人工确认版本" })).toBeVisible();
    await page.getByRole("button", { name: "检查知识", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "检查：passed" })).toBeVisible();
    await page.getByRole("button", { name: "批准此版本" }).click();
    await expect(page.getByRole("status").filter({ hasText: "审核批准" })).toBeVisible();
    await page.getByRole("button", { name: "发布知识", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "知识已发布" })).toBeVisible();
    const csv = await readFile(resolve("docs/roadshow/c07/catalog.csv"), "utf8");
    const setup = await page.evaluate(
      async ({ csv, scenario }) => {
        const common = () => ({
          schemaVersion: 1 as const,
          requestId: crypto.randomUUID(),
          idempotencyKey: crypto.randomUUID(),
        });
        const config = await window.tradequote.saveScenario({
          ...common(),
          method: "scenario.save",
          payload: { expectedVersion: 0, scenario: { ...scenario, locales: ["en"] } },
        });
        const staged = await window.tradequote.stageCatalog({
          ...common(),
          method: "catalog.stage",
          payload: { sourceName: "已授权项目目录-验收副本", sourceStatus: "user_provided", csv },
        });
        if (!config.ok || !staged.ok) throw new Error("catalog/scenario failed");
        const batch = staged.data.batches[0]!;
        const published = await window.tradequote.publishCatalog({
          ...common(),
          method: "catalog.publish",
          payload: { batchId: batch.id, sourceHash: batch.sourceHash },
        });
        if (!published.ok) throw new Error("catalog publish failed");
        return config.data.scenario!.id;
      },
      { csv, scenario: demoScenario },
    );
    const quote = await page.evaluate(
      async (scenarioId) =>
        window.tradequote.understandInquiry({
          schemaVersion: 1,
          requestId: crypto.randomUUID(),
          idempotencyKey: crypto.randomUUID(),
          method: "agent.understand",
          payload: {
            executionMode: "tool_loop",
            scenarioId,
            buyer: "合成验收采购方",
            inquiry:
              "内部演示核价，非真实订单：SKU 1601053415993，300件piece，使用CNY目录价格；拟议付款T/T，拟议交期30 days，仍待确认。请查询商品、确定性核价、调用search_knowledge检索已发布企业知识、validate_quote检查并保存未审核草稿。未知运费税费保持未知。不要将认证或供应商描述当作核实事实。",
          },
        }),
      setup,
    );
    expect(quote.ok, JSON.stringify(quote.ok ? {} : quote.error)).toBe(true);
    if (!quote.ok) throw new Error("quote failed");
    const saved = quote.data.quotes[0]!;
    expect(saved.goodsTotal).toBe("11763.00");
    const checks = await page.evaluate(
      (id) =>
        window.tradequote.getQuoteChecks({
          schemaVersion: 1,
          requestId: crypto.randomUUID(),
          method: "quote.getChecks",
          payload: { revisionId: id },
        }),
      saved.id,
    );
    expect(checks.ok).toBe(true);
    if (!checks.ok) throw new Error("checks");
    const cited = checks.data.find((r) => (r.wikiCitations?.length ?? 0) > 0);
    expect(cited).toBeTruthy();
    expect(cited!.wikiCitations![0]!.sourceRefs.length).toBeGreaterThan(0);
    await page.screenshot({ path: resolve(".runtime/c14/real-model-enterprise.png") });
    await writeFile(
      resolve(".runtime/c14/real-model-result.json"),
      JSON.stringify(
        {
          status: "passed",
          model: model.ok ? model.data.model : null,
          dataDirectory: data,
          knowledgeCitations: cited!.wikiCitations!.length,
          sourceReferences: cited!.wikiCitations![0]!.sourceRefs.length,
          goodsTotal: saved.goodsTotal,
          quantity: saved.lines[0]?.quantity,
          quoteRevisionId: saved.id,
          reportId: cited!.reportId,
          checks: [
            {
              command:
                "opt-in real DeepSeek source organization + human UI review/publish + quote tools",
              exitCode: 0,
            },
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
});
