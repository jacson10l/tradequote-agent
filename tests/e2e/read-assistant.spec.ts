import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const require = createRequire(resolve("apps/desktop/package.json"));
test("formal desktop read assistant executes four real tools, shows facts, guards missing tools and never saves", async () => {
  const data = await mkdtemp(join(tmpdir(), "tq-read-desktop-"));
  let calls = 0;
  let mode: "chain" | "knowledge" | "rules" | "clarification" | "failure" | "auth" = "chain";
  let release: (() => void) | undefined;
  let pauseNext: Promise<void> | undefined;
  const seenTools: string[] = [];
  const server = createServer(async (req, res) => {
    calls++;
    let text = "";
    for await (const part of req) text += part;
    const request = JSON.parse(text);
    if (pauseNext) {
      const pause = pauseNext;
      pauseNext = undefined;
      await pause;
    }
    if (mode === "auth") {
      res.writeHead(401);
      res.end("synthetic auth failure");
      return;
    }
    const messages: { role: string; content: string }[] = request.messages;
    const host = messages
      .map((m) => {
        try {
          return JSON.parse(m.content).hostContext;
        } catch {
          return undefined;
        }
      })
      .find(Boolean);
    const latest = JSON.parse(messages.at(-1)?.content ?? "{}");
    let output: unknown;
    if (mode === "knowledge" || mode === "rules")
      output = {
        kind: "tool",
        name: mode === "knowledge" ? "search_knowledge" : "validate_quote",
        input: {},
      };
    else if (mode === "clarification")
      output = { kind: "clarification", question: "请确认需要读取的商品和单位" };
    else if (mode === "failure")
      output = latest.toolResult
        ? { kind: "complete", summary: "没有找到授权报价，请核对选择" }
        : {
            kind: "tool",
            name: "get_quote",
            input: { revisionId: "00000000-0000-4000-8000-000000000099" },
          };
    else if (!latest.toolResult)
      output = { kind: "tool", name: "search_catalog", input: { query: "DEMO-TEE" } };
    else {
      const result = latest.toolResult;
      seenTools.push(result.name);
      if (result.name === "search_catalog")
        output = {
          kind: "tool",
          name: "get_product_revisions",
          input: { productIds: [result.data.data.items[0].id] },
        };
      else if (result.name === "get_product_revisions")
        output = {
          kind: "tool",
          name: "get_quote",
          input: { revisionId: host.readableQuotes[0].revisionId },
        };
      else if (result.name === "get_quote") {
        const quote = result.data.data.quote;
        output = {
          kind: "tool",
          name: "calculate_quote",
          input: {
            scenarioId: host.scenario.id,
            buyer: quote.buyer,
            inquiry: quote.inquiry,
            payment: quote.payment,
            delivery: quote.delivery,
            lines: [
              {
                productId: quote.lines[0].product.id,
                quantity: "120",
                unit: quote.lines[0].product.unit,
              },
            ],
          },
        };
      } else
        output = {
          kind: "complete",
          summary: "原报价100件为900.00 USD，120件核价预览为1080.00 USD，未保存新报价",
        };
    }
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify(output) } }],
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture port");
  const launch = () =>
    electron.launch({
      executablePath: require("electron") as string,
      args: [resolve("apps/desktop/out/main/index.js")],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "",
        TRADEQUOTE_TEST_DATA: data,
        TRADEQUOTE_TEST_MODEL_URL: `http://127.0.0.1:${address.port}`,
      },
    });
  let app = await launch();
  try {
    const page = await app.firstWindow();
    await page.getByRole("link", { name: "创建工作区", exact: true }).click();
    await page.getByLabel("工作区名称").fill("只读助手合成验收");
    await page.getByRole("button", { name: "创建工作区", exact: true }).click();
    await expect(page.getByText("已保存至本机 · 版本 1")).toBeVisible();
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "资料与报价", exact: true })
      .click();
    await page.getByRole("button", { name: "保存演示场景" }).click();
    await expect(page.getByText("场景版本 1", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "填入合成 CSV 样本" }).click();
    await page.getByRole("button", { name: "解析并预览" }).click();
    await expect(page.getByRole("table", { name: "CSV 导入预览" })).toBeVisible();
    await page.getByRole("button", { name: "确认发布此批次" }).click();
    await page.getByRole("checkbox", { name: "选择 DEMO-TEE", exact: true }).check();
    await page.getByLabel("客户名称").fill("合成只读客户");
    await page.getByLabel("原始询盘", { exact: true }).fill("请报价100件上衣");
    await page.getByRole("textbox", { name: "DEMO-TEE 数量", exact: true }).fill("100");
    await page.getByRole("button", { name: "计算并保存报价 V1" }).click();
    await expect(page.getByTestId("goods-total")).toHaveText("900.00 USD");
    const before = await page.evaluate(() => window.tradequote.getTrade());
    if (!before.ok || !before.data.quotes[0]) throw new Error("saved quote fixture");
    const quoteId = before.data.quotes[0].id;
    await page.getByRole("navigation").getByRole("link", { name: "只读助手", exact: true }).click();
    await expect(page.getByText("知识检索和规则检查尚未开放。", { exact: false })).toBeVisible();
    await page.getByLabel("只读任务", { exact: true }).fill("查询商品并对照原报价，核算120件");
    await page.getByLabel("允许读取的报价版本").selectOption(quoteId);
    await page.getByRole("button", { name: "运行只读任务", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("请先在模型设置中保存");
    expect(calls).toBe(0);
    await page.getByRole("navigation").getByRole("link", { name: "模型设置", exact: true }).click();
    await page.getByLabel("DeepSeek API Key", { exact: false }).fill("synthetic-read-key");
    await page.getByRole("combobox", { name: "模型", exact: true }).selectOption("deepseek-v4-pro");
    await page.getByRole("button", { name: "保存模型设置", exact: true }).click();
    await expect(page.getByLabel("DeepSeek API Key", { exact: false })).toHaveValue("");
    await page.getByRole("navigation").getByRole("link", { name: "只读助手", exact: true }).click();
    await page.getByLabel("允许读取的报价版本").selectOption(quoteId);
    await page.getByLabel("只读任务", { exact: true }).fill("查询商品并对照原报价，核算120件");
    while (await page.getByRole("button", { name: "关闭提示", exact: true }).count())
      await page.getByRole("button", { name: "关闭提示", exact: true }).first().click();
    await page.screenshot({ path: ".runtime/c02b-read-form.png" });
    pauseNext = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.getByRole("button", { name: "运行只读任务", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("只读任务运行中", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "运行只读任务", exact: true })).toBeDisabled();
    await expect(page.getByLabel("允许读取的报价版本")).toBeDisabled();
    release?.();
    const result = page.getByRole("region", { name: "只读任务结果" });
    await expect(
      result.getByRole("heading", { name: "只读任务已结束 · 未保存报价" }),
    ).toBeVisible();
    await expect(result.getByRole("article")).toHaveCount(4);
    await expect(result).toContainText("原报价商品合计：900.00 USD");
    await expect(result).toContainText("预览商品合计：1080.00 USD");
    await result.getByText("DEMO-TEE · 价格档位与来源", { exact: true }).first().click();
    await expect(result).toContainText("原文第 3 行");
    await expect(result).toContainText(
      before.data.products.find((p) => p.sku === "DEMO-TEE")?.sourceHash ?? "invalid hash",
    );
    expect(seenTools).toEqual([
      "search_catalog",
      "get_product_revisions",
      "get_quote",
      "calculate_quote",
    ]);
    expect(calls).toBe(5);
    expect(await page.evaluate(() => window.tradequote.getTrade())).toEqual(before);
    await result.scrollIntoViewIfNeeded();
    while (await page.getByRole("button", { name: "关闭提示", exact: true }).count())
      await page.getByRole("button", { name: "关闭提示", exact: true }).first().click();
    await page.screenshot({ path: ".runtime/c02b-read-desktop.png" });
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setContentSize(900, 640),
    );
    await expect(
      page.getByRole("navigation").getByRole("link", { name: "只读助手", exact: true }),
    ).toBeInViewport();
    await page.screenshot({ path: ".runtime/c02b-read-narrow.png" });
    for (const next of ["knowledge", "rules"] as const) {
      mode = next;
      await page.getByRole("button", { name: "运行只读任务", exact: true }).click();
      await expect(page.getByRole("alert")).toContainText("模型请求了未注册的工具");
      await expect(result).toHaveCount(0);
      await page.getByRole("button", { name: "关闭提示", exact: true }).first().click();
    }
    mode = "failure";
    await page.getByRole("button", { name: "运行只读任务", exact: true }).click();
    await expect(result.getByRole("alert")).toContainText("NOT_FOUND");
    mode = "clarification";
    await page.getByRole("button", { name: "运行只读任务", exact: true }).click();
    await expect(result).toContainText("请确认需要读取的商品和单位");
    await expect(result).toContainText("本次未调用业务工具");
    mode = "auth";
    await page.getByRole("button", { name: "运行只读任务", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("模型鉴权失败");
    expect(await page.evaluate(() => window.tradequote.getTrade())).toEqual(before);
    const count = calls;
    await app.close();
    app = await launch();
    const reopened = await app.firstWindow();
    await reopened
      .getByRole("navigation")
      .getByRole("link", { name: "只读助手", exact: true })
      .click();
    await expect(reopened.getByRole("region", { name: "只读助手任务" })).toBeVisible();
    await expect(reopened.getByRole("region", { name: "只读任务结果" })).toHaveCount(0);
    expect(calls).toBe(count);
    expect(await reopened.evaluate(() => window.tradequote.getTrade())).toEqual(before);
  } finally {
    release?.();
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(data, { recursive: true, force: true });
  }
});
