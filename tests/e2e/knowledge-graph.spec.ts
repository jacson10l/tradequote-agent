import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const require = createRequire(resolve("apps/desktop/package.json"));
test("native knowledge graph shows real wiki links, search, selection, zoom and honest empty business state", async () => {
  const data = await mkdtemp(join(tmpdir(), "tq-graph-"));
  const app = await electron.launch({
    executablePath: require("electron") as string,
    args: [resolve("apps/desktop/out/main/index.js")],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "", TRADEQUOTE_TEST_DATA: data },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole("navigation").getByRole("link", { name: "知识图谱", exact: true }).click();
    await expect(page.getByRole("img", { name: "可交互知识关系网络" })).toBeVisible();
    await expect(page.locator(".kg-node")).not.toHaveCount(0);
    await page.getByLabel("搜索知识节点").fill("系统架构");
    await page.getByRole("button", { name: /^系统架构/ }).click();
    await expect(page.getByRole("heading", { name: "系统架构", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "放大图谱" }).click();
    await expect(page.locator(".kg-legend")).toContainText("120%");
    await page.getByRole("button", { name: "重置视图" }).click();
    await expect(page.getByLabel("搜索知识节点")).toHaveValue("");
    await page.screenshot({ path: ".runtime/c15/knowledge-graph.png" });
    await page.getByLabel("图谱范围").selectOption("business");
    await expect(page.locator(".kg-node")).toHaveCount(0);
    await expect(page.getByText(/显示最近 30 个报价版本/)).toBeVisible();
  } finally {
    await app.close();
    await rm(data, { recursive: true, force: true });
  }
});
