import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const require = createRequire(resolve("apps/desktop/package.json"));
test("formal model settings explicitly start isolated evaluations, cancel, preserve redacted fixture reports and never replay on reopen", async () => {
  const data = await mkdtemp(join(tmpdir(), "c04-desktop-e2e-"));
  let calls = 0,
    authorized = false,
    mode: "hang" | "auth" = "hang";
  const server = createServer(async (req, res) => {
    calls++;
    authorized = req.headers.authorization === "Bearer synthetic-desktop-eval-key";
    for await (const _ of req) {
      void _;
    }
    if (mode === "hang") return; // Real cancellation closes a genuinely pending HTTP request.
    res.writeHead(401);
    res.end("SYNTHETIC_UPSTREAM_CONFIDENTIAL_PAYLOAD");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
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
    let page = await app.firstWindow();
    await page.getByRole("link", { name: "创建工作区", exact: true }).click();
    await page.getByLabel("工作区名称").fill("C04隔离评估验收");
    await page.getByRole("button", { name: "创建工作区", exact: true }).click();
    await page.getByRole("navigation").getByRole("link", { name: "模型设置", exact: true }).click();
    const panel = page.getByRole("region", { name: "C04 模型评估" });
    await expect(panel.getByText("尚无评估记录，请显式选择模式后启动。")).toBeVisible();
    expect(calls).toBe(0);
    await panel.getByLabel("评估模式", { exact: true }).selectOption("deepseek");
    const startReal = panel.getByRole("button", {
      name: "开始真实 DeepSeek 评估（可能计费）",
      exact: true,
    });
    await expect(startReal).toBeDisabled();
    await expect(page.getByRole("button", { name: "保存模型设置", exact: true })).toBeDisabled();
    await page.getByLabel("DeepSeek API Key", { exact: false }).fill("synthetic-desktop-eval-key");
    await page.getByRole("combobox", { name: "模型", exact: true }).selectOption("deepseek-flash");
    await expect(startReal).toBeDisabled();
    await page.getByRole("button", { name: "保存模型设置", exact: true }).click();
    await expect(page.getByLabel("DeepSeek API Key", { exact: false })).toHaveValue("");
    await expect(startReal).toBeDisabled();
    await panel
      .getByRole("checkbox", { name: "我确认使用已保存模型发起真实评估，并知悉可能计费" })
      .check();
    await startReal.click();
    await expect.poll(() => calls).toBe(1);
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: ".runtime/c04-explicit-real-start.png" });
    expect(authorized).toBe(true);
    await panel.getByRole("button", { name: "取消本次评估", exact: true }).click();
    await expect(panel.getByRole("article", { name: "评估结果" })).toContainText("已取消");
    await expect(
      panel.getByText("当前为隔离 HTTP 测试传输，结果标记 fixture，不代表真实 DeepSeek 验收。"),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const result = await page.evaluate(() =>
          window.tradequote.modelEvaluation({
            schemaVersion: 1,
            requestId: crypto.randomUUID(),
            method: "modelEvaluation.list",
            payload: {},
          }),
        );
        return result.ok && result.data.kind === "runs" && result.data.runs[0]?.report?.status;
      })
      .toBe("cancelled");
    mode = "auth";
    await panel.getByRole("checkbox").check();
    await startReal.click();
    await expect(panel.getByRole("article", { name: "评估结果" })).toContainText("检查不通过");
    expect(calls).toBe(2);
    const failed = await page.evaluate(() =>
      window.tradequote.modelEvaluation({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        method: "modelEvaluation.list",
        payload: {},
      }),
    );
    if (!failed.ok || failed.data.kind !== "runs") throw new Error("evaluation state");
    const failedRun = failed.data.runs[0]!;
    expect(failedRun.mode).toBe("fixture");
    expect(failedRun.report?.realRequests).toBe(0);
    await app.evaluate(({ dialog }) => {
      dialog.showSaveDialog = async () => ({ canceled: true, filePath: "" });
    });
    const reportExport = await page.evaluate(
      (runId) =>
        window.tradequote.modelEvaluation({
          schemaVersion: 1,
          requestId: crypto.randomUUID(),
          method: "modelEvaluation.export",
          payload: { runId, format: "json" },
        }),
      failedRun.runId,
    );
    expect(reportExport).toMatchObject({ ok: true, data: { kind: "saved", saved: false } });
    expect(JSON.stringify(reportExport)).not.toContain("synthetic-desktop-eval-key");
    expect(JSON.stringify(reportExport)).not.toContain("SYNTHETIC_UPSTREAM_CONFIDENTIAL_PAYLOAD");
    await panel.getByLabel("评估模式", { exact: true }).selectOption("fixture");
    await panel.getByRole("button", { name: "运行合成评估", exact: true }).click();
    await expect(panel.getByRole("article", { name: "评估结果" })).toContainText("检查通过", {
      timeout: 30000,
    });
    expect(calls).toBe(2);
    await panel.getByText("查看检查明细（48项）").click();
    await expect(panel.getByRole("table", { name: "模型评估检查明细" })).toContainText("服装");
    await expect(panel.getByRole("table", { name: "模型评估检查明细" })).toContainText(
      "unknown_field",
    );
    await expect(panel.getByRole("table", { name: "模型评估检查明细" })).toContainText(
      "tool_input",
    );
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: ".runtime/c04-desktop-evaluation.png" });
    const completedState = await page.evaluate(() =>
      window.tradequote.modelEvaluation({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        method: "modelEvaluation.list",
        payload: {},
      }),
    );
    if (!completedState.ok || completedState.data.kind !== "runs") throw new Error("state");
    const completedId = completedState.data.runs[0]!.runId;
    const downloadPath = join(data, "downloaded.json");
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    }, downloadPath);
    await panel.getByRole("button", { name: "下载脱敏 JSON", exact: true }).click();
    await expect(panel.getByText("脱敏报告已保存。", { exact: true })).toBeVisible();
    const downloaded = await readFile(downloadPath, "utf8");
    expect(JSON.parse(downloaded)).toMatchObject({
      mode: "fixture",
      status: "passed",
      realRequests: 0,
    });
    expect(
      JSON.parse(downloaded).rows.find((r: { id: string }) => r.id === "failure-unknown_tool"),
    ).toMatchObject({
      diagnostics: [
        { stage: "tool_lookup", tool: null, category: "unknown_tool", disposition: "stopped" },
      ],
    });
    expect(
      JSON.parse(downloaded).rows.find((r: { id: string }) => r.id === "failure-invalid_json"),
    ).toMatchObject({
      diagnostics: [
        { stage: "provider", tool: null, category: "response_json", disposition: "stopped" },
      ],
    });
    await expect(panel.getByRole("table", { name: "模型评估检查明细" })).toContainText(
      "response_json",
    );
    expect(downloaded).not.toContain("synthetic-desktop-eval-key");
    const trade = await page.evaluate(() => window.tradequote.getTrade());
    expect(trade.ok && trade.data.quotes).toEqual([]);
    expect(trade.ok && trade.data.products).toEqual([]);
    const files = await readdir(join(data, "model-evaluations"));
    for (const file of files.filter((f) => f.endsWith(".json"))) {
      const text = await readFile(join(data, "model-evaluations", file), "utf8");
      expect(text).not.toContain("synthetic-desktop-eval-key");
      expect(text).not.toContain("SYNTHETIC_UPSTREAM_CONFIDENTIAL_PAYLOAD");
    }
    mode = "hang";
    await panel.getByLabel("评估模式", { exact: true }).selectOption("deepseek");
    await panel.getByRole("checkbox").check();
    await startReal.click();
    await expect.poll(() => calls).toBe(3);
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.getByRole("navigation").getByRole("link", { name: "模型设置", exact: true }).click();
    const reopenedPanel = page.getByRole("region", { name: "C04 模型评估" });
    await expect(reopenedPanel.getByRole("article", { name: "评估结果" })).toContainText("已中断");
    expect(calls).toBe(3);
    await reopenedPanel.getByLabel("评估历史（最近20次）").selectOption(completedId);
    await expect(reopenedPanel.getByRole("article", { name: "评估结果" })).toContainText(
      "检查通过",
    );
    const malformed = await page.evaluate(() =>
      window.tradequote.modelEvaluation(
        Object.assign(
          {
            schemaVersion: 1 as const,
            requestId: crypto.randomUUID(),
            idempotencyKey: crypto.randomUUID(),
            method: "modelEvaluation.start" as const,
            payload: {
              mode: "deepseek" as const,
              model: "synthetic-model",
              confirmedPaid: true as const,
            },
          },
          {
            endpoint: "https://invalid.example",
            credentials: { key: "injected", model: "synthetic-model" },
          },
        ),
      ),
    );
    expect(malformed).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(calls).toBe(3);
    // A previously configured model remains selectable even if it is outside today's built-in list.
    const legacy = await page.evaluate(() =>
      window.tradequote.modelSettings({
        method: "model.save",
        key: "",
        model: "legacy-synthetic-model",
      }),
    );
    expect(legacy).toMatchObject({
      ok: true,
      data: { hasKey: true, model: "legacy-synthetic-model" },
    });
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "单据工作台", exact: true })
      .click();
    await page.getByRole("navigation").getByRole("link", { name: "模型设置", exact: true }).click();
    const modelSelect = page.getByRole("combobox", { name: "模型", exact: true });
    await expect(modelSelect).toHaveValue("legacy-synthetic-model");
    await expect(
      modelSelect.getByRole("option", {
        name: "已保存的模型（legacy-synthetic-model）",
        exact: true,
      }),
    ).toHaveCount(1);
    await expect(page.getByLabel("DeepSeek API Key", { exact: false })).toHaveValue("");
    await modelSelect.selectOption("deepseek-v4-pro");
    expect(calls).toBe(3);
    const unchanged = await page.evaluate(() =>
      window.tradequote.modelSettings({ method: "model.status" }),
    );
    expect(unchanged).toMatchObject({
      ok: true,
      data: { model: "legacy-synthetic-model", hasKey: true },
    });
    await page.screenshot({ path: ".runtime/c04-model-select.png" });
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    await rm(data, { recursive: true, force: true });
  }
});
