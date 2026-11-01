import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const require = createRequire(resolve("apps/desktop/package.json"));
test("enterprise graph imports real CSV and explicit demo sources, supports manual publication and persists after reopen", async () => {
  const data = await mkdtemp(join(tmpdir(), "tq-enterprise-"));
  const launch = () =>
    electron.launch({
      executablePath: require("electron") as string,
      args: [resolve("apps/desktop/out/main/index.js")],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "", TRADEQUOTE_TEST_DATA: data },
    });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await page.evaluate(() =>
      window.tradequote.createWorkspace({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        method: "workspace.create",
        payload: { name: "合成企业知识验收" },
      }),
    );
    await page.getByRole("navigation").getByRole("link", { name: "知识图谱", exact: true }).click();
    await expect(page.locator(".kg-node")).toHaveCount(0);
    await page.locator("summary").filter({ hasText: "企业资料录入" }).click();
    await page.getByRole("button", { name: "添加合成演示企业资料" }).click();
    await expect(page.locator(".kg-node")).toHaveCount(12);
    await page.getByRole("button", { name: "导入项目商品 CSV" }).click();
    await expect(page.getByRole("status").filter({ hasText: /已导入：/ })).toBeVisible();
    const nodeCount = await page.locator(".kg-node").count();
    expect(nodeCount).toBeGreaterThan(170);
    await page.getByRole("button", { name: "导入项目商品 CSV" }).click();
    await expect(page.getByRole("status").filter({ hasText: /该内容已导入/ })).toBeVisible();
    await expect(page.locator(".kg-node")).toHaveCount(nodeCount);
    const overview = await page.evaluate(() =>
      window.tradequote.executeKnowledgeDesktop({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        method: "knowledge.overview",
        payload: {},
      }),
    );
    if (!overview.ok || overview.data.kind !== "knowledgeOverview") throw new Error("overview");
    const demo = overview.data.records.find((r) =>
      r.revision.content.title.includes("询盘处理流程"),
    )!;
    await page.getByLabel("知识版本", { exact: true }).selectOption(demo.revision.revisionId);
    await page.getByRole("checkbox", { name: /我已核对原文/ }).check();
    await page.getByRole("button", { name: "确认内容并创建审核版本" }).click();
    await expect(page.getByRole("status").filter({ hasText: /已创建人工确认版本/ })).toBeVisible();
    await page.getByRole("button", { name: "检查知识", exact: true }).click();
    await expect.poll(() => page.getByRole("status").allTextContents()).toContain("检查：passed");
    await page.getByRole("button", { name: "批准此版本" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "审核批准，尚未发布。" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "发布知识", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "知识已发布" })).toBeVisible();
    await page.locator("summary").filter({ hasText: "企业资料录入" }).click();
    await page.getByLabel("搜索知识节点").fill("1601053415993");
    await expect(page.getByRole("button", { name: /^1601053415993/ })).toBeVisible();
    await page.getByRole("button", { name: /^1601053415993/ }).click();
    await expect(page.locator(".kg-details pre")).toContainText("待审核");
    await page.getByRole("button", { name: "放大图谱" }).click();
    await expect(page.locator(".kg-legend")).toContainText("120%");
    await page.getByRole("button", { name: "重置视图" }).click();
    await page.screenshot({ path: ".runtime/c14/enterprise-graph.png" });
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.getByRole("navigation").getByRole("link", { name: "知识图谱", exact: true }).click();
    await expect(page.locator(".kg-node")).toHaveCount(nodeCount + 2);
    await page.getByLabel("图谱范围").selectOption("published");
    await expect(page.locator(".kg-node")).toHaveCount(2);
  } finally {
    await app.close();
    await rm(data, { recursive: true, force: true });
  }
});
