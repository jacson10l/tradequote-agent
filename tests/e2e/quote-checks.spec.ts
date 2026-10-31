import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { build } from "vite";

const require = createRequire(resolve("apps/desktop/package.json"));
let toolsDirectory: string;
test.beforeAll(async () => {
  await mkdir(resolve(".runtime"), { recursive: true });
  toolsDirectory = await mkdtemp(resolve(".runtime/checks-fixture-"));
  await symlink(
    resolve("packages/infrastructure/node_modules"),
    join(toolsDirectory, "node_modules"),
    "dir",
  );
  await build({
    configFile: false,
    logLevel: "silent",
    build: {
      outDir: toolsDirectory,
      emptyOutDir: false,
      target: "node24",
      minify: false,
      lib: {
        entry: resolve("tests/fixtures/quote-checks-data.ts"),
        formats: ["cjs"],
        fileName: () => "fixture.cjs",
      },
      rollupOptions: { external: (id) => id.startsWith("node:") || id === "better-sqlite3" },
    },
  });
});
test.afterAll(async () => {
  await rm(toolsDirectory, { recursive: true, force: true });
});
function fixture(directory: string, action: string) {
  const result = spawnSync(
    require("electron"),
    [join(toolsDirectory, "fixture.cjs"), directory, action],
    { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, encoding: "utf8" },
  );
  if (result.status !== 0) throw Error(result.stderr);
  return JSON.parse(result.stdout.trim());
}
const launch = (directory: string) =>
  electron.launch({
    executablePath: require("electron"),
    args: [resolve("apps/desktop/out/main/index.js")],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "", TRADEQUOTE_TEST_DATA: directory },
  });

test("human saved-quote check persists both sources, paired feedback and immutable V1/V2 history across restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tq-desktop-checks-"));
  let app = await launch(directory);
  try {
    let page = await app.firstWindow();
    await page.getByRole("link", { name: "创建工作区", exact: true }).click();
    await page.getByLabel("工作区名称").fill("合成真实桌面检查");
    await page.getByRole("button", { name: "创建工作区", exact: true }).click();
    await expect(page.getByText("已保存至本机 · 版本 1")).toBeVisible();
    await page.getByRole("link", { name: "资料与报价" }).click();
    await page.getByRole("button", { name: "保存演示场景" }).click();
    await expect(page.getByText("场景版本 1", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "填入合成 CSV 样本" }).click();
    await page.getByRole("button", { name: "解析并预览" }).click();
    await page.getByRole("button", { name: "确认发布此批次" }).click();
    await page.getByLabel("客户名称").fill("合成检查买方");
    await page.getByLabel("原始询盘").fill("100件，付款和交期待人工确认");
    await page.getByRole("checkbox", { name: "选择 DEMO-TEE", exact: true }).check();
    await page.getByRole("textbox", { name: "DEMO-TEE 数量", exact: true }).fill("100");
    await page.getByRole("button", { name: "计算并保存报价 V1" }).click();
    await expect(page.getByTestId("goods-total")).toHaveText("900.00 USD");
    const initial = await page.evaluate(() => window.tradequote.getTrade());
    if (!initial.ok || !initial.data.quotes[0]) throw Error("saved quote missing");
    const v1 = initial.data.quotes[0];
    const checks = page.getByRole("region", { name: "报价 V1 规则检查" });
    await expect(checks).toContainText("当前版本尚无检查报告");
    // The explicit check with no eligible knowledge remains pending, and invents no consumption.
    await checks.getByRole("button", { name: "检查并保存报告" }).click();
    await expect(checks).toContainText("0 项阻断 · 0 项提醒 · 2 项待核实");
    await app.close();
    const pending = fixture(directory, "inspect");
    expect(pending.rows.quote_check_report).toHaveLength(1);
    expect(pending.rows.knowledge_consumption).toHaveLength(0);
    // A's actual review/publish service remains gated: use its clearly synthetic published fixture offline.
    const seeded = fixture(directory, "seed");
    app = await launch(directory);
    page = await app.firstWindow();
    await page.getByRole("link", { name: "资料与报价" }).click();
    const region = page.getByRole("region", { name: "报价 V1 规则检查" });
    await expect(region).toContainText("2 项待核实");
    await region.getByRole("button", { name: "检查并保存报告" }).click();
    await expect(region).toContainText("1 项阻断 · 1 项提醒 · 0 项待核实");
    const reply = page.getByRole("region", { name: "报价 V1 客户回复草稿" });
    await expect(reply.getByLabel("客户回复正文")).toHaveValue(/\[block\]/);
    await expect(reply.getByLabel("客户回复正文")).toHaveValue(/\[warning\]/);
    await expect(reply.getByLabel("客户回复正文")).toHaveValue(/Wiki /);
    for (const sourceId of seeded.sources)
      await expect(reply.getByLabel("客户回复正文")).toHaveValue(new RegExp(sourceId));
    const marker = region.getByRole("button", {
      name: "阻断 · 付款条款 · 【合成规则】合成付款条款缺失",
    });
    await marker.focus();
    await page.keyboard.press("Enter");
    const payment = region.getByRole("region", { name: "付款条款", exact: true });
    await expect(payment).toBeFocused();
    await expect(marker).toHaveAttribute("aria-pressed", "true");
    await expect(payment.getByRole("article")).toContainText("合成付款条款缺失");
    await payment.getByText("查看固定来源").click();
    await expect(payment.getByText(/来源 SHA-256/)).toHaveCount(2);
    await region.getByText("本报告采用的知识与来源 · 1 个知识段落", { exact: true }).click();
    for (const sourceId of seeded.sources)
      await expect(region.getByText(sourceId, { exact: true })).toBeVisible();
    const untrusted = await app.evaluate(
      async ({ BrowserWindow }, { revisionId, preload }) => {
        const trusted = BrowserWindow.getAllWindows()[0];
        if (!trusted) throw Error("main window missing");
        const other = new BrowserWindow({
          show: false,
          webPreferences: { preload, contextIsolation: true, nodeIntegration: false },
        });
        try {
          await other.loadURL(trusted.webContents.getURL());
          return await other.webContents.executeJavaScript(
            `window.tradequote.checkQuote({schemaVersion:1,requestId:crypto.randomUUID(),idempotencyKey:crypto.randomUUID(),method:"quote.check",payload:{revisionId:${JSON.stringify(revisionId)}}})`,
          );
        } finally {
          other.destroy();
        }
      },
      { revisionId: v1.id, preload: resolve("apps/desktop/out/preload/index.js") },
    );
    expect(untrusted).toMatchObject({ ok: false, error: { code: "ACTION_NOT_ALLOWED" } });
    const reports = await page.evaluate(
      (id) =>
        window.tradequote.getQuoteChecks({
          schemaVersion: 1,
          requestId: crypto.randomUUID(),
          method: "quote.getChecks",
          payload: { revisionId: id },
        }),
      v1.id,
    );
    if (!reports.ok) throw Error("reports missing");
    const saved = reports.data.find((r) => r.wikiCitations?.length);
    if (!saved) throw Error("published rule report missing");
    const operation = {
      schemaVersion: 1 as const,
      requestId: randomUUID(),
      idempotencyKey: randomUUID(),
      method: "quote.check" as const,
      payload: { revisionId: v1.id },
    };
    const first = await page.evaluate(
      (command) => window.tradequote.checkQuote(command),
      operation,
    );
    if (!first.ok) throw Error("check receipt missing");
    await page.setViewportSize({ width: 900, height: 640 });
    await region.scrollIntoViewIfNeeded();
    await page.screenshot({ path: ".runtime/quote-checks-narrow.png" });
    await app.close();
    const state = fixture(directory, "inspect");
    const consumption = state.rows.knowledge_consumption.map((r: { data_json: string }) =>
      JSON.parse(r.data_json),
    );
    const consumed = consumption.find(
      (r: { consumer: { revisionId: string } }) => r.consumer.revisionId === saved.reportId,
    );
    expect(consumed.citations).toEqual(saved.wikiCitations);
    expect(consumed.citations[0].sourceRefs).toHaveLength(2);
    expect(consumed.consumer.contentHash).toBe(
      createHash("sha256").update(JSON.stringify(saved)).digest("hex"),
    );
    const revised = fixture(directory, "revise").quote;
    app = await launch(directory);
    page = await app.firstWindow();
    await page.getByRole("link", { name: "资料与报价" }).click();
    const v2Checks = page.getByRole("region", { name: "报价 V2 规则检查" });
    await expect(v2Checks).toContainText("当前版本尚无检查报告");
    await v2Checks.getByRole("button", { name: "检查并保存报告" }).click();
    await expect(v2Checks).toContainText("0 项阻断 · 0 项提醒 · 0 项待核实");
    await expect(v2Checks).toContainText("仍需人工复核资料与审批");
    await expect(
      v2Checks.getByText("本报告采用的知识与来源 · 1 个知识段落", { exact: true }),
    ).toBeVisible();
    const revisedReply = page.getByRole("region", { name: "报价 V2 客户回复草稿" });
    await expect(revisedReply.getByLabel("客户回复正文")).toHaveValue(/Unreviewed draft/);
    await expect(revisedReply.getByLabel("客户回复正文")).not.toHaveValue(/\[block\]/);
    await expect(revisedReply.getByLabel("客户回复正文")).toHaveValue(/Saved check report:/);
    await expect(page.getByTestId("goods-total")).toHaveText("900.00 USD");
    await page.getByLabel("选择报价与版本").selectOption(v1.id);
    await expect(page.getByRole("region", { name: "报价 V1 规则检查" })).toContainText(
      "1 项阻断 · 1 项提醒",
    );
    expect(
      await page.evaluate((command) => window.tradequote.checkQuote(command), {
        ...operation,
        requestId: randomUUID(),
      }),
    ).toEqual(first);
    const reopened = await page.evaluate(() => window.tradequote.getTrade());
    expect(reopened.ok && reopened.data.quotes.find((q) => q.id === v1.id)).toEqual(v1);
    expect(reopened.ok && reopened.data.quotes.find((q) => q.id === revised.id)).toEqual(revised);
    await app.close();
    const after = fixture(directory, "inspect");
    expect(after.rows.quote_v1).toEqual(state.rows.quote_v1);
    expect(after.rows.quote_check_report.slice(0, state.rows.quote_check_report.length)).toEqual(
      state.rows.quote_check_report,
    );
    expect(after.rows.knowledge_consumption).toHaveLength(
      state.rows.knowledge_consumption.length + 1,
    );
    expect(after.rows.quote_check_report).toHaveLength(state.rows.quote_check_report.length + 1);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("desktop transaction failure saves no partial report, retries explicitly, and preserves old reports after source withdrawal", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tq-desktop-check-failure-"));
  fixture(directory, "seed");
  fixture(directory, "fail");
  const before = fixture(directory, "inspect");
  let app = await launch(directory);
  try {
    let page = await app.firstWindow();
    await page.getByRole("link", { name: "资料与报价" }).click();
    const region = page.getByRole("region", { name: "报价 V1 规则检查" });
    await expect(region).toContainText("当前版本尚无检查报告");
    await region.getByRole("button", { name: "检查并保存报告" }).click();
    await expect(page.getByRole("alert")).toContainText("本地检查报告读取或保存失败");
    await expect(region.getByRole("button", { name: "重试本次检查" })).toBeVisible();
    await expect(region.getByRole("group", { name: "风险标记" })).toHaveCount(0);
    await app.close();
    expect(fixture(directory, "inspect")).toEqual(before);
    fixture(directory, "repair");
    app = await launch(directory);
    page = await app.firstWindow();
    await page.getByRole("link", { name: "资料与报价" }).click();
    await page.getByRole("button", { name: "检查并保存报告" }).click();
    await expect(page.getByRole("region", { name: "报价 V1 规则检查" })).toContainText(
      "1 项阻断 · 1 项提醒",
    );
    const board = await page.evaluate(() => window.tradequote.getTrade());
    if (!board.ok || !board.data.quotes[0]) throw Error("quote missing");
    const quote = board.data.quotes[0];
    const history = await page.evaluate(
      (id) =>
        window.tradequote.getQuoteChecks({
          schemaVersion: 1,
          requestId: crypto.randomUUID(),
          method: "quote.getChecks",
          payload: { revisionId: id },
        }),
      quote.id,
    );
    await app.close();
    const committed = fixture(directory, "inspect");
    expect(committed.rows.quote_check_report).toHaveLength(1);
    expect(committed.rows.knowledge_consumption).toHaveLength(1);
    fixture(directory, "withdraw-source");
    app = await launch(directory);
    page = await app.firstWindow();
    await page.getByRole("link", { name: "资料与报价" }).click();
    const historical = page.getByRole("region", { name: "报价 V1 规则检查" });
    await expect(historical).toContainText("1 项阻断 · 1 项提醒");
    await historical.getByRole("button", { name: "检查并保存报告" }).click();
    await expect(page.getByRole("alert")).toContainText("知识版本或来源不一致");
    expect(
      await page.evaluate(
        (id) =>
          window.tradequote.getQuoteChecks({
            schemaVersion: 1,
            requestId: crypto.randomUUID(),
            method: "quote.getChecks",
            payload: { revisionId: id },
          }),
        quote.id,
      ),
    ).toEqual(history);
    await expect(historical).toContainText("1 项阻断 · 1 项提醒");
    await app.close();
    expect(fixture(directory, "inspect")).toEqual(committed);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
