import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { demoCatalogCsv, demoScenario, type TradeCommand } from "@tradequote/contracts";
import Database from "better-sqlite3";
import { afterEach, expect, it, vi } from "vitest";
import { CatalogQuoteReadAgent } from "./catalog-quote-read-agent";
import { DeepSeekProvider, type ModelMessage } from "./deepseek";
import { SqliteWorkspaceRepository } from "./index";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const fn of cleanup.splice(0).reverse()) fn();
});
const asOf = "2026-10-21T00:00:00.000Z";
const env = () => ({
  schemaVersion: 1 as const,
  requestId: randomUUID(),
  idempotencyKey: randomUUID(),
});
const actor = { actorId: "synthetic-test", origin: "human_ui" as const };
const done = { kind: "complete", summary: "已读取真实本地业务数据，未保存新报价" };
const action = (name: string, input: unknown) => ({ kind: "tool", name, input });

function fixture(csv = demoCatalogCsv) {
  const dir = mkdtempSync(join(tmpdir(), "tq-c02b-"));
  const file = join(dir, "fixture.sqlite");
  const repo = new SqliteWorkspaceRepository(file);
  cleanup.push(() => {
    repo.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const workspace = repo.commit(
    { ...env(), method: "workspace.create", payload: { name: "合成工作区" } },
    actor,
  );
  if (!workspace.ok || !workspace.data) throw new Error("workspace fixture");
  const workspaceId = workspace.data.id;
  const execute = (command: TradeCommand) => {
    const result = repo.executeTrade(command, actor);
    if (!result.ok) throw new Error("trade fixture");
    return result.data;
  };
  const read = () => execute({ schemaVersion: 1, requestId: randomUUID(), method: "trade.get" });
  const scenario = execute({
    ...env(),
    method: "scenario.save",
    payload: { expectedVersion: 0, scenario: demoScenario },
  }).scenario;
  if (!scenario) throw new Error("scenario fixture");
  const stage = (value: string) => {
    const board = execute({
      ...env(),
      method: "catalog.stage",
      payload: { csv: value, sourceName: "synthetic.csv", sourceStatus: "synthetic" },
    });
    const batch = board.batches.find(
      (b) => b.rows.some((r) => value.includes(r.sku)) && b.status === "staged",
    );
    if (!batch) throw new Error("batch fixture");
    return batch;
  };
  const publish = (value: string) => {
    const batch = stage(value);
    return execute({
      ...env(),
      method: "catalog.publish",
      payload: { batchId: batch.id, sourceHash: batch.sourceHash },
    });
  };
  const board = publish(csv);
  const product = board.products.find((p) => p.sku === "DEMO-TEE");
  if (!product) throw new Error("product fixture");
  const input = {
    scenarioId: scenario.id,
    buyer: "合成买家",
    inquiry: "报价100件",
    lines: [{ productId: product.id, quantity: "100", unit: product.unit }],
    payment: "",
    delivery: "",
  };
  const quote = execute({ ...env(), method: "quote.createV1", payload: input }).quotes[0];
  if (!quote) throw new Error("quote fixture");
  const state = () => {
    const db = new Database(file, { readonly: true });
    try {
      return JSON.stringify(
        [
          "workspace",
          "scenario_revision",
          "catalog_batch",
          "catalog_product",
          "quote_v1",
          "quote_revision",
          "agent_turn",
          "idempotency",
          "outbox",
        ].map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()),
      );
    } finally {
      db.close();
    }
  };
  return {
    repo,
    workspaceId,
    execute,
    read,
    publish,
    stage,
    product,
    scenario,
    input,
    quote,
    state,
  };
}
type Fixture = ReturnType<typeof fixture>;
type Scope = ConstructorParameters<typeof CatalogQuoteReadAgent>[2];
function agent(
  f: Fixture,
  json: (messages: ModelMessage[], signal?: AbortSignal) => Promise<unknown>,
  scope: Partial<Scope> = {},
) {
  return new CatalogQuoteReadAgent(
    f.repo,
    { json },
    { workspaceId: f.workspaceId, asOf, quoteRevisionIds: [f.quote.id], ...scope },
  );
}
async function query(f: Fixture, name: string, input: unknown, scope: Partial<Scope> = {}) {
  const json = vi.fn().mockResolvedValueOnce(action(name, input)).mockResolvedValueOnce(done);
  const outcome = await agent(f, json, scope).run("读取业务数据");
  return { outcome, result: outcome.observations[0]?.result, json };
}

it("uses HTTP provider -> real catalog/product/quote/pricing tools with evidence and no database writes", async () => {
  const f = fixture();
  const before = f.state();
  const actions = [
    action("search_catalog", { query: "DEMO-TEE" }),
    action("get_product_revisions", { productIds: [f.product.id] }),
    action("get_quote", { revisionId: f.quote.id }),
    action("calculate_quote", { ...f.input, lines: [{ ...f.input.lines[0], quantity: "120" }] }),
    done,
  ];
  const requests: { messages: ModelMessage[] }[] = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    requests.push(JSON.parse(body));
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify(actions.shift()) } }],
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server fixture");
    const provider = new DeepSeekProvider(
      { key: "synthetic-key", model: "synthetic-model" },
      fetch,
      `http://127.0.0.1:${address.port}`,
    );
    const outcome = await new CatalogQuoteReadAgent(f.repo, provider, {
      workspaceId: f.workspaceId,
      asOf,
      quoteRevisionIds: [f.quote.id],
    }).run("查商品、读报价并核算120件");
    expect(outcome).toMatchObject({
      outcome: "completed",
      toolCalls: 4,
      workspaceId: f.workspaceId,
      asOf,
    });
    expect(outcome.observations[0]?.result).toMatchObject({
      ok: true,
      data: { items: [f.product] },
      evidenceIds: [f.product.id, f.product.batchId],
    });
    expect(outcome.observations[1]?.result).toMatchObject({
      ok: true,
      data: { products: [f.product] },
    });
    expect(outcome.observations[2]?.result).toMatchObject({
      ok: true,
      data: { quote: f.quote, isLatest: true },
    });
    expect(outcome.observations[3]?.result).toMatchObject({
      ok: true,
      data: {
        kind: "calculation_preview",
        calculation: {
          goodsTotal: "1080.00",
          lines: [
            {
              unitPrice: "9",
              amount: "1080.00",
              product: {
                sourceHash: f.product.sourceHash,
                tiers: [{ sourceRow: 2 }, { sourceRow: 3 }],
              },
            },
          ],
        },
      },
    });
    const preview = JSON.parse(JSON.stringify(outcome.observations[3]?.result)).data.calculation;
    for (const key of ["id", "number", "version", "status"])
      expect(preview).not.toHaveProperty(key);
    expect(requests).toHaveLength(5);
    const first = JSON.stringify(requests[0]?.messages);
    expect(first).toContain("readableQuotes");
    expect(first).not.toContain("raw_csv");
    expect(first).not.toContain("Bearer synthetic-key");
    expect(f.state()).toBe(before);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it("distinguishes empty successful search from missing IDs and excludes staged sources", async () => {
  const f = fixture();
  f.stage(
    demoCatalogCsv.split("\n")[0] +
      "\nSTAGED,未发布商品,其他,piece,USD,1,99,2099-12-31,不要转发这段暂存原文",
  );
  const before = f.state();
  expect((await query(f, "search_catalog", { query: "STAGED" })).result).toMatchObject({
    ok: true,
    data: { items: [], nextAfterId: null },
    evidenceIds: [],
  });
  expect(
    (await query(f, "get_product_revisions", { productIds: [randomUUID()] })).result,
  ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  const category = await query(f, "search_catalog", { category: "服装" });
  expect(category.result).toMatchObject({ ok: true, data: { items: [f.product] } });
  expect(JSON.stringify(category.outcome)).not.toContain("不要转发这段暂存原文");
  expect(f.state()).toBe(before);
});

it("paginates the real published catalog stably without duplicates", async () => {
  const f = fixture();
  let calls = 0;
  const json = vi.fn().mockImplementation(async (messages: ModelMessage[]) => {
    calls++;
    if (calls === 1) return action("search_catalog", { limit: 1 });
    const page = JSON.parse(messages.at(-1)?.content ?? "").toolResult.data.data;
    return page.nextAfterId === null
      ? done
      : action("search_catalog", { limit: 1, afterId: page.nextAfterId });
  });
  const outcome = await agent(f, json).run("分页读取全部商品");
  const ids = outcome.observations.flatMap((o) =>
    JSON.parse(JSON.stringify(o.result)).data.items.map((p: { id: string }) => p.id),
  );
  expect(ids).toEqual(
    f
      .read()
      .products.map((p) => p.id)
      .sort(),
  );
  expect(new Set(ids).size).toBe(3);
  expect((await query(f, "search_catalog", { afterId: randomUUID() })).result).toMatchObject({
    ok: false,
    error: { code: "VALIDATION_ERROR" },
  });
});

it("enforces host product/quote scope and rejects model workspace, amount and date injection", async () => {
  const f = fixture();
  const other = fixture();
  expect((await query(f, "search_catalog", {}, { productIds: [] })).result).toMatchObject({
    ok: true,
    data: { items: [] },
  });
  expect(
    (await query(f, "get_product_revisions", { productIds: [f.product.id] }, { productIds: [] }))
      .result,
  ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  expect(
    (await query(f, "get_quote", { revisionId: f.quote.id }, { quoteRevisionIds: [] })).result,
  ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  expect((await query(f, "get_quote", { revisionId: other.quote.id })).result).toMatchObject({
    ok: false,
    error: { code: "NOT_FOUND" },
  });
  const json = vi.fn();
  await expect(
    agent(f, json, { workspaceId: other.workspaceId }).run("读取"),
  ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
  expect(json).not.toHaveBeenCalled();
  for (const [name, input] of [
    ["search_catalog", { workspaceId: other.workspaceId }],
    ["get_product_revisions", { productIds: [f.product.id, f.product.id] }],
    ["get_quote", { revisionId: f.quote.id, path: "/anywhere" }],
    ["calculate_quote", { ...f.input, goodsTotal: "0" }],
    ["calculate_quote", { ...f.input, asOf: "2000-01-01" }],
  ] as const)
    await expect(query(f, name, input)).rejects.toMatchObject({ code: "MODEL_INVALID_OUTPUT" });
});

it("returns exact immutable V1/V2 snapshots without repricing historical quotes", async () => {
  const f = fixture();
  const revision = f.repo.commitAgent(
    {
      ...env(),
      method: "agent.revise",
      payload: { baseId: f.quote.id, expectedVersion: 1, instruction: "改为120件" },
    },
    {
      patches: [{ op: "setQuantity", productId: f.product.id, quantity: "120" }],
      summary: "120件",
    },
    "synthetic-model",
  );
  if (!revision.ok) throw new Error("revision fixture");
  const v2 = revision.data.quotes.find((q) => q.version === 2);
  if (!v2) throw new Error("revision fixture");
  const before = f.state();
  expect(
    (await query(f, "get_quote", { revisionId: f.quote.id }, { asOf: "2100-01-01T00:00:00.000Z" }))
      .result,
  ).toMatchObject({ ok: true, data: { quote: f.quote, isLatest: false } });
  expect(
    (await query(f, "get_quote", { revisionId: v2.id }, { quoteRevisionIds: [v2.id] })).result,
  ).toMatchObject({ ok: true, data: { quote: v2, isLatest: true } });
  expect(f.quote.goodsTotal).toBe("900.00");
  expect(v2.goodsTotal).toBe("1080.00");
  expect(f.state()).toBe(before);
});

it.each([
  ["99", "990.00"],
  ["100", "900.00"],
  ["120", "1080.00"],
])(
  "delegates %s-piece preview to existing pricing and returns %s without persistence",
  async (quantity, total) => {
    const f = fixture();
    const before = f.state();
    const { result } = await query(f, "calculate_quote", {
      ...f.input,
      lines: [{ productId: f.product.id, quantity, unit: "piece" }],
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        kind: "calculation_preview",
        asOf,
        calculation: { goodsTotal: total, createdAt: asOf },
      },
    });
    expect(f.state()).toBe(before);
  },
);

it("preserves unknown, zero, MOQ and expired prices while the host controls calculation time", async () => {
  const f = fixture(
    demoCatalogCsv + "\nDEMO-ZERO,合成免费样本,其他,piece,USD,1,0,2099-12-31,零价不是未知",
  );
  const missing = f.read().products.find((p) => p.sku === "DEMO-FASTENER");
  const zero = f.read().products.find((p) => p.sku === "DEMO-ZERO");
  if (!missing || !zero) throw new Error("price fixtures");
  const before = f.state();
  for (const [product, quantity, expected] of [
    [missing, "1", null],
    [zero, "1", "0.00"],
    [f.product, "0.5", null],
  ] as const) {
    expect(
      (
        await query(f, "calculate_quote", {
          ...f.input,
          lines: [{ productId: product.id, quantity, unit: product.unit }],
        })
      ).result,
    ).toMatchObject({ ok: true, data: { calculation: { goodsTotal: expected } } });
  }
  expect(
    (await query(f, "calculate_quote", f.input, { asOf: "2100-01-01T00:00:00.000Z" })).result,
  ).toMatchObject({
    ok: true,
    data: {
      calculation: {
        goodsTotal: null,
        lines: [{ unitPrice: null, reason: "价目表已过期，须重新确认资料" }],
      },
    },
  });
  expect((await query(f, "calculate_quote", f.input, { productIds: [] })).result).toMatchObject({
    ok: false,
    error: { code: "NOT_FOUND" },
  });
  expect(f.state()).toBe(before);
});

it("pins one snapshot per run and discovers newly published products only in the next run", async () => {
  const f = fixture();
  const json = vi
    .fn()
    .mockImplementationOnce(async () => {
      f.publish(
        demoCatalogCsv.split("\n")[0] +
          "\nNEW-SKU,新发布商品,其他,piece,USD,1,2,2099-12-31,下一次任务才可见",
      );
      return action("search_catalog", {});
    })
    .mockResolvedValueOnce(done);
  const outcome = await agent(f, json).run("查询");
  expect(JSON.stringify(outcome.observations)).not.toContain("NEW-SKU");
  expect((await query(f, "search_catalog", { query: "NEW-SKU" })).result).toMatchObject({
    ok: true,
    data: { items: [{ sku: "NEW-SKU" }] },
  });
});

it("registers no knowledge/rule handlers and does not pretend missing services returned empty results", async () => {
  const f = fixture();
  for (const name of ["search_knowledge", "validate_quote"]) {
    const json = vi.fn().mockResolvedValue(action(name, {}));
    await expect(agent(f, json).run("查询")).rejects.toMatchObject({ code: "ACTION_NOT_ALLOWED" });
    const messages: ModelMessage[] = json.mock.calls[0]?.[0];
    expect(messages[0]?.content).not.toContain(`"name":"${name}"`);
    expect(JSON.parse(messages[2]?.content ?? "").hostContext.unavailableTools).toContain(name);
    expect(json).toHaveBeenCalledTimes(1);
  }
});

it("distinguishes redacted storage failure from an empty page and stops reading after a workspace change", async () => {
  const f = fixture();
  let reads = 0;
  const repository = {
    read: () => {
      if (++reads >= 3) throw new Error("SECRET storage error");
      return f.repo.read();
    },
    executeTrade: f.repo.executeTrade.bind(f.repo),
  };
  const json = vi
    .fn()
    .mockResolvedValueOnce(action("search_catalog", {}))
    .mockResolvedValueOnce(done);
  const outcome = await new CatalogQuoteReadAgent(
    repository,
    { json },
    { workspaceId: f.workspaceId, asOf, quoteRevisionIds: [] },
  ).run("读取");
  expect(outcome.observations[0]?.result).toMatchObject({
    ok: false,
    error: { code: "STORAGE_ERROR" },
  });
  expect(JSON.stringify(outcome)).not.toContain("SECRET");
  let changed = false;
  const changingRepository = {
    read: () => {
      const workspace = f.repo.read();
      return workspace && changed ? { ...workspace, id: randomUUID() } : workspace;
    },
    executeTrade: f.repo.executeTrade.bind(f.repo),
  };
  const changingJson = vi
    .fn()
    .mockImplementationOnce(async () => {
      changed = true;
      return action("get_quote", { revisionId: f.quote.id });
    })
    .mockResolvedValueOnce(done);
  const changedOutcome = await new CatalogQuoteReadAgent(
    changingRepository,
    { json: changingJson },
    { workspaceId: f.workspaceId, asOf, quoteRevisionIds: [f.quote.id] },
  ).run("读取");
  expect(changedOutcome.observations[0]?.result).toMatchObject({
    ok: false,
    error: { code: "REVISION_CONFLICT" },
  });
});

it("does not read storage for pre-cancelled work or advertise pricing without a saved scenario", async () => {
  const repo = { read: vi.fn().mockReturnValue(null), executeTrade: vi.fn() };
  const json = vi.fn();
  const empty = new CatalogQuoteReadAgent(
    repo,
    { json },
    { workspaceId: randomUUID(), asOf, quoteRevisionIds: [] },
  );
  const controller = new AbortController();
  controller.abort();
  await expect(empty.run("查询", controller.signal)).rejects.toMatchObject({ code: "CANCELLED" });
  expect(repo.read).not.toHaveBeenCalled();
  await expect(empty.run("查询")).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(json).not.toHaveBeenCalled();
  const dir = mkdtempSync(join(tmpdir(), "tq-c02b-empty-"));
  const real = new SqliteWorkspaceRepository(join(dir, "test.sqlite"));
  cleanup.push(() => {
    real.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const result = real.commit(
    { ...env(), method: "workspace.create", payload: { name: "尚无场景" } },
    actor,
  );
  if (!result.ok || !result.data) throw new Error("empty fixture");
  const model = vi.fn().mockResolvedValue(action("calculate_quote", {}));
  await expect(
    new CatalogQuoteReadAgent(
      real,
      { json: model },
      { workspaceId: result.data.id, asOf, quoteRevisionIds: [] },
    ).run("核价"),
  ).rejects.toMatchObject({ code: "ACTION_NOT_ALLOWED" });
  expect(model.mock.calls[0]?.[0]?.[0]?.content).not.toContain('"name":"calculate_quote"');
});
