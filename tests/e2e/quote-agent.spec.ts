import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { compatibilityQuote, fillCatalogFixture, saveBusinessScenario } from "./business-fixture";

const require = createRequire(resolve("apps/desktop/package.json"));
test("desktop settings and HTTP adapter support inquiry plus two saved revisions, differences, failures and reopen", async () => {
  const data = await mkdtemp(join(tmpdir(), "tq-agent-e2e-"));
  let mode: "ok" | "invalid" | "auth" = "ok";
  let calls = 0;
  let thirdHasHistory = false;
  const server = createServer(async (req, res) => {
    calls++;
    let text = "";
    for await (const chunk of req) text += chunk;
    const request = JSON.parse(text) as { messages: { role: string; content: string }[] };
    if (mode === "auth") {
      res.writeHead(401);
      res.end("synthetic failure");
      return;
    }
    let output: unknown = { probe: "tradequote" };
    const last = request.messages.at(-1)?.content ?? "";
    if (last.startsWith("{")) {
      const context = JSON.parse(last);
      if (context.mode === "understand")
        output = {
          lines: [
            {
              productId: context.products.find((p: { sku: string }) => p.sku === "DEMO-TEE").id,
              quantity: "100",
              unit: "piece",
            },
          ],
          payment: "",
          delivery: "",
          summary: "已识别100件，付款和交期待确认",
        };
      else if (context.instruction.includes("120"))
        output = {
          patches: [{ op: "setQuantity", productId: context.lines[0].productId, quantity: "120" }],
          summary: "数量改为120件",
        };
      else {
        thirdHasHistory = request.messages.some(
          (m) => m.role === "user" && m.content.includes("120"),
        );
        output = {
          patches: [
            { op: "setPayment", value: "30%预付，70%发货前付清" },
            { op: "setDelivery", value: "确认后30天" },
          ],
          summary: "更新付款和交期",
        };
      }
    }
    if (mode === "invalid") output = { goodsTotal: "0", approved: true };
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify(output) } }],
      }),
    );
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
    const page = await app.firstWindow();
    await page.getByRole("link", { name: "创建工作区", exact: true }).click();
    await page.getByLabel("工作区名称").fill("合成模型验收");
    await page.getByRole("button", { name: "创建工作区", exact: true }).click();
    await expect(page.getByText("已保存至本机 · 版本 1")).toBeVisible();
    await page.getByRole("navigation").getByRole("link", { name: "模型设置", exact: true }).click();
    await page.getByLabel("DeepSeek API Key", { exact: false }).fill("synthetic-e2e-key");
    await page.getByRole("combobox", { name: "模型", exact: true }).selectOption("deepseek-flash");
    await page.getByRole("button", { name: "保存模型设置", exact: true }).click();
    await expect(page.getByLabel("DeepSeek API Key", { exact: false })).toHaveValue("");
    await page.getByRole("button", { name: "测试已保存的连接" }).click();
    await expect(page.getByText("连接与 JSON 测试通过；真实业务效果仍需核对。")).toBeVisible();
    const status = await page.evaluate(() =>
      window.tradequote.modelSettings({ method: "model.status" }),
    );
    expect(JSON.stringify(status)).not.toContain("synthetic-e2e-key");
    if (status.ok && status.data.storage === "encrypted")
      expect(await readFile(join(data, "model-settings", "credentials.enc"), "utf8")).not.toContain(
        "synthetic-e2e-key",
      );
    await page.screenshot({ path: ".runtime/model-settings.png" });
    await page.getByRole("link", { name: "资料与报价" }).click();
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
    await expect(page.getByRole("checkbox", { name: "选择 DEMO-TEE", exact: true })).toBeVisible();
    expect(
      (await compatibilityQuote(page, "请提供100件 DEMO-TEE 报价，付款和交期待确认。", "合成买家"))
        .ok,
    ).toBe(true);
    await expect(page.getByTestId("goods-total")).toHaveText("900.00 USD");
    expect((await compatibilityQuote(page, "数量改为120件")).ok).toBe(true);
    await expect(page.getByTestId("goods-total")).toHaveText("1080.00 USD");
    await expect(page.getByRole("region", { name: "报价版本差异" })).toContainText("100");
    await expect(page.getByRole("region", { name: "报价版本差异" })).toContainText("120");
    expect(
      (await compatibilityQuote(page, "付款改为30%预付、70%发货前付清，确认后30天交货")).ok,
    ).toBe(true);
    await expect(page.getByRole("heading", { name: "合成买家 · 草稿 V3" })).toBeVisible();
    expect(thirdHasHistory).toBe(true);
    await expect(page.getByRole("region", { name: "报价版本差异" })).toContainText("30%预付");
    await page.getByLabel("对比基准版本").selectOption({ label: "V1" });
    await expect(page.getByRole("heading", { name: "V1 → V3 差异" })).toBeVisible();
    await expect(page.getByRole("region", { name: "报价版本差异" })).toContainText("1080.00");
    const v3Checks = page.getByRole("region", { name: "报价 V3 规则检查" });
    await v3Checks.getByRole("button", { name: "检查并保存报告" }).click();
    await expect(v3Checks).toContainText("2 项待核实");
    await page.getByText("本版本回复草稿 · 未审核", { exact: true }).click();
    const reply = page.getByRole("region", { name: "报价 V3 客户回复草稿" });
    const replyText = reply.getByLabel("客户回复正文");
    await reply.getByText("内部核对依据", { exact: true }).click();
    await expect(reply.getByLabel("内部核对记录")).toHaveValue(/Saved check report:/);
    await expect(replyText).not.toHaveValue(/SHA-256|Saved check report:|\[pending\]/);
    await expect(replyText).toHaveValue(/1080.00 USD/);
    await expect(replyText).toHaveValue(/V3/);
    await expect(reply.getByLabel("内部核对记录")).toHaveValue(/\[pending\]/);
    const englishDraft = await replyText.inputValue();
    const beforeLanguageSwitch = await page.evaluate(() => window.tradequote.getTrade());
    await page.screenshot({ path: ".runtime/customer-reply-en.png" });
    await app.evaluate(({ clipboard }) => clipboard.writeText("SYNTHETIC-COPY-CONTROL"));
    await reply.getByRole("button", { name: "复制未审核草稿" }).click();
    await expect(
      page.getByText("已复制未审核草稿，请人工核对后使用", { exact: true }),
    ).toBeVisible();
    expect((await app.evaluate(({ clipboard }) => clipboard.readText())) === englishDraft).toBe(
      true,
    );
    expect(
      await page.evaluate(async () => {
        try {
          await navigator.clipboard.readText();
          return false;
        } catch {
          return true;
        }
      }),
    ).toBe(true);
    expect(
      await app.evaluate(async ({ BrowserWindow }) => {
        const main = BrowserWindow.getAllWindows()[0];
        if (!main) throw Error("main window missing");
        const other = new BrowserWindow({
          show: false,
          webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
        });
        try {
          await other.loadURL(main.webContents.getURL());
          return await other.webContents.executeJavaScript(
            "navigator.clipboard.writeText('SYNTHETIC-UNTRUSTED').then(()=>false,()=>true)",
          );
        } finally {
          other.destroy();
        }
      }),
    ).toBe(true);
    await reply.getByLabel("回复语言").selectOption("de");
    await expect(replyText).toHaveValue(/Angebot · V3/);
    await expect(replyText).toHaveValue(/Warenzwischensumme: 1080.00 USD/);
    await expect(reply.getByLabel("内部核对记录")).toHaveValue(/Nicht geprüfter Entwurf/);
    await expect(replyText).toHaveValue(/1080.00 USD/);
    await expect(replyText).toHaveValue(/30%预付/);
    await expect(reply.getByLabel("内部核对记录")).toHaveValue(/SHA-256/);
    await expect(replyText).not.toHaveValue(/SHA-256/);
    await expect(page.getByRole("button", { name: "提交人工审核" })).toBeDisabled();
    await reply.scrollIntoViewIfNeeded();
    await page.screenshot({ path: ".runtime/customer-reply-de.png" });
    const germanDraft = await replyText.inputValue();
    expect(germanDraft).not.toBe(englishDraft);
    await reply.getByRole("button", { name: "复制未审核草稿" }).click();
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe(germanDraft);
    await reply.getByLabel("回复语言").selectOption("en");
    await expect(replyText).toHaveValue(englishDraft);
    await reply.getByRole("button", { name: "复制未审核草稿" }).click();
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe(englishDraft);
    expect(await page.evaluate(() => window.tradequote.getTrade())).toEqual(beforeLanguageSwitch);
    const saved = await page.evaluate(() => window.tradequote.getTrade());
    if (!saved.ok) throw new Error("read failed");
    expect(saved.data.quotes).toHaveLength(3);
    expect(saved.data.turns).toHaveLength(3);
    const v1 = saved.data.quotes.find((q) => q.version === 1),
      v3 = saved.data.quotes.find((q) => q.version === 3);
    if (!v1 || !v3) throw new Error("versions missing");
    expect(v1.goodsTotal).toBe("900.00");
    await page.getByRole("region", { name: "报价版本差异" }).scrollIntoViewIfNeeded();
    while (await page.getByRole("button", { name: "关闭提示", exact: true }).count())
      await page.getByRole("button", { name: "关闭提示", exact: true }).first().click();
    await page.screenshot({ path: ".runtime/quote-agent-diff.png" });
    await page.getByLabel("选择报价与版本").selectOption(v1.id);
    await expect(page.getByRole("button", { name: "发送" })).toBeDisabled();
    await expect(page.getByTestId("goods-total")).toHaveText("900.00 USD");
    const v1Reply = page.getByRole("region", { name: "报价 V1 客户回复草稿" });
    await expect(v1Reply.getByLabel("客户回复正文")).toHaveValue(/900.00 USD/);
    await expect(v1Reply.getByLabel("内部核对记录")).toHaveValue(/No saved check report/);
    expect(saved.data.quotes.every((q) => q.status === "draft")).toBe(true);
    await page.getByLabel("选择报价与版本").selectOption(v3.id);
    mode = "invalid";
    expect((await compatibilityQuote(page, "交期改40天")).ok).toBe(false);
    await expect(page.getByRole("region", { name: "任务记录" })).toContainText(
      "模型建议未通过字段校验",
    );
    mode = "auth";
    const failedRun = page
      .getByRole("region", { name: "任务记录" })
      .locator(".conversation-turn")
      .filter({ hasText: "交期改40天" });
    await failedRun.getByRole("button", { name: "重试" }).click();
    await expect(failedRun).toContainText("模型鉴权失败");
    const after = await page.evaluate(() => window.tradequote.getTrade());
    expect(after.ok && after.data.quotes.length).toBe(3);
    expect(calls).toBe(6);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setContentSize(900, 640),
    );
    await page.getByRole("region", { name: "报价版本差异" }).scrollIntoViewIfNeeded();
    await expect(
      page.getByRole("navigation").getByRole("link", { name: "模型设置", exact: true }),
    ).toBeInViewport();
    await page.screenshot({ path: ".runtime/quote-agent-narrow.png" });
    await app.close();
    app = await launch();
    const reopened = await app.firstWindow();
    await reopened
      .getByRole("navigation")
      .getByRole("link", { name: "单据工作台", exact: true })
      .click();
    await reopened.getByText("手工填写报价", { exact: true }).click();
    await expect(reopened.getByRole("heading", { name: "合成买家 · 草稿 V3" })).toBeVisible();
    await expect(reopened.getByTestId("goods-total")).toHaveText("1080.00 USD");
    await expect(reopened.getByRole("region", { name: "任务记录" })).toContainText("数量改为120件");
    await reopened.getByText("本版本回复草稿 · 未审核", { exact: true }).click();
    await expect(
      reopened.getByRole("region", { name: "报价 V3 客户回复草稿" }).getByLabel("客户回复正文"),
    ).toHaveValue(englishDraft);
    await reopened
      .getByRole("navigation")
      .getByRole("link", { name: "模型设置", exact: true })
      .click();
    if (status.ok && status.data.storage === "encrypted")
      await expect(reopened.getByText(/凭据：已配置/)).toBeVisible();
    await reopened.getByRole("button", { name: "清除本机凭据" }).click();
    await expect(reopened.getByText("本机模型凭据已清除。")).toBeVisible();
    await reopened
      .getByRole("navigation")
      .getByRole("link", { name: "报价助手", exact: true })
      .click();
    await expect(reopened.getByRole("heading", { name: "报价助手 · 对话" })).toBeVisible();
    await expect(reopened.getByLabel("人设内容")).toBeVisible();
    await expect(reopened.locator(".pet-mascot")).toHaveAttribute("data-mood", "idle");
    await expect
      .poll(() =>
        reopened
          .locator(".pet-mascot")
          .evaluate(
            (image) =>
              image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
          ),
      )
      .toBe(true);
    await reopened.screenshot({ path: ".runtime/pet-companion.png" });
  } finally {
    await app.close();
    await new Promise<void>((r) => server.close(() => r()));
    await rm(data, { recursive: true, force: true });
  }
});
