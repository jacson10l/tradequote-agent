import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const require = createRequire(resolve("apps/desktop/package.json"));

test("dedicated startup screen reveals the brand with confetti before fading into the workbench", async () => {
  const data = await mkdtemp(join(tmpdir(), "tradequote-confetti-e2e-"));
  const launch = () =>
    electron.launch({
      executablePath: require("electron") as string,
      args: [resolve("apps/desktop/out/main/index.js")],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "", TRADEQUOTE_TEST_DATA: data },
    });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    const splash = page.getByRole("status", { name: "TradeQuote 正在启动" });
    await expect(splash).toBeVisible();
    await expect(splash.getByRole("heading", { name: "TradeQuote", exact: true })).toBeVisible();
    await expect(page.locator(".startup-main")).toHaveAttribute("inert", "");
    await expect(page.locator(".startup-main")).toHaveCSS("opacity", "0");
    await expect(page.getByRole("navigation", { name: "主导航" })).toHaveCount(0);
    const canvas = page.locator("canvas.startup-confetti");
    await expect(canvas).toBeVisible();
    await expect
      .poll(() =>
        canvas.evaluate((element) => {
          if (!(element instanceof HTMLCanvasElement)) return false;
          const context = element.getContext("2d");
          if (!context) return false;
          const pixels = context.getImageData(0, 0, element.width, element.height).data;
          return pixels.some((value, index) => index % 4 === 3 && value > 0);
        }),
      )
      .toBe(true);
    expect(
      await canvas.evaluate((element) => {
        if (!(element instanceof HTMLCanvasElement)) throw new Error("CANVAS_MISSING");
        const ratio = window.devicePixelRatio;
        return {
          pointerEvents: getComputedStyle(element).pointerEvents,
          highDpi: element.width === Math.round(window.innerWidth * ratio),
        };
      }),
    ).toMatchObject({ pointerEvents: "none", highDpi: true });
    await expect
      .poll(() =>
        splash
          .locator(".startup-brand")
          .evaluate((element) => Number(getComputedStyle(element).opacity)),
      )
      .toBeGreaterThan(0.8);
    await page.screenshot({ path: ".runtime/startup-confetti/desktop-splash.png" });
    await expect(page.locator(".startup-experience")).toHaveAttribute("data-phase", "entering");
    await expect(canvas).toHaveCount(0, { timeout: 4000 });
    await expect(page.locator(".startup-main")).not.toHaveAttribute("inert", "");
    await expect(page.locator(".startup-experience")).toHaveAttribute("data-phase", "ready");
    await expect(splash).toHaveCount(0);
    await expect(page.locator(".startup-main")).toHaveCSS("opacity", "1");
    await page.screenshot({ path: ".runtime/startup-confetti/desktop-main.png" });
    await page.getByRole("link", { name: "工作区设置", exact: true }).click();
    await expect(page.getByLabel("工作区名称")).toBeVisible();
    await page.getByRole("link", { name: "资料与报价", exact: true }).click();
    await expect(canvas).toHaveCount(0);
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await expect(page.getByRole("status", { name: "TradeQuote 正在启动" })).toBeVisible();
    await expect(page.locator("canvas.startup-confetti")).toBeVisible();
    await expect(page.locator("canvas.startup-confetti")).toHaveCount(0, { timeout: 4000 });
    await expect(page.locator(".startup-screen")).toHaveCount(0);
  } finally {
    await app.close();
    await rm(data, { recursive: true, force: true });
  }
});

test("real Electron skips startup confetti with reduced motion", async () => {
  const data = await mkdtemp(join(tmpdir(), "tradequote-confetti-reduced-e2e-"));
  const app = await electron.launch({
    executablePath: require("electron") as string,
    args: [resolve("apps/desktop/out/main/index.js")],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "", TRADEQUOTE_TEST_DATA: data },
  });
  try {
    const page = await app.firstWindow();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await expect(page.getByRole("heading", { name: "从一份询盘开始" })).toBeVisible();
    await expect(page.locator("canvas.startup-confetti")).toHaveCount(0);
    await expect(page.locator(".startup-screen")).toHaveCount(0);
    await expect(page.locator(".startup-main")).not.toHaveAttribute("inert", "");
    await page.getByRole("link", { name: "工作区设置", exact: true }).click();
    await expect(page.getByLabel("工作区名称")).toBeVisible();
  } finally {
    await app.close();
    await rm(data, { recursive: true, force: true });
  }
});
