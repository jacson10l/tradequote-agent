import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  demoCatalogCsv,
  demoScenario,
  type TradeBoard,
  type TradeCommand,
  type TradeResult,
} from "@tradequote/contracts";
import { createTradeService } from "@tradequote/domain";
import Database from "better-sqlite3";
import { afterEach, expect, it } from "vitest";
import { parseCatalogCsv } from "./catalog-csv";
import { SqliteWorkspaceRepository } from "./index";
import { migrate, migrations } from "./migrations";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const common = () => ({
  schemaVersion: 1 as const,
  requestId: randomUUID(),
  idempotencyKey: randomUUID(),
});
const context = { actorId: "test-user", origin: "human_ui" as const };
function board(result: TradeResult): TradeBoard {
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "tradequote-v1-"));
  dirs.push(dir);
  const file = join(dir, "workspace.sqlite");
  const repo = new SqliteWorkspaceRepository(file);
  repo.commit(
    { ...common(), method: "workspace.create", payload: { name: "合成业务测试" } },
    context,
  );
  const service = createTradeService(repo);
  const run = (command: TradeCommand) => service.execute(command, context);
  const scenario = board(
    run({
      ...common(),
      method: "scenario.save",
      payload: { expectedVersion: 0, scenario: demoScenario },
    }),
  ).scenario;
  const batch = board(
    run({
      ...common(),
      method: "catalog.stage",
      payload: { csv: demoCatalogCsv, sourceName: "synthetic.csv", sourceStatus: "synthetic" },
    }),
  ).batches[0];
  if (!scenario || !batch) throw new Error("fixture");
  return { file, repo, run, scenario, batch };
}
it("stages without publishing, confirms once, calculates 900.00, retries once and reopens immutable snapshots", () => {
  const { file, repo, run, scenario, batch } = setup();
  try {
    expect(
      board(run({ schemaVersion: 1, requestId: randomUUID(), method: "trade.get" })).products,
    ).toHaveLength(0);
    const published = board(
      run({
        ...common(),
        method: "catalog.publish",
        payload: { batchId: batch.id, sourceHash: batch.sourceHash },
      }),
    );
    expect(published.products).toHaveLength(3);
    expect(
      board(
        run({
          ...common(),
          method: "catalog.publish",
          payload: { batchId: batch.id, sourceHash: batch.sourceHash },
        }),
      ).products,
    ).toHaveLength(3);
    const product = published.products.find((p) => p.sku === "DEMO-TEE");
    if (!product) throw new Error("fixture");
    const command: TradeCommand = {
      ...common(),
      method: "quote.createV1",
      payload: {
        scenarioId: scenario.id,
        buyer: "合成买家",
        inquiry: "询价100件",
        lines: [{ productId: product.id, quantity: "100", unit: "piece" }],
        payment: "",
        delivery: "",
      },
    };
    const first = run(command);
    expect(board(first).quotes[0]?.goodsTotal).toBe("900.00");
    expect(run({ ...command, requestId: randomUUID() })).toEqual(first);
    expect(run({ ...command, payload: { ...command.payload, buyer: "变更客户" } })).toMatchObject({
      ok: false,
      error: { code: "IDEMPOTENCY_CONFLICT" },
    });
    expect(
      board(
        run({
          ...common(),
          method: "scenario.save",
          payload: { expectedVersion: 1, scenario: { ...demoScenario, market: "其他市场" } },
        }),
      ).quotes[0]?.scenario.market,
    ).toBe(demoScenario.market);
    expect(run({ ...command, ...common() })).toMatchObject({
      ok: false,
      error: { code: "REVISION_CONFLICT" },
    });
    const db = new Database(file);
    try {
      expect(() => db.exec("UPDATE quote_v1 SET data_json='{}'")).toThrow("IMMUTABLE_QUOTE");
      expect(() => db.exec("DELETE FROM quote_v1")).toThrow("IMMUTABLE_QUOTE");
      const saved = db.prepare("SELECT data_json,content_hash FROM quote_v1").get() as {
        data_json: string;
        content_hash: string;
      };
      expect(createHash("sha256").update(saved.data_json).digest("hex")).toBe(saved.content_hash);
      expect(db.prepare("SELECT raw_csv FROM catalog_batch").get()).toEqual({
        raw_csv: demoCatalogCsv,
      });
    } finally {
      db.close();
    }
  } finally {
    repo.close();
  }
  const reopened = new SqliteWorkspaceRepository(file);
  try {
    const current = board(
      createTradeService(reopened).execute(
        { schemaVersion: 1, requestId: randomUUID(), method: "trade.get" },
        context,
      ),
    );
    expect(current.quotes).toHaveLength(1);
    expect(current.quotes[0]?.goodsTotal).toBe("900.00");
    expect(current.scenario?.market).toBe("其他市场");
    expect(current.quotes[0]?.scenario.market).toBe(demoScenario.market);
  } finally {
    reopened.close();
  }
});
it("refuses invalid publication, conflicting SKUs and rolls back publication when event insertion fails", () => {
  const { file, repo, run, batch } = setup();
  const db = new Database(file);
  try {
    expect(
      run({
        ...common(),
        method: "catalog.publish",
        payload: { batchId: batch.id, sourceHash: "0".repeat(64) },
      }),
    ).toMatchObject({ ok: false, error: { code: "SOURCE_CONFLICT" } });
    db.exec(
      "CREATE TRIGGER fail_event BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT, 'injected'); END;",
    );
    const command: TradeCommand = {
      ...common(),
      method: "catalog.publish",
      payload: { batchId: batch.id, sourceHash: batch.sourceHash },
    };
    expect(run(command)).toMatchObject({ ok: false, error: { code: "STORAGE_ERROR" } });
    expect(db.prepare("SELECT COUNT(*) AS n FROM catalog_product").get()).toEqual({ n: 0 });
    expect(
      db.prepare("SELECT key FROM idempotency WHERE key=?").get(command.idempotencyKey),
    ).toBeUndefined();
    db.exec("DROP TRIGGER fail_event");
    expect(run(command).ok).toBe(true);
    const duplicate = board(
      run({
        ...common(),
        method: "catalog.stage",
        payload: {
          csv: demoCatalogCsv.replace("10,", "11,"),
          sourceName: "duplicate.csv",
          sourceStatus: "synthetic",
        },
      }),
    ).batches[0];
    if (!duplicate) throw new Error("fixture");
    expect(
      run({
        ...common(),
        method: "catalog.publish",
        payload: { batchId: duplicate.id, sourceHash: duplicate.sourceHash },
      }),
    ).toMatchObject({ ok: false, error: { code: "SOURCE_CONFLICT" } });
    const invalid = board(
      run({
        ...common(),
        method: "catalog.stage",
        payload: { csv: "sku,name\nA,Missing", sourceName: "bad.csv", sourceStatus: "synthetic" },
      }),
    ).batches[0];
    if (!invalid) throw new Error("fixture");
    expect(
      run({
        ...common(),
        method: "catalog.publish",
        payload: { batchId: invalid.id, sourceHash: invalid.sourceHash },
      }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(
      board(run({ schemaVersion: 1, requestId: randomUUID(), method: "trade.get" })).products,
    ).toHaveLength(3);
  } finally {
    db.close();
    repo.close();
  }
});
it("deduplicates identical source bytes and preserves distinct evidence status", () => {
  const { repo, run } = setup();
  try {
    const payload = {
      csv: demoCatalogCsv,
      sourceName: "renamed.csv",
      sourceStatus: "synthetic" as const,
    };
    expect(board(run({ ...common(), method: "catalog.stage", payload })).batches).toHaveLength(1);
    expect(
      board(
        run({
          ...common(),
          method: "catalog.stage",
          payload: { ...payload, sourceStatus: "user_provided" },
        }),
      ).batches,
    ).toHaveLength(2);
  } finally {
    repo.close();
  }
});
it("migrates an existing workspace without rewriting its data", () => {
  const dir = mkdtempSync(join(tmpdir(), "tradequote-migrate-"));
  dirs.push(dir);
  const file = join(dir, "workspace.sqlite");
  const db = new Database(file);
  migrate(db, migrations.slice(0, 1));
  const id = randomUUID();
  db.prepare("INSERT INTO workspace VALUES (1,?,?,1,?)").run(
    id,
    "保留工作区",
    "2026-10-21T00:00:00.000Z",
  );
  db.close();
  const repo = new SqliteWorkspaceRepository(file);
  try {
    expect(repo.read()).toMatchObject({ id, name: "保留工作区" });
    expect(
      board(
        createTradeService(repo).execute(
          { schemaVersion: 1, requestId: randomUUID(), method: "trade.get" },
          context,
        ),
      ).quotes,
    ).toEqual([]);
  } finally {
    repo.close();
  }
});
it("parses quoted/multiline UTF-8 CSV and locates invalid rows, headers, dates and precision", () => {
  const header = demoCatalogCsv.split("\n")[0];
  const valid = parseCatalogCsv(
    `\uFEFF${header}\nA,"名字,中文",类型,kg,USD,1,0,2099-12-31,"两行\n说明"`,
  );
  expect(valid.issues).toEqual([]);
  expect(valid.rows[0]).toMatchObject({ name: "名字,中文", unitPrice: "0", row: 3 });
  for (const csv of [
    "sku,sku\nA,B",
    `${header}\nA,B,C,kg,USD,1,1.00001,2099-12-31,`,
    `${header}\nA,B,C,kg,USD,1,1,2026-02-30,`,
    `${header}\nA,B,C,kg,XYZ,1,1,2099-12-31,`,
    "\uFFFD",
    `${header}\n\"broken`,
  ])
    expect(parseCatalogCsv(csv).issues.length).toBeGreaterThan(0);
});

it("rolls back quote and retry record on outbox failure, then retries the same command", () => {
  const { file, repo, run, scenario, batch } = setup();
  const db = new Database(file);
  try {
    const published = board(
      run({
        ...common(),
        method: "catalog.publish",
        payload: { batchId: batch.id, sourceHash: batch.sourceHash },
      }),
    );
    const product = published.products.find((item) => item.sku === "DEMO-TEE");
    if (!product) throw new Error("fixture");
    const command: TradeCommand = {
      ...common(),
      method: "quote.createV1",
      payload: {
        scenarioId: scenario.id,
        buyer: "合成",
        inquiry: "报价",
        lines: [{ productId: product.id, quantity: "100", unit: "piece" }],
        payment: "",
        delivery: "",
      },
    };
    db.exec(
      "CREATE TRIGGER fail_quote_event BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT, 'injected'); END;",
    );
    expect(run(command)).toMatchObject({ ok: false, error: { code: "STORAGE_ERROR" } });
    expect(db.prepare("SELECT COUNT(*) AS n FROM quote_v1").get()).toEqual({ n: 0 });
    expect(
      db.prepare("SELECT key FROM idempotency WHERE key=?").get(command.idempotencyKey),
    ).toBeUndefined();
    db.exec("DROP TRIGGER fail_quote_event");
    expect(board(run(command)).quotes[0]?.goodsTotal).toBe("900.00");
    expect(board(run(command)).quotes).toHaveLength(1);
  } finally {
    db.close();
    repo.close();
  }
});
it("limits pasted CSV by UTF-8 bytes before storing a staged source", () => {
  const { repo, run } = setup();
  try {
    expect(
      run({
        ...common(),
        method: "catalog.stage",
        payload: { sourceName: "large.csv", sourceStatus: "synthetic", csv: "中".repeat(90000) },
      }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(
      board(run({ schemaVersion: 1, requestId: randomUUID(), method: "trade.get" })).batches,
    ).toHaveLength(1);
  } finally {
    repo.close();
  }
});
