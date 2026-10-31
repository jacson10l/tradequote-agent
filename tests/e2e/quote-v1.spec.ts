import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { saveBusinessScenario } from "./business-fixture";

const demoCatalogCsv =
  "sku,name,category,unit,currency,min_quantity,unit_price,valid_until,description\nDEMO-TEE,桌面测试上衣,合成服装,piece,USD,1,10,2099-12-31,脱敏合成样本\nDEMO-TEE,桌面测试上衣,合成服装,piece,USD,100,9,2099-12-31,脱敏合成样本";

const require = createRequire(resolve("apps/desktop/package.json"));
test("real desktop imports CSV with confirmation, saves deterministic V1 and reopens frozen evidence", async () => {
  const data = await mkdtemp(join(tmpdir(), "tradequote-v1-e2e-"));
  const fixture = join(data, "合成 商品.csv");
  await writeFile(fixture, demoCatalogCsv);
  const launch = () =>
    electron.launch({
      executablePath: require("electron") as string,
      args: [resolve("apps/desktop/out/main/index.js")],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "", TRADEQUOTE_TEST_DATA: data },
    });
  let app = await launch();
  try {
    const page = await app.firstWindow();
    await page.getByRole("link", { name: "创建工作区", exact: true }).click();
    await page.getByLabel("工作区名称").fill("报价 V1 合成演示");
    await page.getByRole("button", { name: "创建工作区", exact: true }).click();
    await expect(page.getByText("已保存至本机 · 版本 1")).toBeVisible();
    await page.getByRole("link", { name: "资料与报价" }).click();
    await saveBusinessScenario(page);
    await expect(page.getByText("场景版本 1", { exact: true })).toBeVisible();
    // Substitute only the OS picker interaction; main still reads/validates an actual UTF-8 file.
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, fixture);
    await page.getByRole("button", { name: "选择 CSV 文件" }).click();
    await expect(page.getByLabel("资料名称")).toHaveValue("合成 商品.csv");
    await expect(page.getByLabel("CSV 原文")).toHaveValue(demoCatalogCsv);
    await page.getByLabel("资料性质").selectOption("synthetic");
    await page.getByRole("button", { name: "解析并预览" }).click();
    await expect(page.getByRole("table", { name: "CSV 导入预览" })).toContainText("DEMO-TEE");
    await expect(page.getByRole("button", { name: "确认发布此批次" })).toBeEnabled();
    await page.getByRole("button", { name: "确认发布此批次" }).click();
    const published = await page.evaluate(() => window.tradequote.getTrade());
    expect(published.ok && published.data.products.length).toBe(1);
    // Reimporting an older identical source selects that exact batch, not a newer invalid preview.
    await page.getByLabel("CSV 原文").fill("sku,name\nBROKEN,missing columns");
    await page.getByRole("button", { name: "解析并预览" }).click();
    await expect(page.getByRole("alert")).toContainText("列名须完整且唯一");
    await page.getByRole("button", { name: "选择 CSV 文件" }).click();
    await page.getByLabel("资料性质").selectOption("synthetic");
    await page.getByRole("button", { name: "解析并预览" }).click();
    await expect(page.getByRole("table", { name: "CSV 导入预览" })).toContainText("DEMO-TEE");
    await expect(page.getByRole("button", { name: "确认发布此批次" })).toBeDisabled();
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "单据工作台", exact: true })
      .click();
    await page.getByText("手工填写报价", { exact: true }).click();
    await page.getByLabel("客户名称").fill("合成海外买家");
    await page.getByLabel("原始询盘").fill("请提供100件上衣报价，包装和运费待确认。");
    await page.getByRole("checkbox", { name: "选择 DEMO-TEE", exact: true }).check();
    await page.getByRole("textbox", { name: "DEMO-TEE 数量", exact: true }).fill("100");
    await page.getByRole("button", { name: "计算并保存报价 V1" }).click();
    await expect(page.getByTestId("goods-total")).toHaveText("900.00 USD");
    await expect(page.getByRole("article", { name: "已保存报价详情" })).toContainText(
      "付款条款待确认",
    );
    await expect(page.getByRole("article", { name: "已保存报价详情" })).toContainText("原文行 3");
    await expect(page.getByRole("button", { name: "提交人工审核" })).toBeDisabled();
    await page.getByRole("button", { name: "计算并保存报价 V1" }).click();

    const count = await page.evaluate(async () => {
      const result = await window.tradequote.getTrade();
      return result.ok ? result.data.quotes.length : -1;
    });
    expect(count).toBe(1);
    const injection = await page.evaluate(async () => {
      const result = await window.tradequote.getTrade();
      if (!result.ok || !result.data.scenario || !result.data.products[0]) return true;
      const invoke = window.tradequote.createQuoteV1 as (
        input: unknown,
      ) => Promise<{ ok: boolean }>;
      return (
        await invoke({
          schemaVersion: 1,
          requestId: crypto.randomUUID(),
          idempotencyKey: crypto.randomUUID(),
          method: "quote.createV1",
          payload: {
            scenarioId: result.data.scenario.id,
            buyer: "invalid",
            inquiry: "invalid",
            payment: "",
            delivery: "",
            lines: [
              {
                productId: result.data.products[0].id,
                quantity: "1",
                unit: result.data.products[0].unit,
              },
            ],
            goodsTotal: "0",
          },
        })
      ).ok;
    });
    expect(injection).toBe(false);
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "资料与报价", exact: true })
      .click();
    await page.getByLabel("目标市场").fill("其他演示市场");
    await saveBusinessScenario(page);
    await expect(page.getByText("场景版本 2", { exact: true })).toBeVisible();
    await expect(page.getByRole("article", { name: "已保存报价详情" })).toContainText(
      "德国（演示市场）",
    );
    await page.getByRole("article", { name: "已保存报价详情" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: ".runtime/quote-v1-saved.png" });
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setContentSize(900, 640);
    });
    await page.getByRole("button", { name: "提交人工审核" }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("link", { name: "资料与报价" })).toBeInViewport();
    await page.screenshot({ path: ".runtime/quote-v1-narrow.png" });
    await app.close();
    app = await launch();
    const reopened = await app.firstWindow();
    await reopened.getByRole("link", { name: "资料与报价" }).click();
    await expect(reopened.getByTestId("goods-total")).toHaveText("900.00 USD");
    await expect(reopened.getByLabel("目标市场")).toHaveValue("其他演示市场");
    await expect(reopened.getByRole("article", { name: "已保存报价详情" })).toContainText(
      "德国（演示市场）",
    );
    await reopened.getByRole("button", { name: "确认发布此批次" }).scrollIntoViewIfNeeded();
    await expect(reopened.getByRole("button", { name: "确认发布此批次" })).toBeDisabled();
  } finally {
    await app.close();
    await rm(data, { recursive: true, force: true });
  }
});
