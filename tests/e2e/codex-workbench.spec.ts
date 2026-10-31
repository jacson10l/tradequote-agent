import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { fillCatalogFixture, saveBusinessScenario } from "./business-fixture";

const require = createRequire(resolve("apps/desktop/package.json"));
test("real Codex completes a business goal from the Electron workbench, revises 500, queries and cancels", async () => {
  test.skip(
    process.env.TRADEQUOTE_VERIFY_CODEX !== "1",
    "Explicit live opt-in; uses saved desktop model settings with isolated business data.",
  );
  test.setTimeout(360000);
  const data = await mkdtemp(resolve(".runtime/tq-native-workbench-"));
  const launch = () =>
    electron.launch({
      executablePath: require("electron") as string,
      args: [resolve("tests/fixtures/codex-provider-host.cjs")],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "",
        TRADEQUOTE_REHEARSAL_DATA: join(data, "data"),
      },
    });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    const status = await page.evaluate(() =>
      window.tradequote.modelSettings({ method: "model.status" }),
    );
    if (!status.ok || !status.data.hasKey) throw Error("saved model configuration required");
    await page.getByRole("link", { name: "创建工作区", exact: true }).click();
    await page.getByLabel("工作区名称").fill("Codex真实工作台合成验收");
    await page.getByRole("button", { name: "创建工作区", exact: true }).click();
    await page.getByRole("link", { name: "资料与报价", exact: true }).click();
    await saveBusinessScenario(page);
    await fillCatalogFixture(page);
    await page.getByRole("button", { name: "解析并预览" }).click();
    await page.getByRole("button", { name: "确认发布此批次" }).click();
    await page.getByRole("link", { name: "进入工作台处理业务" }).click();
    await page.getByLabel("本次询盘客户").fill("合成买方");
    await page
      .getByLabel("业务目标或补充说明")
      .fill(
        "根据询盘帮我报价并保存未审核草稿：DEMO-TEE 100 piece，付款与交期未提供，留空待确认，不要编造。调用业务工具核价。",
      );
    await page.getByRole("button", { name: "发送" }).click();
    await expect(page.getByTestId("goods-total")).toHaveText("900.00 USD", { timeout: 150000 });
    await expect(page.getByRole("article", { name: "已保存报价详情" })).toContainText(
      "付款条款待确认",
    );
    await page
      .getByLabel("业务目标或补充说明")
      .fill("数量改为500 piece，比较变化，保留付款与交期为空待确认并保存新版本。");
    await page.getByRole("button", { name: "发送" }).click();
    await expect(page.getByTestId("goods-total")).toHaveText("4500.00 USD", { timeout: 150000 });
    await expect(page.getByRole("region", { name: "报价版本差异" })).toContainText("500");
    await expect(page.getByRole("region", { name: "报价版本差异" })).toContainText("100");
    const runs = await page.evaluate(() =>
      window.tradequote.listAgentRuns({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        method: "agent.list",
        payload: { limit: 20 },
      }),
    );
    expect(runs.ok).toBe(true);
    if (!runs.ok) throw new Error("run list");
    expect(
      runs.data.runs.every((run) => run.command.payload.executionMode === "codex_harness"),
    ).toBe(true);
    expect(
      runs.data.runs.every((run) => run.toolSteps?.some((step) => step.tool === "calculate_quote")),
    ).toBe(true);
    await page.screenshot({ path: ".runtime/codex-workbench-real.png", fullPage: true });
    const beforeRead = await page.evaluate(() => window.tradequote.getTrade());
    expect(beforeRead.ok).toBe(true);
    await page.getByLabel("仅查询与试算，不保存报价").check();
    const readInstruction =
      "查询DEMO-TEE价格来源并试算120 piece，只查询，不保存任何报价。使用业务工具查商品并核价后总结。";
    await page.getByLabel("业务目标或补充说明").fill(readInstruction);
    await page.getByRole("button", { name: "发送" }).click();
    const readTurn = page.locator(".conversation-turn").filter({ hasText: readInstruction });
    await expect(readTurn.getByRole("article", { name: "助手回复" })).toContainText("1080.00 USD", {
      timeout: 150000,
    });
    await expect(readTurn.getByText("已完成", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.tradequote.getTrade())).toEqual(beforeRead);
    await page.getByLabel("仅查询与试算，不保存报价").uncheck();
    await page.getByLabel("业务目标或补充说明").fill("数量改为600 piece，保存新版本");
    await page.getByRole("button", { name: "发送" }).click();
    const active = page.locator(".conversation-turn").filter({ hasText: "数量改为600 piece" });
    await active.getByRole("button", { name: "停止" }).click();
    await expect(active).toContainText("已取消");
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await expect(page.getByTestId("goods-total")).toHaveText("4500.00 USD");
    const board = await page.evaluate(() => window.tradequote.getTrade());
    expect(board.ok && board.data.quotes.length).toBe(2);
    await page.getByRole("link", { name: "资料与报价", exact: true }).click();
    await page.getByRole("link", { name: "在工作台继续处理此报价" }).click();
    await expect(page.getByRole("complementary", { name: "工作台任务对话" })).toBeVisible();
  } finally {
    await app.close();
    await rm(data, { recursive: true, force: true });
  }
});
