import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const demoCatalogCsv =
  "sku,name,category,unit,currency,min_quantity,unit_price,valid_until,description\nDEMO-TEE,桌面测试上衣,合成服装,piece,USD,1,10,2099-12-31,脱敏合成样本\nDEMO-TEE,桌面测试上衣,合成服装,piece,USD,100,9,2099-12-31,脱敏合成样本";

const require = createRequire(resolve("apps/desktop/package.json"));
test("real desktop imports CSV with confirmation, saves deterministic V1 and reopens frozen evidence", async () => {
  const data = await mkdtemp(join(tmpdir(), "tradequote-v1-e2e-"));
  const fixture = join(data, "合成 商品.csv");
  await writeFile(fixture, demoCatalogCsv);
  const launch = () =>
    electron.launch({
      executablePath: require("electron") as string,
      args: [resolve("apps/desktop/out/main/index.js")],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "", TRADEQUOTE_TEST_DATA: data },
    });
  let app = await launch();
  try {
    const page = await app.firstWindow();
    await page.getByRole("link", { name: "创建工作区", exact: true }).click();
    await page.getByLabel("工作区名称").fill("报价 V1 合成演示");
    await page.getByRole("button", { name: "创建工作区", exact: true }).click();
    await expect(page.getByText("已保存至本机 · 版本 1")).toBeVisible();
    await page.getByRole("link", { name: "资料与报价" }).click();
    await page.getByRole("button", { name: "保存演示场景" }).click();
    await expect(page.getByText("场景版本 1", { exact: true })).toBeVisible();
    // Substitute only the OS picker interaction; main still reads/validates an actual UTF-8 file.
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, fixture);
    await page.getByRole("button", { name: "选择 CSV 文件" }).click();
    await expect(page.getByLabel("资料名称")).toHaveValue("合成 商品.csv");
    await expect(page.getByLabel("CSV 原文")).toHaveValue(demoCatalogCsv);
    await page.getByLabel("资料性质").selectOption("synthetic");
    await page.getByRole("button", { name: "解析并预览" }).click();
    await expect(page.getByRole("table", { name: "CSV 导入预览" })).toContainText("DEMO-TEE");
    await expect(page.getByRole("button", { name: "计算并保存报价 V1" })).toBeDisabled();
    await page.getByRole("button", { name: "确认发布此批次" }).click();
    await expect(page.getByRole("checkbox", { name: "选择 DEMO-TEE", exact: true })).toBeVisible();
    // Reimporting an older identical source selects that exact batch, not a newer invalid preview.
    await page.getByLabel("CSV 原文").fill("sku,name\nBROKEN,missing columns");
    await page.getByRole("button", { name: "解析并预览" }).click();
    await expect(page.getByRole("alert")).toContainText("列名须完整且唯一");
    await page.getByRole("button", { name: "选择 CSV 文件" }).click();
    await page.getByLabel("资料性质").selectOption("synthetic");
    await page.getByRole("button", { name: "解析并预览" }).click();
    await expect(page.getByRole("table", { name: "CSV 导入预览" })).toContainText("DEMO-TEE");
    await expect(page.getByRole("button", { name: "确认发布此批次" })).toBeDisabled();
    await page.getByLabel("客户名称").fill("合成海外买家");
    await page.getByLabel("原始询盘").fill("请提供100件上衣报价，包装和运费待确认。");
    await page.getByRole("checkbox", { name: "选择 DEMO-TEE", exact: true }).check();
    await page.getByRole("textbox", { name: "DEMO-TEE 数量", exact: true }).fill("100");
    await page.getByRole("button", { name: "计算并保存报价 V1" }).click();
    await expect(page.getByTestId("goods-total")).toHaveText("900.00 USD");
    await expect(page.getByRole("article", { name: "已保存报价详情" })).toContainText(
      "付款条款待确认",
    );
    await expect(page.getByRole("article", { name: "已保存报价详情" })).toContainText("原文行 3");
    await expect(page.getByRole("button", { name: "提交人工审核" })).toBeDisabled();
    await page.getByRole("button", { name: "计算并保存报价 V1" }).click();
    await expect(page.getByText("报价草稿 V1 已保存至本机", { exact: true })).toBeVisible();
    const count = await page.evaluate(async () => {
      const result = await window.tradequote.getTrade();
      return result.ok ? result.data.quotes.length : -1;
    });
    expect(count).toBe(1);
    const injection = await page.evaluate(async () => {
      const result = await window.tradequote.getTrade();
      if (!result.ok || !result.data.scenario || !result.data.products[0]) return true;
      const invoke = window.tradequote.createQuoteV1 as (
        input: unknown,
      ) => Promise<{ ok: boolean }>;
      return (
        await invoke({
          schemaVersion: 1,
          requestId: crypto.randomUUID(),
          idempotencyKey: crypto.randomUUID(),
          method: "quote.createV1",
          payload: {
            scenarioId: result.data.scenario.id,
            buyer: "invalid",
            inquiry: "invalid",
            payment: "",
            delivery: "",
            lines: [
              {
                productId: result.data.products[0].id,
                quantity: "1",
                unit: result.data.products[0].unit,
              },
            ],
            goodsTotal: "0",
          },
        })
      ).ok;
    });
    expect(injection).toBe(false);
    await page.getByLabel("目标市场").fill("其他演示市场");
    await page.getByRole("button", { name: "保存演示场景" }).click();
    await expect(page.getByText("场景版本 2", { exact: true })).toBeVisible();
    await expect(page.getByRole("article", { name: "已保存报价详情" })).toContainText(
      "德国（演示市场）",
    );
    await page.getByRole("article", { name: "已保存报价详情" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: ".runtime/quote-v1-saved.png" });
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setContentSize(900, 640);
    });
    await page.getByRole("button", { name: "提交人工审核" }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("link", { name: "资料与报价" })).toBeInViewport();
    await page.screenshot({ path: ".runtime/quote-v1-narrow.png" });
    await app.close();
    app = await launch();
    const reopened = await app.firstWindow();
    await reopened.getByRole("link", { name: "资料与报价" }).click();
    await expect(reopened.getByTestId("goods-total")).toHaveText("900.00 USD");
    await expect(reopened.getByLabel("目标市场")).toHaveValue("其他演示市场");
    await expect(reopened.getByRole("article", { name: "已保存报价详情" })).toContainText(
      "德国（演示市场）",
    );
    await reopened.getByRole("button", { name: "确认发布此批次" }).scrollIntoViewIfNeeded();
    await expect(reopened.getByRole("button", { name: "确认发布此批次" })).toBeDisabled();
  } finally {
    await app.close();
    await rm(data, { recursive: true, force: true });
  }
});

// Frozen from A 11826e4, catalog_demo.csv; technical demo input, provenance unverified.
const frozenCatalogCsv =
  'sku,name,category,unit,currency,min_quantity,unit_price,valid_until,description\n1601053415993,95% 棉5% 氨纶平纹圆领t恤街装180gsm空白超大健身房t恤,Men-T-Shirt,piece,CNY,3,43.19,2027-12-31,"克重:180; 材质:95% Cotton, 5% Spandex; page sold: 296; page certs: CE; page fabric weight: 180克; 供应商:Guangzhou Hengdong Sports Goods Co., Ltd.; 来源:https://www.alibaba.com/product-detail/95-Cotton-5-Spandex-Plain-Crewneck_1601053415993.html; 采集日期:2026-10-21"\n1601053415993,95% 棉5% 氨纶平纹圆领t恤街装180gsm空白超大健身房t恤,Men-T-Shirt,piece,CNY,50,41.20,2027-12-31,"克重:180; 材质:95% Cotton, 5% Spandex; page sold: 296; page certs: CE; page fabric weight: 180克; 供应商:Guangzhou Hengdong Sports Goods Co., Ltd.; 来源:https://www.alibaba.com/product-detail/95-Cotton-5-Spandex-Plain-Crewneck_1601053415993.html; 采集日期:2026-10-21"\n1601053415993,95% 棉5% 氨纶平纹圆领t恤街装180gsm空白超大健身房t恤,Men-T-Shirt,piece,CNY,100,39.21,2027-12-31,"克重:180; 材质:95% Cotton, 5% Spandex; page sold: 296; page certs: CE; page fabric weight: 180克; 供应商:Guangzhou Hengdong Sports Goods Co., Ltd.; 来源:https://www.alibaba.com/product-detail/95-Cotton-5-Spandex-Plain-Crewneck_1601053415993.html; 采集日期:2026-10-21"\n1601053415993,95% 棉5% 氨纶平纹圆领t恤街装180gsm空白超大健身房t恤,Men-T-Shirt,piece,CNY,500,37.21,2027-12-31,"克重:180; 材质:95% Cotton, 5% Spandex; page sold: 296; page certs: CE; page fabric weight: 180克; 供应商:Guangzhou Hengdong Sports Goods Co., Ltd.; 来源:https://www.alibaba.com/product-detail/95-Cotton-5-Spandex-Plain-Crewneck_1601053415993.html; 采集日期:2026-10-21"\n1601926123092,批发高品质 195Gsm 定制徽标空白棉质和涤纶男式 Polo T 恤男女通用印花衬衫,Men-Polo,piece,CNY,5,24.92,2027-12-31,"克重:195; 材质:Polyester/Cotton (ratio not stated on page); page fabric weight: 195克; 供应商:Xiamen Wanhuayuan Cultural Media Co., Ltd.; 来源:https://www.alibaba.com/product-detail/Wholesale-High-Quality-195Gsm-Custom-Logo_1601926123092.html; 采集日期:2026-10-21"\n1601926123092,批发高品质 195Gsm 定制徽标空白棉质和涤纶男式 Polo T 恤男女通用印花衬衫,Men-Polo,piece,CNY,500,23.46,2027-12-31,"克重:195; 材质:Polyester/Cotton (ratio not stated on page); page fabric weight: 195克; 供应商:Xiamen Wanhuayuan Cultural Media Co., Ltd.; 来源:https://www.alibaba.com/product-detail/Wholesale-High-Quality-195Gsm-Custom-Logo_1601926123092.html; 采集日期:2026-10-21"\n1601926123092,批发高品质 195Gsm 定制徽标空白棉质和涤纶男式 Polo T 恤男女通用印花衬衫,Men-Polo,piece,CNY,1000,22.20,2027-12-31,"克重:195; 材质:Polyester/Cotton (ratio not stated on page); page fabric weight: 195克; 供应商:Xiamen Wanhuayuan Cultural Media Co., Ltd.; 来源:https://www.alibaba.com/product-detail/Wholesale-High-Quality-195Gsm-Custom-Logo_1601926123092.html; 采集日期:2026-10-21"\n1601926123092,批发高品质 195Gsm 定制徽标空白棉质和涤纶男式 Polo T 恤男女通用印花衬衫,Men-Polo,piece,CNY,10000,21.00,2027-12-31,"克重:195; 材质:Polyester/Cotton (ratio not stated on page); page fabric weight: 195克; 供应商:Xiamen Wanhuayuan Cultural Media Co., Ltd.; 来源:https://www.alibaba.com/product-detail/Wholesale-High-Quality-195Gsm-Custom-Logo_1601926123092.html; 采集日期:2026-10-21"\nMDF-001,3mm/6mm/12mm Melamine Faced MDF Board for Furniture,Board-MDF,m2,USD,100,3.50,2027-12-31,"厚度:3mm/6mm/12mm; 基材:MDF; 表面:三聚氰胺贴膜; 规格:1220x2440mm; 环保:E1; 用途:家具; 供应商:Lisen Wood Industrial Shouguang Co., Ltd.; 来源:https://www.alibaba.com/product-detail/_1600000001.html; 采集日期:2026-10-29"\nMDF-001,3mm/6mm/12mm Melamine Faced MDF Board for Furniture,Board-MDF,m2,USD,500,3.20,2027-12-31,"厚度:3mm/6mm/12mm; 基材:MDF; 表面:三聚氰胺贴膜; 规格:1220x2440mm; 环保:E1; 用途:家具; 供应商:Lisen Wood Industrial Shouguang Co., Ltd.; 来源:https://www.alibaba.com/product-detail/_1600000001.html; 采集日期:2026-10-29"\nMDF-001,3mm/6mm/12mm Melamine Faced MDF Board for Furniture,Board-MDF,m2,USD,1000,2.95,2027-12-31,"厚度:3mm/6mm/12mm; 基材:MDF; 表面:三聚氰胺贴膜; 规格:1220x2440mm; 环保:E1; 用途:家具; 供应商:Lisen Wood Industrial Shouguang Co., Ltd.; 来源:https://www.alibaba.com/product-detail/_1600000001.html; 采集日期:2026-10-29"\nBOLT-001,Galvanized Steel Full Thread Hex Bolt Astm M8 M16 Class 4.8,Hardware-Fastener,kg,USD,1,1.30,2027-12-31,"规格:M8/M16; 材质:镀锌钢; 等级:4.8; 标准:Astm; 全螺纹; 产地:CN河北邯郸; 供应商:Handan Zhengfan Fasteners Co., Ltd.; 来源:https://www.alibaba.com/product-detail/_1600000009.html; 采集日期:2026-10-29"\nBOLT-001,Galvanized Steel Full Thread Hex Bolt Astm M8 M16 Class 4.8,Hardware-Fastener,kg,USD,5,1.10,2027-12-31,"规格:M8/M16; 材质:镀锌钢; 等级:4.8; 标准:Astm; 全螺纹; 产地:CN河北邯郸; 供应商:Handan Zhengfan Fasteners Co., Ltd.; 来源:https://www.alibaba.com/product-detail/_1600000009.html; 采集日期:2026-10-29"\nBOLT-001,Galvanized Steel Full Thread Hex Bolt Astm M8 M16 Class 4.8,Hardware-Fastener,kg,USD,10,0.95,2027-12-31,"规格:M8/M16; 材质:镀锌钢; 等级:4.8; 标准:Astm; 全螺纹; 产地:CN河北邯郸; 供应商:Handan Zhengfan Fasteners Co., Ltd.; 来源:https://www.alibaba.com/product-detail/_1600000009.html; 采集日期:2026-10-29"\n';

// Only the isolated test database is changed; production main/worker/save paths remain real.
function quoteDatabase(directory: string, sql?: string) {
  const source = `
    const Database = require(process.argv[1]);
    const db = new Database(process.argv[2]);
    try {
      if (process.argv[3]) db.exec(process.argv[3]);
      const tables = ['quote_v1', 'outbox', 'idempotency'];
      console.log(JSON.stringify(Object.fromEntries(tables.map(t => [t, db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()]))));
    } finally { db.close(); }
  `;
  const result = spawnSync(
    require("electron"),
    [
      "-e",
      source,
      require.resolve("better-sqlite3"),
      join(directory, "workspaces/default/workspace.sqlite"),
      sql ?? "",
    ],
    { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, encoding: "utf8" },
  );
  if (result.status !== 0) throw Error(result.stderr);
  return JSON.parse(result.stdout);
}

test("frozen catalog form rolls back a failed save, retries once, prevents duplicates and reopens exact quotes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "c-quote-form-retry-"));
  const launch = () =>
    electron.launch({
      executablePath: require("electron"),
      args: [resolve("apps/desktop/out/main/index.js")],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "", TRADEQUOTE_TEST_DATA: directory },
    });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await page.getByRole("link", { name: "创建工作区", exact: true }).click();
    await page.getByLabel("工作区名称").fill("C冻结样本表单回归");
    await page.getByRole("button", { name: "创建工作区", exact: true }).click();
    await expect(page.getByText("已保存至本机 · 版本 1")).toBeVisible();
    await page.getByRole("link", { name: "资料与报价" }).click();
    await page.getByRole("button", { name: "保存演示场景" }).click();
    await expect(page.getByText("场景版本 1", { exact: true })).toBeVisible();
    await page.getByLabel("资料名称").fill("catalog_demo.csv · 固定11826e4");
    await page.getByLabel("CSV 原文").fill(frozenCatalogCsv);
    await page.getByLabel("资料性质").selectOption("synthetic");
    await page.getByRole("button", { name: "解析并预览" }).click();
    await expect(page.getByRole("table", { name: "CSV 导入预览" }).locator("tbody tr")).toHaveCount(
      14,
    );
    await page.getByRole("button", { name: "确认发布此批次" }).click();
    await expect(page.getByRole("checkbox", { name: "选择 MDF-001", exact: true })).toBeVisible();
    await page.getByLabel("客户名称").fill("隔离技术测试买方");
    await page.getByLabel("原始询盘").fill("技术演示，来源和条款均待人工核对");
    const save = page.getByRole("button", { name: "计算并保存报价 V1" });
    const cases = [
      { sku: "1601053415993", quantity: "100", amount: "3921.00", currency: "CNY" },
      { sku: "1601926123092", quantity: "500", amount: "11730.00", currency: "CNY" },
      { sku: "MDF-001", quantity: "500", amount: "1600.00", currency: "USD" },
      { sku: "BOLT-001", quantity: "10", amount: "9.50", currency: "USD" },
    ];
    for (const [index, item] of cases.entries()) {
      if (index)
        await page
          .getByRole("checkbox", { name: `选择 ${cases[index - 1]!.sku}`, exact: true })
          .uncheck();
      await page.getByRole("checkbox", { name: `选择 ${item.sku}`, exact: true }).check();
      await page
        .getByRole("textbox", { name: `${item.sku} 数量`, exact: true })
        .fill(item.quantity);
      if (index === 0) {
        // AFTER INSERT forces rollback after the quote row was actually attempted.
        const before = quoteDatabase(
          directory,
          "CREATE TRIGGER synthetic_quote_failure AFTER INSERT ON quote_v1 BEGIN SELECT RAISE(ABORT,'synthetic quote failure'); END",
        );
        await save.click();
        await expect(page.getByRole("alert").filter({ hasText: "本地保存失败" })).toBeVisible();
        expect(quoteDatabase(directory)).toEqual(before);
        await expect(page.getByTestId("goods-total")).toHaveCount(0);
        await expect(page.getByLabel("客户名称")).toHaveValue("隔离技术测试买方");
        await expect(
          page.getByRole("textbox", { name: `${item.sku} 数量`, exact: true }),
        ).toHaveValue(item.quantity);
        quoteDatabase(directory, "DROP TRIGGER synthetic_quote_failure");
      }
      await save.click();
      await expect(page.getByTestId("goods-total")).toHaveText(`${item.amount} ${item.currency}`);
      const first = quoteDatabase(directory);
      expect(first.quote_v1).toHaveLength(index + 1);
      // A second explicit click reuses the accepted operation; no extra receipt/event/row.
      await save.click();
      await expect(page.getByText("报价草稿 V1 已保存至本机", { exact: true })).toBeVisible();
      expect(quoteDatabase(directory)).toEqual(first);
    }
    // Changing the selection to mixed currency must preserve saved results and every prior receipt.
    await page.getByRole("checkbox", { name: "选择 1601053415993", exact: true }).check();
    await page.getByRole("textbox", { name: "1601053415993 数量", exact: true }).fill("100");
    const beforeMixed = quoteDatabase(directory);
    await save.click();
    await expect(
      page.getByRole("alert").filter({ hasText: "同一草稿只能包含同币种商品" }),
    ).toBeVisible();
    await expect(page.getByTestId("goods-total")).toHaveText("9.50 USD");
    expect(quoteDatabase(directory)).toEqual(beforeMixed);
    const snapshot = await page.evaluate(() => window.tradequote.getTrade());
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.getByRole("link", { name: "资料与报价" }).click();
    await expect(page.getByRole("checkbox", { name: "选择 MDF-001", exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.tradequote.getTrade())).toEqual(snapshot);
    expect(quoteDatabase(directory)).toEqual(beforeMixed);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
