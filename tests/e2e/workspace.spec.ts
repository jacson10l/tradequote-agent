import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
      ELECTRON_RENDERER_URL: "http://127.0.0.1:5189/",
    },
  });
  try {
    expect(await app.evaluate(({ app }) => app.getName())).toBe("TradeQuote");
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
    // Every route starts with business content, including at a narrow desktop width.
    for (const width of [1380, 900]) {
      await app.evaluate(({ BrowserWindow }, nextWidth) => {
        BrowserWindow.getAllWindows()[0]?.setContentSize(nextWidth, 800);
      }, width);
      for (const [route, ready] of [
        ["单据工作台", "报价单据"],
        ["资料与报价", "1 · 演示场景"],
        ["模型设置", "DeepSeek 连接与凭据"],
        ["工作区设置", "工作区设置"],
      ] as const) {
        await page.getByRole("navigation").getByRole("link", { name: route, exact: true }).click();
        await expect(page.getByRole("heading", { name: ready, exact: true })).toBeAttached();
        await page.getByRole("main").evaluate((element) => {
          element.scrollTop = 0;
        });
        await expect
          .poll(() =>
            page.getByRole("main").evaluate((main) => {
              const panel = main.querySelector(".panel");
              if (!panel) return false;
              const bounds = panel.getBoundingClientRect();
              const mainBounds = main.getBoundingClientRect();
              return (
                Math.abs(bounds.top - mainBounds.top - 16) <= 1 &&
                bounds.left >= mainBounds.left &&
                bounds.right <= mainBounds.right &&
                main.scrollWidth === main.clientWidth
              );
            }),
          )
          .toBe(true);
        const index = ["单据工作台", "资料与报价", "模型设置", "工作区设置"].indexOf(route);
        await page.screenshot({ path: `output/playwright/compact-${width}-${index}.png` });
      }
    }
    await name.focus();
    await expect(name).toBeFocused();
    expect(
      await page.evaluate(() => ({
        bridge: Object.keys(window.tradequote).sort(),
        node: typeof Reflect.get(window, "require"),
      })),
    ).toEqual({
      bridge: [
        "cancelAgentRun",
        "checkQuote",
        "createQuoteV1",
        "createWorkspace",
        "getAgentRun",
        "getKnowledgeRevision",
        "getQuoteChecks",
        "getTrade",
        "getWorkspace",
        "modelSettings",
        "pickCatalogCsv",
        "publishCatalog",
        "publishKnowledge",
        "queryKnowledge",
        "renameWorkspace",
        "retryAgentRun",
        "reviseQuote",
        "saveScenario",
        "stageCatalog",
        "stageKnowledge",
        "startAgentRun",
        "understandInquiry",
      ],
      node: "undefined",
    });
    const pendingCapabilities = await page.evaluate(async () => {
      const read = { schemaVersion: 1 as const, requestId: crypto.randomUUID() };
      const write = { ...read, idempotencyKey: crypto.randomUUID() };
      return Promise.all([
        window.tradequote.queryKnowledge({
          ...read,
          method: "knowledge.query",
          payload: {
            scope: { platform: "RFQ", market: "Brazil", category: "板材" },
            at: "2026-10-21T00:00:00.000Z",
          },
        }),
        window.tradequote.checkQuote({
          ...write,
          method: "quote.check",
          payload: { revisionId: crypto.randomUUID() },
        }),
        window.tradequote.startAgentRun({
          ...write,
          method: "agent.start",
          payload: {
            method: "agent.understand",
            payload: {
              scenarioId: crypto.randomUUID(),
              buyer: "合成测试",
              inquiry: "仅验证未接入门禁",
            },
          },
        }),
      ]);
    });
    for (const result of pendingCapabilities)
      expect(result).toMatchObject({
        ok: false,
        error: { code: "CAPABILITY_UNAVAILABLE", retryable: false },
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
    // macOS may clamp large windows to its work area; record actual native sizes.
    const nativeMeasurements: { requested: readonly number[]; actual: number[] }[] = [];
    for (const [width, height] of [
      [800, 640],
      [900, 800],
      [1380, 900],
      [1920, 1080],
    ] as const) {
      const actual = await app.evaluate(
        ({ BrowserWindow }, size) => {
          BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1);
          const window = BrowserWindow.getAllWindows()[0];
          if (!window) throw new Error("WINDOW_MISSING");
          window.setContentSize(size.width, size.height);
          return window.getContentSize();
        },
        { width, height },
      );
      nativeMeasurements.push({ requested: [width, height], actual });
      await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(actual[0]);
      for (const zoom of [1, 1.25, 1.5]) {
        await app.evaluate(({ BrowserWindow }, factor) => {
          BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(factor);
        }, zoom);
        await expect
          .poll(() =>
            page.evaluate(() => {
              const main = document.querySelector("main");
              const sidebar = document.querySelector(".sidebar");
              if (!main || !sidebar) return false;
              const rect = sidebar.getBoundingClientRect();
              const root = document.documentElement;
              const result = {
                rootFits:
                  root.scrollWidth === root.clientWidth && root.scrollHeight === root.clientHeight,
                bodyFits: document.body.scrollHeight === document.body.clientHeight,
                sidebarFits:
                  rect.bottom <= window.innerHeight + 1 &&
                  Math.abs(rect.height - (window.innerHeight - 3)) <= 1,
                mainScrolls: getComputedStyle(main).overflowY === "auto",
                metrics: {
                  rootHeight: root.clientHeight,
                  rootScroll: root.scrollHeight,
                  bodyHeight: document.body.scrollHeight,
                  sidebarHeight: rect.height,
                  sidebarBottom: rect.bottom,
                  innerHeight: window.innerHeight,
                  innerWidth: window.innerWidth,
                },
              };
              return result.rootFits && result.bodyFits && result.sidebarFits && result.mainScrolls
                ? "fits"
                : JSON.stringify(result);
            }),
          )
          .toBe("fits");
        await expect(page.getByRole("link", { name: "工作区设置", exact: true })).toBeInViewport();
        await expect(page.getByRole("link", { name: "单据工作台", exact: true })).toBeInViewport();
      }
    }
    await writeFile(".runtime/m1-layout-metrics.json", JSON.stringify(nativeMeasurements, null, 2));
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1);
      BrowserWindow.getAllWindows()[0]?.setContentSize(900, 640);
    });
    const main = page.getByRole("main");
    await main.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(page.getByRole("button", { name: "发送给 Agent" })).toBeVisible();
    expect(await main.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(
      await page.evaluate(() => {
        const root = document.getElementById("root");
        if (!root) throw new Error("ROOT_MISSING");
        root.scrollTop = 100;
        window.scrollTo(0, 100);
        return { window: window.scrollY, root: root.scrollTop };
      }),
    ).toEqual({ window: 0, root: 0 });
    await page.screenshot({ path: "output/playwright/m1-layout-narrow.png" });
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 900);
    });
    await main.evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.screenshot({ path: "output/playwright/m1-layout-wide.png" });
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
