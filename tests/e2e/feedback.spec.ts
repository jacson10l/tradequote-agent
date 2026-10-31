import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const require = createRequire(resolve("apps/desktop/package.json"));
test("desktop feedback floats above content and recovers through the notification action", async () => {
  const data = await mkdtemp(join(tmpdir(), "tradequote-feedback-"));
  const app = await electron.launch({
    executablePath: require("electron") as string,
    args: [resolve("apps/desktop/out/main/index.js")],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "", TRADEQUOTE_TEST_DATA: data },
  });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole("heading", { name: "从一份询盘开始" })).toBeVisible();
    const before = await page.locator(".workbench-grid").boundingBox();
    // Synthetic failure through the real preload/IPC; this does not diagnose the screenshot's cause.
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("workspace.get");
      ipcMain.handle("workspace.get", () => ({
        ok: false,
        error: {
          code: "ACTION_NOT_ALLOWED",
          message: "调用来源不允许",
          retryable: false,
          issues: [],
        },
      }));
    });
    await page.reload();
    const notice = page.getByRole("complementary", { name: "工作台读取失败" });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("调用来源不允许");
    expect(await page.locator(".workbench-grid").boundingBox()).toEqual(before);
    await page.screenshot({ path: ".runtime/feedback-notification.png" });
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setContentSize(800, 640);
      BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1.5);
    });
    await expect(notice).toBeInViewport();
    await expect(notice.getByRole("button", { name: "重新加载" })).toBeInViewport();
    expect(
      await notice.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.left >= 0 &&
          rect.top >= 0 &&
          rect.right <= window.innerWidth &&
          rect.bottom <= window.innerHeight
        );
      }),
    ).toBe(true);
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("workspace.get");
      ipcMain.handle("workspace.get", () => ({
        ok: true,
        data: null,
        warnings: [],
        evidenceIds: [],
      }));
      ipcMain.removeHandler("workspace.create");
      ipcMain.handle("workspace.create", () => ({
        ok: false,
        error: {
          code: "ACTION_NOT_ALLOWED",
          message: "合成保存失败",
          retryable: false,
          issues: [],
        },
      }));
    });
    await notice.getByRole("button", { name: "重新加载" }).click();
    await expect(notice).toHaveCount(0);
    await page.getByRole("link", { name: "创建工作区", exact: true }).click();
    await page.getByLabel("工作区名称").fill("合成提示验证");
    await page.getByRole("button", { name: "创建工作区", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText("合成保存失败");
    await expect(page.getByRole("alert")).toBeInViewport();
    expect(
      await page.getByRole("alert").evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.left >= 0 &&
          rect.top >= 0 &&
          rect.right <= window.innerWidth &&
          rect.bottom <= window.innerHeight
        );
      }),
    ).toBe(true);
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1);
      BrowserWindow.getAllWindows()[0]?.setContentSize(900, 640);
    });
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(900);
    await page.screenshot({ path: ".runtime/feedback-message.png" });
    await page.getByRole("button", { name: "关闭提示" }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByLabel("工作区名称")).toHaveValue("合成提示验证");
  } finally {
    await app.close();
    await rm(data, { recursive: true, force: true });
  }
});
