import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { fillCatalogFixture, saveBusinessScenario } from "./business-fixture";

const require = createRequire(resolve("apps/desktop/package.json"));
test("R20 real worker SIGKILL, restart discovery, explicit retry, cancellation and immutable saved receipts", async () => {
  const data = await mkdtemp(join(tmpdir(), "tq-recovery-e2e-"));
  let mode: "hold" | "ok" = "hold",
    calls = 0,
    disconnected = 0;
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    calls++;
    res.on("close", () => {
      if (!res.writableEnded) disconnected++;
    });
    if (mode === "hold") return;
    const messages = JSON.parse(body).messages;
    const context = JSON.parse(messages.at(-1).content);
    const output = {
      lines: [
        {
          productId: context.products.find((p: { sku: string }) => p.sku === "DEMO-TEE").id,
          quantity: "100",
          unit: "piece",
        },
      ],
      payment: "",
      delivery: "",
      summary: "合成恢复草稿",
    };
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify(output) } }],
      }),
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("synthetic port");
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
    let page = await app.firstWindow();
    await page.getByRole("link", { name: "创建工作区", exact: true }).click();
    await page.getByLabel("工作区名称").fill("合成强杀恢复");
    await page.getByRole("button", { name: "创建工作区", exact: true }).click();
    await expect(page.getByText("已保存至本机 · 版本 1")).toBeVisible();
    await page.evaluate(() =>
      window.tradequote.modelSettings({
        method: "model.save",
        key: "synthetic-recovery-key",
        model: "synthetic-model",
      }),
    );
    await page.getByRole("link", { name: "资料与报价" }).click();
    await saveBusinessScenario(page);
    await fillCatalogFixture(page);
    await page.getByRole("button", { name: "解析并预览" }).click();
    await page.getByRole("button", { name: "确认发布此批次" }).click();
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "单据工作台", exact: true })
      .click();

    const started = await page.evaluate(async () => {
      const board = await window.tradequote.getTrade();
      if (!board.ok || !board.data.scenario) throw new Error("synthetic scenario");
      return window.tradequote.startAgentRun({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        method: "agent.start",
        payload: {
          method: "agent.understand",
          payload: {
            scenarioId: board.data.scenario.id,
            buyer: "合成恢复买方",
            inquiry: "100件 DEMO-TEE 强杀验收",
          },
        },
      });
    });
    if (!started.ok) throw new Error(started.error.message);
    const runId = started.data.runId;
    await expect.poll(() => calls).toBe(1);
    const eventPage = (afterSeq = 0, limit = 2) =>
      page.evaluate(
        ({ runId, afterSeq, limit }) =>
          window.tradequote.getAgentRunEvents({
            schemaVersion: 1,
            requestId: crypto.randomUUID(),
            method: "agent.events",
            payload: { runId, afterSeq, limit },
          }),
        { runId, afterSeq, limit },
      );
    const firstEvents = await eventPage(0, 1);
    expect(firstEvents.ok && firstEvents.data.hasMore).toBe(true);
    await expect(page.getByRole("region", { name: `运行 ${runId}` })).toContainText(
      "处理进度已同步",
    );
    await app.evaluate(({ app }) => {
      const metric = app
        .getAppMetrics()
        .find((m) => m.name === "TradeQuote Business" || m.serviceName === "TradeQuote Business");
      if (!metric) throw new Error("worker metric missing");
      process.kill(metric.pid, "SIGKILL");
    });
    await expect.poll(() => disconnected).toBe(1);
    // The mounted desktop recovers by read-only event/list queries, with no user retry.
    await expect(page.getByRole("region", { name: `运行 ${runId}` })).toContainText("已中断");
    const interrupted = await eventPage(0, 100);
    expect(interrupted.ok && interrupted.data.events.map((e) => e.seq)).toEqual([1, 2, 3]);
    await page.reload();
    await expect(page.getByRole("region", { name: `运行 ${runId}` })).toContainText("已中断");
    expect(calls).toBe(1);
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "单据工作台", exact: true })
      .click();

    const article = page.getByRole("region", { name: `运行 ${runId}` });
    await expect(article).toContainText("已中断");
    expect(calls).toBe(1);
    await page.evaluate(() =>
      window.tradequote.modelSettings({
        method: "model.save",
        key: "synthetic-recovery-key",
        model: "synthetic-model",
      }),
    );
    mode = "ok";
    await article.getByRole("button", { name: "重试" }).click();
    await expect(article).toContainText("已完成");
    await expect(article).toContainText("第 2 次处理");
    await expect(page.getByTestId("goods-total")).toHaveText("900.00 USD");
    expect(calls).toBe(2);
    const recovered = await eventPage(0, 100);
    if (!recovered.ok || !firstEvents.ok || !interrupted.ok) throw Error("synthetic events");
    expect(recovered.data.events[0]).toEqual(firstEvents.data.events[0]);
    expect(recovered.data.events.slice(0, 3)).toEqual(interrupted.data.events);
    expect(recovered.data.headSeq).toBe(6);
    await article
      .getByText(/^处理记录(?: ·|$)/)
      .first()
      .click();
    await expect(article.getByRole("region", { name: "运行事件" })).toHaveAttribute(
      "data-event-seq",
      "6",
    );
    const allEvents = [];
    let afterSeq = 0;
    for (;;) {
      const part = await eventPage(afterSeq, 2);
      if (!part.ok) throw Error("synthetic paging");
      allEvents.push(...part.data.events);
      afterSeq = part.data.nextSeq;
      if (!part.data.hasMore) break;
    }
    expect(allEvents.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(new Set(allEvents.map((e) => e.eventId)).size).toBe(6);
    await article.getByText("处理记录（最近6条）", { exact: true }).click();
    await app.evaluate(
      ({ BrowserWindow }, { runId }) => {
        const win = BrowserWindow.getAllWindows()[0];
        for (const seq of [6, 6, 100])
          win?.webContents.send("agent.events.signal", { type: "events.available", runId, seq });
      },
      { runId },
    );
    await expect(article.getByRole("region", { name: "运行事件" }).locator("li")).toHaveCount(6);
    expect((await eventPage(6)).ok).toBe(true);
    expect(calls).toBe(2);
    const saved = await page.evaluate(() => window.tradequote.getTrade());
    if (!saved.ok) throw new Error("synthetic board");
    const frozen = saved.data.quotes[0];
    mode = "hold";
    const next = await page.evaluate((command) => {
      if (command.method !== "agent.understand") throw new Error("synthetic operation");
      return window.tradequote.startAgentRun({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        method: "agent.start",
        payload: {
          method: command.method,
          payload: { ...command.payload, inquiry: "100件 DEMO-TEE 取消验收" },
        },
      });
    }, started.data.command);
    if (!next.ok) throw new Error(next.error.message);
    await expect.poll(() => calls).toBe(3);
    const cancelled = await page.evaluate(
      (id) =>
        window.tradequote.cancelAgentRun({
          schemaVersion: 1,
          requestId: crypto.randomUUID(),
          idempotencyKey: crypto.randomUUID(),
          method: "agent.cancel",
          payload: { runId: id },
        }),
      next.data.runId,
    );
    expect(cancelled.ok && cancelled.data.status).toBe("cancelled");
    await expect.poll(() => disconnected).toBe(2);
    const after = await page.evaluate(() => window.tradequote.getTrade());
    expect(after.ok && after.data.quotes).toEqual(saved.data.quotes);
    expect(after.ok && after.data.turns).toEqual(saved.data.turns);
    await page.getByRole("button", { name: "刷新记录" }).click();
    await page.getByRole("region", { name: `运行 ${next.data.runId}` }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: ".runtime/agent-recovery.png" });
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    const reopened = await page.evaluate(() => window.tradequote.getTrade());
    expect(reopened.ok && reopened.data.quotes[0]).toEqual(frozen);
    expect(calls).toBe(3);
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    await rm(data, { recursive: true, force: true });
  }
});
