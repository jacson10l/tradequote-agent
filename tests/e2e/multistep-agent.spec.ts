import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { _electron as electron, expect, test } from "@playwright/test";
import { build } from "vite";

const require = createRequire(resolve("apps/desktop/package.json"));
test("formal multistep loop saves validated V1/V2/V3, shows blocking sources, survives worker kill and explicitly retries", async () => {
  test.setTimeout(90000);
  const root = await mkdtemp(join(tmpdir(), "tq-multistep-"));
  const output = resolve(`.runtime/seed-${randomUUID()}`);
  await mkdir(output, { recursive: true });
  await build({
    configFile: false,
    logLevel: "silent",
    build: {
      outDir: output,
      minify: false,
      target: "node24",
      lib: {
        entry: resolve("tests/fixtures/multistep-seed.ts"),
        formats: ["cjs"],
        fileName: () => "seed.cjs",
      },
      rollupOptions: { external: (id) => id.startsWith("node:") || id === "better-sqlite3" },
    },
  });
  const seeded = await promisify(execFile)(
    require("electron") as string,
    [join(output, "seed.cjs"), root],
    {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        NODE_PATH: resolve("packages/infrastructure/node_modules"),
      },
    },
  );
  const source = JSON.parse(seeded.stdout) as { sourceRevisionId: string; sourceHash: string };
  let mode: "ok" | "block" | "hold" = "ok",
    calls = 0,
    waiting = 0,
    disconnected = 0;
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    calls++;
    const messages = JSON.parse(body).messages as { role: string; content: string }[];
    const host = JSON.parse(
      messages.find((m) => m.content.startsWith('{"hostContext":'))!.content,
    ).hostContext;
    const seen = messages
      .filter((m) => m.content.startsWith('{"toolResult":'))
      .map((m) => JSON.parse(m.content).toolResult);
    const last = seen.at(-1),
      tool = (name: string, input: unknown) => ({ kind: "tool", name, input });
    if (mode === "hold" && last?.name === "validate_quote") {
      waiting++;
      res.on("close", () => {
        if (!res.writableEnded) disconnected++;
      });
      return;
    }
    let action: unknown;
    if (!last)
      action = tool(
        host.mode === "revise" ? "get_quote" : "search_catalog",
        host.mode === "revise"
          ? { revisionId: host.operation.payload.baseId }
          : { query: "DEMO-TEE" },
      );
    else if (last.name === "search_catalog")
      action = tool("get_product_revisions", { productIds: [last.data.data.items[0].id] });
    else if (last.name === "get_product_revisions")
      action = tool("calculate_quote", {
        proposal: {
          lines: [{ productId: last.data.data.products[0].id, quantity: "100", unit: "piece" }],
          payment: mode === "block" ? "" : "T/T",
          delivery: "30天",
          summary: "明确商品与条款",
        },
      });
    else if (last.name === "get_quote") {
      const quote = last.data.data.quote;
      const patches = host.operation.payload.instruction.includes("120")
        ? [{ op: "setQuantity", productId: quote.lines[0].product.id, quantity: "120" }]
        : [
            {
              op: "setPayment",
              value: host.operation.payload.instruction.includes("余款")
                ? "30%预付，余款发货前"
                : "T/T发货前付",
            },
          ];
      action = tool("calculate_quote", { proposal: { patches, summary: "按明确指令修订" } });
    } else if (last.name === "calculate_quote") action = tool("search_knowledge", {});
    else if (last.name === "search_knowledge")
      action = tool("validate_quote", {
        candidateId: seen.filter((o) => o.name === "calculate_quote").at(-1).data.data.candidateId,
      });
    else if (last.name === "validate_quote")
      action = tool(host.mode === "revise" ? "apply_patch" : "create_draft", {
        candidateId: last.data.data.candidateId,
        validationId: last.data.data.validationId,
      });
    else throw new Error("synthetic model called after write");
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify(action) } }],
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
        TRADEQUOTE_TEST_DATA: root,
        TRADEQUOTE_TEST_MODEL_URL: `http://127.0.0.1:${address.port}`,
      },
    });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await page.evaluate(() =>
      window.tradequote.modelSettings({
        method: "model.save",
        key: "synthetic-multistep-key",
        model: "synthetic-model",
      }),
    );
    await page.getByRole("link", { name: "资料与报价" }).click();
    await page
      .getByRole("checkbox", { name: "多步工具报价（读取、核价、规则校验后保存）" })
      .check();
    await page.getByLabel("询盘客户", { exact: true }).fill("合成多步买方");
    await page.getByLabel("交给模型理解的询盘").fill("100件 DEMO-TEE，付款T/T，30天交货");
    await page.getByRole("button", { name: "理解询盘并保存 V1" }).click();
    await expect(page.getByTestId("goods-total")).toHaveText("900.00 USD");
    await page.getByLabel("本轮修改要求").fill("改为120件");
    await page.getByRole("button", { name: "理解修改并保存 V2" }).click();
    await expect(page.getByTestId("goods-total")).toHaveText("1080.00 USD");
    await page.getByLabel("本轮修改要求").fill("30%预付，余款发货前");
    await page.getByRole("button", { name: "理解修改并保存 V3" }).click();
    await expect(page.getByRole("heading", { name: "合成多步买方 · 草稿 V3" })).toBeVisible();
    const saved = await page.evaluate(() => window.tradequote.getTrade());
    if (!saved.ok) throw new Error("synthetic board");
    expect(saved.data.quotes).toHaveLength(3);
    const history = page.getByRole("region", { name: "模型运行记录" });
    await expect(history.getByText("已保存草稿检查（非审批）")).toHaveCount(3);
    mode = "block";
    await page.getByLabel("交给模型理解的询盘").fill("阻断验收：100件 DEMO-TEE，不提供付款");
    await page.getByRole("button", { name: "理解询盘并保存 V1" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    const blocked = history.getByRole("article").filter({ hasText: "阻断验收：" }).first();
    await expect(blocked).toContainText("付款条款为空，阻断保存");
    await expect(blocked).toContainText("核价预览检查（未保存）");
    await expect(blocked).toContainText(source.sourceRevisionId);
    await expect(blocked).toContainText(source.sourceHash);
    await expect(blocked).toContainText("合成来源");
    const afterBlock = await page.evaluate(() => window.tradequote.getTrade());
    expect(afterBlock.ok && afterBlock.data.quotes).toEqual(saved.data.quotes);
    mode = "hold";
    await page.getByLabel("本轮修改要求").fill("付款改T/T发货前付，恢复验收");
    await page.getByRole("button", { name: "理解修改并保存 V4" }).click();
    await expect.poll(() => waiting).toBe(1);
    await app.evaluate(({ app }) => {
      const metric = app
        .getAppMetrics()
        .find((m) => m.name === "TradeQuote Business" || m.serviceName === "TradeQuote Business");
      if (!metric) throw new Error("synthetic worker");
      process.kill(metric.pid, "SIGKILL");
    });
    await expect.poll(() => disconnected).toBe(1);
    const callsBefore = calls;
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.getByRole("link", { name: "资料与报价" }).click();
    const interrupted = page
      .getByRole("region", { name: "模型运行记录" })
      .getByRole("article")
      .filter({ hasText: "恢复验收" })
      .first();
    await expect(interrupted).toContainText("已中断");
    expect(calls).toBe(callsBefore);
    await page.evaluate(() =>
      window.tradequote.modelSettings({
        method: "model.save",
        key: "synthetic-multistep-key",
        model: "synthetic-model",
      }),
    );
    mode = "ok";
    await interrupted.getByRole("button", { name: "重试此运行（会再次调用模型）" }).click();
    await expect(interrupted).toContainText("草稿已保存");
    await expect(interrupted).toContainText("第 2 次尝试");
    await expect(interrupted).toContainText("已保存草稿检查（非审批）");
    const final = await page.evaluate(() => window.tradequote.getTrade());
    if (!final.ok) throw new Error("synthetic read");
    expect(final.data.quotes).toHaveLength(4);
    for (const old of saved.data.quotes)
      expect(final.data.quotes.find((quote) => quote.id === old.id)).toEqual(old);
    const runs = await page.evaluate(() =>
      window.tradequote.listAgentRuns({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        method: "agent.list",
        payload: { limit: 100 },
      }),
    );
    if (!runs.ok) throw new Error("synthetic list");
    expect(
      runs.data.runs
        .filter((run) => run.status === "completed")
        .every(
          (run) =>
            run.validation?.kind === "saved_revision" &&
            run.validation.report.revisionId === run.committedRevisionId &&
            run.toolSteps?.at(-1)?.ok,
        ),
    ).toBe(true);
    await interrupted.getByText(/实际工具步骤/).click();
    await interrupted.scrollIntoViewIfNeeded();
    await page.screenshot({ path: ".runtime/multistep-agent.png" });
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    await rm(root, { recursive: true, force: true });
    await rm(output, { recursive: true, force: true });
  }
});
