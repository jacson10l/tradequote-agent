import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AgentCommand,
  demoCatalogCsv,
  demoScenario,
  type TradeCommand,
  type TradeResult,
} from "@tradequote/contracts";
import { TradeFault } from "@tradequote/domain";
import Database from "better-sqlite3";
import { afterEach, expect, it, vi } from "vitest";
import { AgentExecutor } from "./agent-executor";
import { DeepSeekProvider } from "./deepseek";
import { SqliteWorkspaceRepository } from "./index";
import { migrate, migrations } from "./migrations";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const fn of cleanup.splice(0).reverse()) fn();
});
const env = () => ({
  schemaVersion: 1 as const,
  requestId: randomUUID(),
  idempotencyKey: randomUUID(),
});
const actor = { actorId: "test", origin: "human_ui" as const };
const creds = { key: "synthetic-test-key", model: "synthetic-model" };
function data(result: TradeResult) {
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "tq-agent-"));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, "test.sqlite");
  let repo = new SqliteWorkspaceRepository(file);
  cleanup.push(() => repo.close());
  repo.commit({ ...env(), method: "workspace.create", payload: { name: "合成" } }, actor);
  const run = (command: TradeCommand) => data(repo.executeTrade(command, actor));
  const scenario = run({
    ...env(),
    method: "scenario.save",
    payload: { expectedVersion: 0, scenario: demoScenario },
  }).scenario;
  const batch = run({
    ...env(),
    method: "catalog.stage",
    payload: { csv: demoCatalogCsv, sourceName: "合成.csv", sourceStatus: "synthetic" },
  }).batches[0];
  if (!scenario || !batch) throw new Error("fixture");
  const product = run({
    ...env(),
    method: "catalog.publish",
    payload: { batchId: batch.id, sourceHash: batch.sourceHash },
  }).products.find((p) => p.sku === "DEMO-TEE");
  if (!product) throw new Error("fixture");
  const command: AgentCommand = {
    ...env(),
    method: "agent.understand",
    payload: { scenarioId: scenario.id, buyer: "合成买家", inquiry: "请报价100件 DEMO-TEE" },
  };
  const understanding = {
    lines: [{ productId: product.id, quantity: "100", unit: "piece" }],
    payment: "",
    delivery: "",
    summary: "识别100件，条款未知",
  };
  const read = () => run({ schemaVersion: 1, requestId: randomUUID(), method: "trade.get" });
  return {
    file,
    repo,
    run,
    read,
    command,
    understanding,
    product,
    reopen: () => {
      repo.close();
      repo = new SqliteWorkspaceRepository(file);
      return repo;
    },
  };
}
it("understands, saves immutable V1/V2/V3 with independent monetary expectations, history, replay and reopen", async () => {
  const f = fixture();
  const json = vi
    .fn()
    .mockResolvedValueOnce(f.understanding)
    .mockResolvedValueOnce({
      patches: [{ op: "setQuantity", productId: f.product.id, quantity: "120" }],
      summary: "120件",
    })
    .mockResolvedValueOnce({
      patches: [
        { op: "setPayment", value: "30%预付" },
        { op: "setDelivery", value: "确认后30天" },
      ],
      summary: "更新条款",
    });
  const agent = new AgentExecutor(f.repo, () => ({ json }));
  const first = await agent.execute(f.command, creds);
  const v1 = data(first).quotes[0];
  if (!v1) throw new Error("missing");
  expect(v1.goodsTotal).toBe("900.00");
  const secondCommand: AgentCommand = {
    ...env(),
    method: "agent.revise",
    payload: { baseId: v1.id, expectedVersion: 1, instruction: "改成120件" },
  };
  const second = await agent.execute(secondCommand, creds);
  const v2 = data(second).quotes[0];
  if (!v2) throw new Error("missing");
  expect(v2).toMatchObject({ version: 2, parentId: v1.id, rootId: v1.id, goodsTotal: "1080.00" });
  const third = await agent.execute(
    {
      ...env(),
      method: "agent.revise",
      payload: { baseId: v2.id, expectedVersion: 2, instruction: "30%预付，确认后30天交货" },
    },
    creds,
  );
  const v3 = data(third).quotes[0];
  expect(v3).toMatchObject({
    version: 3,
    goodsTotal: "1080.00",
    payment: "30%预付",
    delivery: "确认后30天",
  });
  expect(data(third).quotes.find((q) => q.id === v1.id)).toEqual(v1);
  expect(data(third).turns).toHaveLength(3);
  expect(await agent.execute({ ...secondCommand, requestId: randomUUID() }, creds)).toEqual(second);
  expect(json).toHaveBeenCalledTimes(3);
  const prompt = JSON.stringify(json.mock.calls[2]);
  expect(prompt).toContain("改成120件");
  expect(prompt).not.toContain('"unitPrice"');
  expect(prompt).not.toContain(creds.key);
  const db = new Database(f.file);
  try {
    expect(() => db.exec("DELETE FROM quote_revision")).toThrow("IMMUTABLE_QUOTE");
    expect(() => db.exec("UPDATE agent_turn SET data_json='{}'")).toThrow("IMMUTABLE_TURN");
    for (const row of db.prepare("SELECT data_json,content_hash FROM quote_revision").all() as {
      data_json: string;
      content_hash: string;
    }[])
      expect(createHash("sha256").update(row.data_json).digest("hex")).toBe(row.content_hash);
  } finally {
    db.close();
  }
  const reopened = f.reopen();
  expect(f.read().quotes).toHaveLength(3);
  expect(f.read().turns).toHaveLength(3);
  expect(await new AgentExecutor(reopened, () => ({ json })).execute(secondCommand)).toEqual(
    second,
  );
});
it("invalid model fields, wrong units, fabricated products, missing facts and provider errors never write quotes", async () => {
  const f = fixture();
  for (const output of [
    { ...f.understanding, goodsTotal: "1" },
    { ...f.understanding, lines: [{ productId: f.product.id, quantity: "0", unit: "piece" }] },
    { ...f.understanding, lines: [{ productId: f.product.id, quantity: "1", unit: "kg" }] },
    { ...f.understanding, lines: [{ productId: randomUUID(), quantity: "1", unit: "piece" }] },
    { clarification: "请补充数量" },
  ]) {
    const agent = new AgentExecutor(f.repo, () => ({ json: async () => output }));
    expect((await agent.execute(f.command, creds)).ok).toBe(false);
    expect(f.read().quotes).toHaveLength(0);
    expect(f.read().turns).toHaveLength(0);
  }
  for (const code of ["MODEL_AUTH_FAILED", "MODEL_RATE_LIMITED", "MODEL_TIMEOUT"] as const) {
    const agent = new AgentExecutor(f.repo, () => ({
      json: async () => {
        throw new TradeFault(code, "合成错误");
      },
    }));
    expect(await agent.execute(f.command, creds)).toMatchObject({ ok: false, error: { code } });
  }
  expect(f.read().quotes).toHaveLength(0);
});
it("deduplicates in-flight requests, rejects conflicting keys, rechecks stale versions after model latency", async () => {
  const f = fixture();
  const first = data(
    await new AgentExecutor(f.repo, () => ({ json: async () => f.understanding })).execute(
      f.command,
      creds,
    ),
  ).quotes[0];
  if (!first) throw new Error("fixture");
  let resolve: (v: unknown) => void = () => {};
  const json = vi.fn(
    () =>
      new Promise<unknown>((r) => {
        resolve = r;
      }),
  );
  const agent = new AgentExecutor(f.repo, () => ({ json }));
  const command: AgentCommand = {
    ...env(),
    method: "agent.revise",
    payload: { baseId: first.id, expectedVersion: 1, instruction: "数量120" },
  };
  const p1 = agent.execute(command, creds);
  const p2 = agent.execute({ ...command, requestId: randomUUID() }, creds);
  expect(
    await agent.execute(
      { ...command, payload: { ...command.payload, instruction: "别的" } },
      creds,
    ),
  ).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_CONFLICT" } });
  const other = await new AgentExecutor(f.repo, () => ({
    json: async () => ({
      patches: [{ op: "setQuantity", productId: f.product.id, quantity: "110" }],
      summary: "110",
    }),
  })).execute({ ...command, ...env() }, creds);
  expect(other.ok).toBe(true);
  resolve({
    patches: [{ op: "setQuantity", productId: f.product.id, quantity: "120" }],
    summary: "120",
  });
  expect(await p1).toMatchObject({ ok: false, error: { code: "REVISION_CONFLICT" } });
  expect(await p2).toEqual(await p1);
  expect(json).toHaveBeenCalledTimes(1);
  expect(f.read().quotes).toHaveLength(2);
  expect(await agent.execute({ ...command, ...env() }, creds)).toMatchObject({
    ok: false,
    error: { code: "REVISION_CONFLICT" },
  });
  expect(json).toHaveBeenCalledTimes(1);
});
it("rolls back quote, dialogue, audit and idempotency together then safely retries", async () => {
  const f = fixture();
  const db = new Database(f.file);
  const agent = new AgentExecutor(f.repo, () => ({ json: async () => f.understanding }));
  try {
    db.exec(
      "CREATE TRIGGER fail_agent BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT,'injected'); END;",
    );
    expect(await agent.execute(f.command, creds)).toMatchObject({
      ok: false,
      error: { code: "STORAGE_ERROR" },
    });
    expect(f.read().quotes).toHaveLength(0);
    expect(f.read().turns).toHaveLength(0);
    expect(f.repo.agentReplay(f.command)).toBeNull();
    db.exec("DROP TRIGGER fail_agent");
    expect((await agent.execute(f.command, creds)).ok).toBe(true);
  } finally {
    db.close();
  }
});
it("migration 3 preserves stored V1 bytes", () => {
  const dir = mkdtempSync(join(tmpdir(), "tq-old-v1-"));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, "old.sqlite");
  const db = new Database(file);
  try {
    migrate(db, migrations.slice(0, 2));
    // Legacy row bytes are untouched even when later snapshots use a broader read schema.
    const id = randomUUID();
    db.prepare("INSERT INTO workspace VALUES (1,?,?,1,?)").run(
      id,
      "legacy",
      "2026-10-21T00:00:00.000Z",
    );
    const scenario = randomUUID();
    db.prepare("INSERT INTO scenario_revision VALUES (?,?,1,?)").run(scenario, id, "{}");
    const original = ' { "legacy": true } ';
    db.prepare("INSERT INTO quote_v1 VALUES (?,?,?,?,?)").run(
      randomUUID(),
      id,
      scenario,
      "frozen-hash",
      original,
    );
    migrate(db);
    expect(db.pragma("user_version", { simple: true })).toBe(7);
    expect(db.prepare("SELECT data_json,content_hash FROM quote_v1").get()).toEqual({
      data_json: original,
      content_hash: "frozen-hash",
    });
  } finally {
    db.close();
  }
});
it("refuses no-op and duplicate/foreign patches without creating V2", async () => {
  const f = fixture();
  const v1 = data(
    await new AgentExecutor(f.repo, () => ({ json: async () => f.understanding })).execute(
      f.command,
      creds,
    ),
  ).quotes[0];
  if (!v1) throw new Error("fixture");
  for (const patches of [
    [{ op: "setQuantity", productId: f.product.id, quantity: "100" }],
    [
      { op: "setPayment", value: "a" },
      { op: "setPayment", value: "b" },
    ],
    [{ op: "setQuantity", productId: randomUUID(), quantity: "120" }],
    [{ op: "approve" }],
  ]) {
    const agent = new AgentExecutor(f.repo, () => ({
      json: async () => ({ patches, summary: "合成" }),
    }));
    expect(
      (
        await agent.execute(
          {
            ...env(),
            method: "agent.revise",
            payload: { baseId: v1.id, expectedVersion: 1, instruction: "修改" },
          },
          creds,
        )
      ).ok,
    ).toBe(false);
  }
  expect(f.read().quotes).toHaveLength(1);
});

it("cancels all waiters of one operation, blocks a late proposal and permits an explicit same-key retry", async () => {
  const f = fixture();
  let resolve: (value: unknown) => void = () => {};
  let signal: AbortSignal | undefined;
  const json = vi.fn((_messages: unknown, cancellation?: AbortSignal) => {
    signal = cancellation;
    return new Promise<unknown>((r) => {
      resolve = r;
    });
  });
  const agent = new AgentExecutor(f.repo, () => ({ json }));
  const first = agent.execute(f.command, creds);
  const duplicate = agent.execute({ ...f.command, requestId: randomUUID() }, creds);
  expect(agent.cancel(randomUUID())).toBe(false);
  expect(agent.cancel(f.command.idempotencyKey)).toBe(true);
  expect(signal?.aborted).toBe(true);
  expect(agent.cancel(f.command.idempotencyKey)).toBe(false);
  // Deliberately ignore the network signal: the executor must still reject this output.
  resolve(f.understanding);
  expect(await first).toMatchObject({ ok: false, error: { code: "CANCELLED" } });
  expect(await duplicate).toEqual(await first);
  expect(json).toHaveBeenCalledTimes(1);
  expect(f.read().quotes).toHaveLength(0);
  expect(f.read().turns).toHaveLength(0);
  expect(f.repo.agentReplay(f.command)).toBeNull();
  const retry = agent.execute(f.command, creds);
  expect(signal?.aborted).toBe(false);
  resolve(f.understanding);
  expect((await retry).ok).toBe(true);
  expect(json).toHaveBeenCalledTimes(2);
  expect(f.read().quotes).toHaveLength(1);
});

it("maps an abort rejection to cancellation without writing or exposing provider secrets", async () => {
  const f = fixture();
  const agent = new AgentExecutor(f.repo, () => ({
    json: (_messages, signal) =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new Error("SECRET transport detail")), {
          once: true,
        });
      }),
  }));
  const pending = agent.execute(f.command, creds);
  expect(agent.cancel(f.command.idempotencyKey)).toBe(true);
  const result = await pending;
  expect(result).toMatchObject({ ok: false, error: { code: "CANCELLED" } });
  expect(JSON.stringify(result)).not.toContain("SECRET");
  expect(f.read().quotes).toHaveLength(0);
  expect(f.read().turns).toHaveLength(0);
});

it.each([
  ["timeout", "MODEL_TIMEOUT"],
  ["cancel", "CANCELLED"],
] as const)(
  "preserves the provider's first abort cause when %s happens first",
  async (first, code) => {
    const f = fixture();
    const timeout = new AbortController();
    const deadline = vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeout.signal);
    let rejectTransport: () => void = () => {};
    const transport = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectTransport = () => reject(new Error("synthetic transport abort"));
        }),
    );
    const provider = new DeepSeekProvider(creds, transport);
    const json = vi.spyOn(provider, "json");
    const agent = new AgentExecutor(f.repo, () => provider);
    try {
      const pending = agent.execute(f.command, creds);
      if (first === "timeout") {
        timeout.abort(new DOMException("synthetic deadline", "TimeoutError"));
        expect(agent.cancel(f.command.idempotencyKey)).toBe(true);
      } else {
        expect(agent.cancel(f.command.idempotencyKey)).toBe(true);
        timeout.abort(new DOMException("synthetic deadline", "TimeoutError"));
      }
      rejectTransport();
      await expect(json.mock.results[0]?.value).rejects.toMatchObject({ code });
      expect(await pending).toMatchObject({ ok: false, error: { code } });
      expect(transport).toHaveBeenCalledTimes(1);
      expect(f.read().quotes).toHaveLength(0);
      expect(f.read().turns).toHaveLength(0);
      expect(f.repo.agentReplay(f.command)).toBeNull();
    } finally {
      deadline.mockRestore();
    }
  },
);

it("does not accept cancellation after commit and replays a lost response without another model call", async () => {
  const f = fixture();
  let resolve: (value: unknown) => void = () => {};
  const json = vi.fn(
    () =>
      new Promise<unknown>((r) => {
        resolve = r;
      }),
  );
  const agent = new AgentExecutor(f.repo, () => ({ json }));
  const pending = agent.execute(f.command, creds);
  resolve(f.understanding);
  // The commit continuation executes first, before pending-map cleanup.
  await Promise.resolve();
  expect(f.read().quotes).toHaveLength(1);
  expect(agent.cancel(f.command.idempotencyKey)).toBe(false);
  const saved = await pending;
  expect(saved.ok).toBe(true);
  expect(agent.cancel(f.command.idempotencyKey)).toBe(false);
  // Simulate a caller losing the successful reply, then reusing its original key.
  expect(await new AgentExecutor(f.reopen(), () => ({ json })).execute(f.command)).toEqual(saved);
  expect(json).toHaveBeenCalledTimes(1);
  expect(f.read().quotes).toHaveLength(1);
  expect(f.read().turns).toHaveLength(1);
});
