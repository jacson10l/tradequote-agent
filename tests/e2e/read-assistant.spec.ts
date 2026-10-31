import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { fillCatalogFixture, saveBusinessScenario } from "./business-fixture";

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
    await saveBusinessScenario(page);
    await fillCatalogFixture(page);
    await page.getByRole("button", { name: "解析并预览" }).click();
    await expect(page.getByRole("table", { name: "CSV 导入预览" })).toBeVisible();
    await page.getByRole("button", { name: "确认发布此批次" }).click();
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "单据工作台", exact: true })
      .click();
    await page.getByText("手工填写报价", { exact: true }).click();
    await page.getByRole("checkbox", { name: "选择 DEMO-TEE", exact: true }).check();
    await page.getByLabel("客户名称").fill("合成只读客户");
    await page.getByLabel("原始询盘", { exact: true }).fill("请报价100件上衣");
    await page.getByRole("textbox", { name: "DEMO-TEE 数量", exact: true }).fill("100");
    await page.getByRole("button", { name: "计算并保存报价 V1" }).click();
    await expect(page.getByTestId("goods-total")).toHaveText("900.00 USD");
    const before = await page.evaluate(() => window.tradequote.getTrade());
    if (!before.ok || !before.data.quotes[0]) throw new Error("saved quote fixture");
    await expect(
      page.getByRole("navigation").getByRole("link", { name: "只读助手", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("checkbox", { name: "仅查询与试算，不保存报价" }).check();
    await expect(page.getByRole("checkbox", { name: "仅查询与试算，不保存报价" })).toBeChecked();
    const readLegacy = () =>
      page.evaluate(
        async (revisionId) =>
          window.tradequote.readAgent({
            schemaVersion: 1,
            requestId: crypto.randomUUID(),
            method: "agent.read",
            payload: {
              instruction: "查询商品并对照原报价，核算120件",
              quoteRevisionIds: [revisionId],
            },
          }),
        before.data.quotes[0]!.id,
      );
    expect((await readLegacy()).ok).toBe(false);
    expect(calls).toBe(0);
    await page.evaluate(() =>
      window.tradequote.modelSettings({
        method: "model.save",
        key: "synthetic-read-key",
        model: "synthetic-model",
      }),
    );
    const complete = await readLegacy();
    expect(complete.ok).toBe(true);
    if (!complete.ok) throw Error("read failed");
    expect(complete.data.toolCalls).toBe(4);
    expect(seenTools).toEqual([
      "search_catalog",
      "get_product_revisions",
      "get_quote",
      "calculate_quote",
    ]);
    expect(calls).toBe(5);
    expect(await page.evaluate(() => window.tradequote.getTrade())).toEqual(before);
    await page.reload();
    const result = page
      .locator(".conversation-turn")
      .filter({ hasText: "本次试算商品合计：1080.00 USD" })
      .last();
    await result.getByText("查询结果与金额依据", { exact: true }).click();
    await expect(result).toContainText("预览商品合计：1080.00 USD");
    await result.getByText("DEMO-TEE · 价格档位与来源", { exact: true }).first().click();
    await expect(result).toContainText(
      before.data.products.find((p) => p.sku === "DEMO-TEE")!.sourceHash,
    );
    for (const next of ["knowledge", "rules"] as const) {
      mode = next;
      expect((await readLegacy()).ok).toBe(false);
    }
    mode = "failure";
    const missing = await readLegacy();
    expect(missing.ok && missing.data.observations[0]?.result.ok).toBe(false);
    mode = "clarification";
    const clarification = await readLegacy();
    expect(clarification.ok && clarification.data.outcome).toBe("waiting_input");
    mode = "auth";
    expect((await readLegacy()).ok).toBe(false);
    mode = "chain";
    pauseNext = new Promise<void>((resolve) => {
      release = resolve;
    });
    const cancelled = await page.evaluate(
      async (revisionId) =>
        window.tradequote.startAgentRun({
          schemaVersion: 1,
          requestId: crypto.randomUUID(),
          idempotencyKey: crypto.randomUUID(),
          method: "agent.start",
          payload: {
            method: "agent.read",
            payload: { instruction: "取消中的查询", quoteRevisionIds: [revisionId] },
          },
        }),
      before.data.quotes[0]!.id,
    );
    if (!cancelled.ok) throw Error("start failed");
    await page.getByRole("button", { name: "刷新记录", exact: true }).click();
    const active = page.getByRole("region", { name: `运行 ${cancelled.data.runId}`, exact: true });
    await active.getByRole("button", { name: "停止", exact: true }).click();
    await expect(active).toContainText("已取消");
    release?.();
    const count = calls;
    await app.close();
    app = await launch();
    const reopened = await app.firstWindow();
    await expect(
      reopened.getByRole("region", { name: `运行 ${cancelled.data.runId}`, exact: true }),
    ).toContainText("已取消");
    await expect(
      reopened
        .locator(".conversation-turn")
        .filter({ hasText: "本次试算商品合计：1080.00 USD" })
        .last(),
    ).toContainText("1080.00 USD");
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
