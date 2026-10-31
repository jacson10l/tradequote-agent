// Explicit opt-in real-model rehearsal. No credential/database reads, traces,
// request bodies or network logs: all observations use the public desktop API.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { _electron as electron, expect } from "@playwright/test";
import { build } from "vite";

const mode = process.argv[2];
if (!["fixture", "deepseek"].includes(mode) || process.argv.length !== 3)
  throw Error("usage: node scripts/rehearse-hackathon.mjs fixture|deepseek");
const require = createRequire(resolve("apps/desktop/package.json"));
await mkdir(resolve(".runtime"), { recursive: true });
const root = await mkdtemp(resolve(`.runtime/hackathon-${mode}-`));
const data = join(root, "data");
await mkdir(data);
const csv = await readFile("wiki-project/demo_data/catalog_demo.csv", "utf8");
const hash = createHash("sha256").update(csv).digest("hex");
assert.equal(
  hash,
  "7c13afc110c1cd7a6e31eb0ef94f6c0acd08b164b2a9669e9aee11bc9f4bf89b",
  "frozen CSV changed; review and re-freeze before rehearsal",
);
const report = {
  status: "running",
  mode,
  syntheticData: true,
  humanKnowledgePublication: false,
  model: null,
  csv: { sourceCommit: "035e5f802d9dd1ec4e73ddf0ae3754b65e8b0c37", sha256: hash },
  startedAt: new Date().toISOString(),
  checks: [],
  videos: [],
};
const check = (name, details = {}) => {
  report.checks.push({ name, status: "passed", ...details });
  console.log(`PASS ${name}`);
};
let app;
let server;
let fixtureCalls = 0;
let savedV1;
let savedV3;
let english;
let german;
async function launch() {
  app = await electron.launch({
    executablePath: require("electron"),
    args: [
      resolve(
        mode === "deepseek"
          ? "tests/fixtures/rehearsal-host.cjs"
          : "apps/desktop/out/main/index.js",
      ),
    ],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "",
      ELECTRON_RENDERER_URL: "",
      TRADEQUOTE_TEST_DATA: mode === "fixture" ? data : "",
      TRADEQUOTE_TEST_MODEL_URL:
        mode === "fixture" ? `http://127.0.0.1:${server.address().port}` : "",
      TRADEQUOTE_REHEARSAL_DATA: mode === "deepseek" ? data : "",
    },
    timeout: 15000,
    recordVideo: { dir: join(root, "video"), size: { width: 1380, height: 900 } },
  });
  const page = await app.firstWindow();
  await page.waitForFunction(() => !!window.tradequote);
  return page;
}
async function close(page) {
  const video = page.video();
  await app.close();
  app = undefined;
  if (video) report.videos.push(await video.path());
}
async function capture(page, name, region) {
  await region.evaluate((element) => element.scrollIntoView({ block: "start" }));
  while (await page.getByRole("button", { name: "关闭提示", exact: true }).count())
    await page.getByRole("button", { name: "关闭提示", exact: true }).first().click();
  await page.screenshot({ path: join(root, `${name}.png`) });
  // Keep the key checkpoints readable in the backup video.
  await page.waitForTimeout(1800);
}
async function board(page) {
  const result = await page.evaluate(() => window.tradequote.getTrade());
  assert.equal(result.ok, true);
  return result.data;
}
async function checked(page, version, expected) {
  const region = page.getByRole("region", { name: `报价 V${version} 规则检查` });
  await region.getByRole("button", { name: "检查并保存报告" }).click();
  await expect(region).toContainText(expected);
  return region;
}
try {
  // This local HTTP adapter is only used by fixture mode. Real mode has neither
  // a replacement provider nor a route that could return canned model outputs.
  if (mode === "fixture") {
    server = createServer(async (req, res) => {
      fixtureCalls++;
      let body = "";
      for await (const chunk of req) body += chunk;
      const messages = JSON.parse(body).messages;
      const context = JSON.parse(messages.at(-1).content);
      const output =
        context.mode === "understand"
          ? {
              lines: [
                {
                  productId: context.products.find((p) => p.sku === "1601053415993").id,
                  quantity: "100",
                  unit: "piece",
                },
              ],
              payment: "",
              delivery: "",
              summary: "100件，条款待确认",
            }
          : context.instruction.includes("500")
            ? {
                patches: [
                  { op: "setQuantity", productId: context.lines[0].productId, quantity: "500" },
                ],
                summary: "数量改为500件",
              }
            : {
                patches: [
                  { op: "setPayment", value: "30%预付，70%发货前付清" },
                  { op: "setDelivery", value: "确认后30天交货" },
                ],
                summary: "补齐付款和交期",
              };
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          choices: [{ finish_reason: "stop", message: { content: JSON.stringify(output) } }],
        }),
      );
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
  }
  let page = await launch();
  const empty = await page.evaluate(() => window.tradequote.getWorkspace());
  assert.equal(empty.ok && empty.data === null, true, "fresh demo workspace required");
  check("fresh isolated workspace");
  const status = await page.evaluate(() =>
    window.tradequote.modelSettings({ method: "model.status" }),
  );
  if (mode === "deepseek")
    assert.equal(
      status.ok && status.data.hasKey,
      true,
      "configure model through the official settings UI first",
    );
  report.model = mode === "deepseek" ? status.data.model : "synthetic HTTP adapter";
  await page.getByRole("link", { name: "创建工作区", exact: true }).click();
  await page.getByLabel("工作区名称").fill(`合成黑客松彩排-${mode}`);
  await page.getByRole("button", { name: "创建工作区", exact: true }).click();
  await expect(page.getByText("已保存至本机 · 版本 1")).toBeVisible();
  if (mode === "fixture") {
    await page.getByRole("navigation").getByRole("link", { name: "模型设置", exact: true }).click();
    await page.getByLabel("DeepSeek API Key", { exact: false }).fill("synthetic-rehearsal-key");
    await page.getByRole("combobox", { name: "模型", exact: true }).selectOption("deepseek-flash");
    await page.getByRole("button", { name: "保存模型设置", exact: true }).click();
    await expect(page.getByLabel("DeepSeek API Key", { exact: false })).toHaveValue("");
  }
  await page.getByRole("link", { name: "资料与报价" }).click();
  await page.getByRole("button", { name: "保存演示场景" }).click();
  await expect(page.getByText("场景版本 1", { exact: true })).toBeVisible();
  await page.getByLabel("资料名称").fill("冻结合成演示 catalog_demo.csv");
  await page.getByLabel("资料性质").selectOption("synthetic");
  await page.getByLabel("CSV 原文").fill(csv);
  await page.getByRole("button", { name: "解析并预览" }).click();
  await expect(page.getByRole("table", { name: "CSV 导入预览" }).locator("tbody tr")).toHaveCount(
    14,
  );
  await page.getByRole("button", { name: "确认发布此批次" }).click();
  await expect(
    page.getByRole("checkbox", { name: "选择 1601053415993", exact: true }),
  ).toBeVisible();
  const imported = await board(page);
  assert.equal(imported.products.length, 4);
  assert.equal(imported.quotes.length, 0);
  check("14 rows / 4 SKUs imported via preview and explicit publish", { csvSha256: hash });
  await capture(page, "01-import", page.getByRole("table", { name: "CSV 导入预览" }));
  await close(page);

  // Existing A fixture, offline only: these are synthetic published projections,
  // not human review/publication evidence and not real supplier/platform rules.
  const tools = join(root, "fixture");
  await mkdir(tools);
  await symlink(
    resolve("packages/infrastructure/node_modules"),
    join(tools, "node_modules"),
    "dir",
  );
  await build({
    configFile: false,
    logLevel: "silent",
    build: {
      outDir: tools,
      emptyOutDir: false,
      target: "node24",
      minify: false,
      lib: {
        entry: resolve("tests/fixtures/quote-checks-data.ts"),
        formats: ["cjs"],
        fileName: () => "seed.cjs",
      },
      rollupOptions: { external: (id) => id.startsWith("node:") || id === "better-sqlite3" },
    },
  });
  const seed = spawnSync(require("electron"), [join(tools, "seed.cjs"), data, "seed"], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    encoding: "utf8",
  });
  assert.equal(seed.status, 0, "offline synthetic rule seed failed");
  const knowledge = JSON.parse(seed.stdout.trim());
  page = await launch();
  await page.getByRole("link", { name: "资料与报价" }).click();
  await page.getByLabel("询盘客户", { exact: true }).fill("合成演示买家");
  await page
    .getByLabel("交给模型理解的询盘")
    .fill(
      "请提供SKU 1601053415993的100件（piece）报价。付款条款和交货期尚未提供，请保持为空，不要推断。只选这一个SKU。",
    );
  await page.getByRole("button", { name: "理解询盘并保存 V1" }).click();
  await expect(page.getByTestId("goods-total")).toHaveText("3921.00 CNY", { timeout: 65000 });
  savedV1 = (await board(page)).quotes.find((q) => q.version === 1);
  assert.equal(savedV1.payment, "");
  assert.equal(savedV1.delivery, "");
  const v1Check = await checked(page, 1, "1 项阻断 · 1 项提醒 · 0 项待核实");
  await v1Check
    .getByRole("button", { name: "阻断 · 付款条款 · 【合成规则】合成付款条款缺失" })
    .click();
  await expect(v1Check.getByRole("region", { name: "付款条款", exact: true })).toBeFocused();
  const v1Reply = page.getByRole("region", { name: "报价 V1 客户回复草稿" });
  await expect(v1Reply.getByLabel("客户回复正文")).toHaveValue(/\[block\]/);
  for (const id of knowledge.sources)
    await expect(v1Reply.getByLabel("客户回复正文")).toHaveValue(new RegExp(id));
  check("V1 100 x 39.21 = 3921.00 CNY; paired rule feedback and fixed sources");
  await capture(page, "02-v1-block", v1Check);

  await page
    .getByLabel("本轮修改要求")
    .fill("把SKU 1601053415993数量从100件改为500件，其他字段不变。");
  await page.getByRole("button", { name: "理解修改并保存 V2" }).click();
  await expect(page.getByTestId("goods-total")).toHaveText("18605.00 CNY", { timeout: 65000 });
  await expect(page.getByRole("region", { name: "报价版本差异" })).toContainText("500");
  await checked(page, 2, "1 项阻断 · 1 项提醒 · 0 项待核实");
  check("V2 500 x 37.21 = 18605.00 CNY; tier change/diff/recheck");
  await capture(page, "03-v2-diff", page.getByRole("region", { name: "报价版本差异" }));

  await page
    .getByLabel("本轮修改要求")
    .fill("付款条款改为30%预付，70%发货前付清；交货期改为确认后30天交货；数量和商品不变。");
  await page.getByRole("button", { name: "理解修改并保存 V3" }).click();
  await expect(page.getByRole("heading", { name: "合成演示买家 · 草稿 V3" })).toBeVisible({
    timeout: 65000,
  });
  await expect(page.getByTestId("goods-total")).toHaveText("18605.00 CNY");
  const v3Check = await checked(page, 3, "0 项阻断 · 0 项提醒 · 0 项待核实");
  const current = await board(page);
  savedV3 = current.quotes.find((q) => q.version === 3);
  assert.equal(current.quotes.length, 3);
  assert.deepEqual(
    current.quotes.find((q) => q.version === 1),
    savedV1,
  );
  assert.equal(
    current.quotes.every((q) => q.status === "draft"),
    true,
  );
  check("V3 normal case; no rule issues; V1 immutable; all versions draft");
  await capture(page, "04-v3-clean", v3Check);
  const reply = page.getByRole("region", { name: "报价 V3 客户回复草稿" });
  const text = reply.getByLabel("客户回复正文");
  await expect(text).toHaveValue(/18605.00 CNY/);
  await expect(text).toHaveValue(/Unreviewed draft/);
  english = await text.inputValue();
  assert.equal(english.includes(hash), true, "english CSV hash");
  await capture(page, "05-en-reply", reply);
  await reply.getByLabel("回复语言").selectOption("de");
  await expect(text).toHaveValue(/Nicht geprüfter Entwurf/);
  german = await text.inputValue();
  assert.equal(german.includes(savedV3.payment), true, "German original payment");
  assert.equal(german.includes(savedV3.delivery), true, "German original delivery");
  assert.equal(german.includes(hash), true, "German CSV hash");
  // Compare booleans only: never expose the user's existing clipboard contents.
  await app.evaluate(({ clipboard }) => clipboard.writeText("SYNTHETIC-REHEARSAL-COPY-CONTROL"));
  await reply.getByRole("button", { name: "复制未审核草稿" }).click();
  await expect(page.getByText("已复制未审核草稿，请人工核对后使用", { exact: true })).toBeVisible();
  const copied = await app.evaluate(
    async ({ clipboard }, expected) => (await clipboard.readText()) === expected,
    german,
  );
  assert.equal(copied, true);
  await expect(page.getByRole("button", { name: "提交人工审核" })).toBeDisabled();
  check("EN/DE unreviewed drafts, unchanged amounts/terms/source hash, copy and approval closed");
  await capture(page, "06-de-reply", reply);
  await writeFile(join(root, "english-draft.txt"), english);
  await writeFile(join(root, "german-draft.txt"), german);
  await close(page);
  page = await launch();
  await page.getByRole("link", { name: "资料与报价" }).click();
  await expect(page.getByRole("heading", { name: "合成演示买家 · 草稿 V3" })).toBeVisible();
  const reopened = await board(page);
  assert.deepEqual(
    reopened.quotes.find((q) => q.version === 1),
    savedV1,
  );
  assert.deepEqual(
    reopened.quotes.find((q) => q.version === 3),
    savedV3,
  );
  await expect(
    page.getByRole("region", { name: "报价 V3 客户回复草稿" }).getByLabel("客户回复正文"),
  ).toHaveValue(english);
  await page.getByLabel("选择报价与版本").selectOption(savedV1.id);
  await expect(page.getByTestId("goods-total")).toHaveText("3921.00 CNY");
  await expect(
    page.getByRole("region", { name: "报价 V1 客户回复草稿" }).getByLabel("客户回复正文"),
  ).toHaveValue(/\[block\]/);
  check("reopen V3 and original V1 reports/drafts; no automatic model replay");
  if (mode === "fixture") assert.equal(fixtureCalls, 3);
  await capture(page, "07-reopen-v1", page.getByRole("region", { name: "报价 V1 客户回复草稿" }));
  await close(page);
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  // Assertions only concern synthetic UI data. Do not serialize arbitrary errors
  // (which might contain external response bodies or local paths).
  report.failure = {
    name: error instanceof Error ? error.name : "unknown",
    lastPassed: report.checks.at(-1)?.name ?? null,
  };
  console.error(`FAIL ${report.failure.name}; see lastPassed in report.json`);
  console.error(
    error instanceof Error
      ? error.stack
          ?.split("\n")
          .filter((line) => line.includes("rehearse-hackathon.mjs:"))
          .join("\n")
      : "",
  );
  process.exitCode = 1;
} finally {
  if (app) {
    const page = app.windows()[0];
    if (page) {
      await page.screenshot({ path: join(root, "failure.png") }).catch(() => {});
      await close(page).catch(() => {});
    } else await app.close().catch(() => {});
  }
  if (server) await new Promise((r) => server.close(r));
  report.finishedAt = new Date().toISOString();
  await writeFile(join(root, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Rehearsal artifacts: ${root}`);
}
