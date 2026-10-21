import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const require = createRequire(resolve("apps/desktop/package.json"));
test("development renderer runs with React refresh and the real desktop bridge", async () => {
  const data = await mkdtemp(join(tmpdir(), "tradequote-dev-e2e-"));
  const app = await electron.launch({
    executablePath: require("electron") as string,
    args: [resolve("apps/desktop/out/main/index.js")],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "",
      TRADEQUOTE_TEST_DATA: data,
      ELECTRON_RENDERER_URL: "http://127.0.0.1:5179/",
    },
  });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole("heading", { name: "从一份询盘开始" })).toBeVisible();
    await page.getByRole("link", { name: "创建工作区", exact: true }).click();
    await page.getByLabel("工作区名称").fill("开发模式合成工作区");
    await page.getByRole("button", { name: "创建工作区", exact: true }).click();
    await expect(page.getByText("已保存至本机 · 版本 1")).toBeVisible();
  } finally {
    await app.close();
    await rm(data, { recursive: true, force: true });
  }
});
test("real desktop persists workspace, validates IPC, handles conflict and reopens", async () => {
  const data = await mkdtemp(join(tmpdir(), "tradequote-e2e-"));
  const launch = () =>
    electron.launch({
      executablePath: require("electron") as string,
      args: [resolve("apps/desktop/out/main/index.js")],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "", TRADEQUOTE_TEST_DATA: data },
    });
  let app = await launch();
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole("heading", { name: "从一份询盘开始" })).toBeVisible();
    await page.getByRole("link", { name: "创建工作区", exact: true }).click();
    const name = page.getByLabel("工作区名称");
    await name.fill("E2E 合成工作区");
    await page.getByRole("button", { name: "创建工作区", exact: true }).click();
    await expect(page.getByText("已保存至本机 · 版本 1")).toBeVisible();
    await name.focus();
    await expect(name).toBeFocused();
    expect(
      await page.evaluate(() => ({
        bridge: Object.keys(window.tradequote).sort(),
        node: typeof Reflect.get(window, "require"),
      })),
    ).toEqual({
      bridge: ["createWorkspace", "getWorkspace", "renameWorkspace"],
      node: "undefined",
    });
    // Exercise the same public bridge from a second operation while the form is stale.
    const external = await page.evaluate(async () =>
      window.tradequote.renameWorkspace({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        method: "workspace.rename",
        payload: { name: "已由另一操作更新", expectedVersion: 1 },
      }),
    );
    expect(external.ok).toBe(true);
    await name.fill("不应覆盖");
    await page.getByRole("button", { name: "保存工作区" }).click();
    await expect(page.getByRole("alert")).toContainText("工作区已更新");
    await page.getByRole("button", { name: "重新加载最新版本" }).click();
    await expect(name).toHaveValue("已由另一操作更新");
    const invalid = await page.evaluate(async () => {
      const call = window.tradequote.renameWorkspace as (
        value: unknown,
      ) => Promise<{ ok: boolean }>;
      return call({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        method: "workspace.rename",
        payload: { name: "invalid", expectedVersion: 2, total: "0" },
      });
    });
    expect(invalid.ok).toBe(false);
    await page.getByRole("link", { name: "单据工作台" }).click();
    await page.getByRole("button", { name: "查看合成样例" }).click();
    await expect(page.getByRole("button", { name: "提交人工审核" })).toBeDisabled();
    await page.screenshot({ path: "output/playwright/m1-workbench.png", fullPage: true });
    await page.setViewportSize({ width: 900, height: 800 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await app.close();
    app = await launch();
    const reopened = await app.firstWindow();
    await reopened.getByRole("link", { name: "工作区设置" }).click();
    await expect(reopened.getByLabel("工作区名称")).toHaveValue("已由另一操作更新");
    await expect(reopened.getByText("已保存至本机 · 版本 2")).toBeVisible();
  } finally {
    await app.close();
    await rm(data, { recursive: true, force: true });
  }
});
