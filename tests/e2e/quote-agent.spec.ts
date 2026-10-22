import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

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
    await page.getByRole("button", { name: "保存演示场景" }).click();
    await expect(page.getByText("场景版本 1", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "填入合成 CSV 样本" }).click();
    await page.getByRole("button", { name: "解析并预览" }).click();
    await expect(page.getByRole("table", { name: "CSV 导入预览" })).toBeVisible();
    await page.getByRole("button", { name: "确认发布此批次" }).click();
    await expect(page.getByRole("checkbox", { name: "选择 DEMO-TEE", exact: true })).toBeVisible();
    await page.getByLabel("询盘客户", { exact: true }).fill("合成买家");
    await page
      .getByLabel("交给模型理解的询盘")
      .fill("请提供100件 DEMO-TEE 报价，付款和交期待确认。");
    await page.getByRole("button", { name: "理解询盘并保存 V1" }).click();
    await expect(page.getByTestId("goods-total")).toHaveText("900.00 USD");
    await page.getByLabel("本轮修改要求").fill("数量改为120件");
    await page.getByRole("button", { name: "理解修改并保存 V2" }).click();
    await expect(page.getByTestId("goods-total")).toHaveText("1080.00 USD");
    await expect(page.getByRole("region", { name: "报价版本差异" })).toContainText("100");
    await expect(page.getByRole("region", { name: "报价版本差异" })).toContainText("120");
    await page.getByLabel("本轮修改要求").fill("付款改为30%预付、70%发货前付清，确认后30天交货");
    await page.getByRole("button", { name: "理解修改并保存 V3" }).click();
    await expect(page.getByRole("heading", { name: "合成买家 · 草稿 V3" })).toBeVisible();
    expect(thirdHasHistory).toBe(true);
    await expect(page.getByRole("region", { name: "报价版本差异" })).toContainText("30%预付");
    await page.getByLabel("对比基准版本").selectOption({ label: "V1" });
    await expect(page.getByRole("heading", { name: "V1 → V3 差异" })).toBeVisible();
    await expect(page.getByRole("region", { name: "报价版本差异" })).toContainText("1080.00");
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
    await expect(page.getByRole("button", { name: "理解修改并保存 V2" })).toBeDisabled();
    await expect(page.getByTestId("goods-total")).toHaveText("900.00 USD");
    await page.getByLabel("选择报价与版本").selectOption(v3.id);
    mode = "invalid";
    await page.getByLabel("本轮修改要求").fill("交期改40天");
    await page.getByRole("button", { name: "理解修改并保存 V4" }).click();
    await expect(page.getByRole("alert")).toContainText("模型建议未通过字段校验");
    mode = "auth";
    const failedRun = page
      .getByRole("region", { name: "模型运行记录" })
      .getByRole("article")
      .filter({ hasText: "交期改40天" });
    await failedRun.getByRole("button", { name: "重试此运行（会再次调用模型）" }).click();
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
    await reopened.getByRole("link", { name: "资料与报价" }).click();
    await expect(reopened.getByRole("heading", { name: "合成买家 · 草稿 V3" })).toBeVisible();
    await expect(reopened.getByTestId("goods-total")).toHaveText("1080.00 USD");
    await expect(reopened.getByRole("region", { name: "DeepSeek 询盘与对话" })).toContainText(
      "数量改为120件",
    );
    await reopened
      .getByRole("navigation")
      .getByRole("link", { name: "模型设置", exact: true })
      .click();
    if (status.ok && status.data.storage === "encrypted")
      await expect(reopened.getByText(/凭据：已配置/)).toBeVisible();
    await reopened.getByRole("button", { name: "清除本机凭据" }).click();
    await expect(reopened.getByText("本机模型凭据已清除。")).toBeVisible();
  } finally {
    await app.close();
    await new Promise<void>((r) => server.close(() => r()));
    await rm(data, { recursive: true, force: true });
  }
});
