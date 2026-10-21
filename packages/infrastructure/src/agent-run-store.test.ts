import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  demoCatalogCsv,
  demoScenario,
  type RunCommand,
  type TradeResult,
  type Understanding,
} from "@tradequote/contracts";
import Database from "better-sqlite3";
import { afterEach, expect, it, vi } from "vitest";
import type { RunTicket } from "./agent-run-store";
import { SqliteWorkspaceRepository } from "./index";
import { migrate, migrations } from "./migrations";

const cleanups: (() => void)[] = [];
afterEach(() => {
  vi.useRealTimers();
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});
const common = () => ({
  schemaVersion: 1 as const,
  requestId: randomUUID(),
  idempotencyKey: randomUUID(),
});
const context = { actorId: "synthetic-user", origin: "human_ui" as const };
function data(result: TradeResult) {
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "tradequote-run-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, "workspace.sqlite");
  let repo = new SqliteWorkspaceRepository(file);
  cleanups.push(() => repo.close());
  repo.commit(
    { ...common(), method: "workspace.create", payload: { name: "合成恢复测试" } },
    context,
  );
  const scenario = data(
    repo.executeTrade(
      {
        ...common(),
        method: "scenario.save",
        payload: { expectedVersion: 0, scenario: demoScenario },
      },
      context,
    ),
  ).scenario;
  const batch = data(
    repo.executeTrade(
      {
        ...common(),
        method: "catalog.stage",
        payload: { csv: demoCatalogCsv, sourceName: "synthetic.csv", sourceStatus: "synthetic" },
      },
      context,
    ),
  ).batches[0];
  if (!scenario || !batch) throw new Error("fixture");
  const product = data(
    repo.executeTrade(
      {
        ...common(),
        method: "catalog.publish",
        payload: { batchId: batch.id, sourceHash: batch.sourceHash },
      },
      context,
    ),
  ).products.find((p) => p.sku === "DEMO-TEE");
  if (!product) throw new Error("fixture");
  const db = new Database(file);
  cleanups.push(() => db.close());
  const start = () => ({
    ...common(),
    method: "agent.start" as const,
    payload: {
      method: "agent.understand" as const,
      payload: { scenarioId: scenario.id, buyer: "合成买方", inquiry: "100件" },
    },
  });
  const proposal: Understanding = {
    lines: [{ productId: product.id, quantity: "100", unit: "piece" }],
    payment: "",
    delivery: "",
    summary: "合成建议",
  };
  const control = (runId: string, method: "agent.cancel" | "agent.retry") => ({
    ...common(),
    method,
    payload: { runId },
  });
  const counts = () =>
    Object.fromEntries(
      [
        "quote_v1",
        "quote_revision",
        "agent_turn",
        "idempotency",
        "outbox",
        "agent_run_control",
      ].map((table) => [
        table,
        (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n,
      ]),
    );
  return {
    file,
    db,
    start,
    proposal,
    control,
    counts,
    product,
    scenario,
    get repo() {
      return repo;
    },
    get store() {
      return repo.runStore();
    },
    reopen() {
      repo.close();
      repo = new SqliteWorkspaceRepository(file);
    },
    claim(runId: string, attempt = 1): RunTicket {
      const ticket = repo.runStore().claim(runId, attempt, randomUUID()).ticket;
      if (!ticket) throw new Error("claim");
      return ticket;
    },
  };
}
it("R01/R02 queues durably, replays current facts, rejects changed input and claims once", () => {
  const f = fixture(),
    command = f.start(),
    first = f.store.start(command);
  expect(first.run.status).toBe("queued");
  expect(first.dispatch?.attempt).toBe(1);
  expect(
    f.db.prepare("SELECT * FROM idempotency WHERE key=?").get(command.idempotencyKey),
  ).toBeUndefined();
  f.reopen();
  expect(f.store.start({ ...command, requestId: randomUUID() }).dispatch).toBeNull();
  expect(() =>
    f.store.start({
      ...command,
      payload: { ...command.payload, payload: { ...command.payload.payload, buyer: "不同买方" } },
    }),
  ).toThrow("同一业务标识");
  const ticket = f.claim(first.run.runId);
  expect(f.store.claim(ticket.runId, 1, randomUUID()).ticket).toBeNull();
  expect(f.store.start(command).run.status).toBe("running");
});
it("R03/R05 cancel commits before abort, fences late results and explicit retry uses a new ticket", () => {
  const f = fixture(),
    run = f.store.start(f.start()).run,
    old = f.claim(run.runId);
  const before = f.counts();
  const cancel = f.control(run.runId, "agent.cancel");
  expect(f.store.control(cancel)).toMatchObject({ run: { status: "cancelled" }, abort: old });
  expect(f.store.control(cancel).abort).toBeNull();
  const retry = f.control(run.runId, "agent.retry"),
    next = f.store.control(retry);
  expect(next.dispatch).toEqual({ runId: run.runId, attempt: 2 });
  const ticket = f.claim(run.runId, 2);
  expect(f.store.commitQuote(old, f.proposal, "fixture").status).toBe("running");
  expect(f.store.fail(old, "MODEL_TIMEOUT").status).toBe("running");
  expect(f.store.waitForInput(old, "旧问题").clarification).toBeNull();
  expect(f.counts().quote_v1).toBe(before.quote_v1);
  const done = f.store.commitQuote(ticket, f.proposal, "fixture");
  expect(done.status).toBe("completed");
  expect(f.store.control(retry)).toMatchObject({
    run: { status: "queued", attempt: 2 },
    dispatch: null,
  });
  expect(f.store.get(run.runId)).toEqual(done);
});
it("R04/R11 complete survives reopen/lost responses and subsequent cancel or retry cannot undo it", () => {
  const f = fixture(),
    command = f.start(),
    run = f.store.start(command).run;
  const done = f.store.commitQuote(f.claim(run.runId), f.proposal, "fixture");
  const counts = f.counts();
  f.reopen();
  expect(f.store.start(command)).toMatchObject({ run: done, dispatch: null });
  for (const method of ["agent.cancel", "agent.retry"] as const)
    expect(f.store.control(f.control(run.runId, method))).toMatchObject({
      run: done,
      dispatch: null,
      abort: null,
    });
  expect(f.counts().quote_v1).toBe(counts.quote_v1);
  expect(f.counts().agent_turn).toBe(counts.agent_turn);
  expect(f.counts().outbox).toBe(counts.outbox);
  const result = data(
    f.repo.executeTrade(
      { schemaVersion: 1, requestId: randomUUID(), method: "trade.get" },
      context,
    ),
  );
  expect(result.quotes.find((q) => q.id === done.committedRevisionId)?.goodsTotal).toBe("900.00");
});
it("R06 waiting input survives reopen and needs new business input, cancellation clears only current text", () => {
  const f = fixture(),
    command = f.start(),
    run = f.store.start(command).run;
  f.store.waitForInput(f.claim(run.runId), "请补充数量与单位");
  f.reopen();
  expect(f.store.get(run.runId)).toMatchObject({
    status: "waiting_input",
    clarification: "请补充数量与单位",
    error: null,
  });
  expect(f.store.list().runs[0]?.clarification).toBe("请补充数量与单位");
  expect(() => f.store.control(f.control(run.runId, "agent.retry"))).toThrow("不允许");
  expect(f.store.start(command).dispatch).toBeNull();
  expect(f.store.control(f.control(run.runId, "agent.cancel")).run.clarification).toBeNull();
  expect(f.store.start({ ...command, idempotencyKey: randomUUID() }).dispatch).not.toBeNull();
});
it("R08/R09/R10 recovery is idempotent, never dispatches and control keys replay without side effects", () => {
  const f = fixture(),
    queued = f.store.start(f.start()).run,
    running = f.store.start(f.start()).run;
  f.claim(running.runId);
  const waiting = f.store.start(f.start()).run;
  f.store.waitForInput(f.claim(waiting.runId), "问题");
  const failed = f.store.start(f.start()).run;
  f.store.fail(f.claim(failed.runId), "MODEL_AUTH_FAILED");
  f.reopen();
  expect(new Set(f.store.recoverOnStartup())).toEqual(new Set([queued.runId, running.runId]));
  const counts = f.counts();
  expect(f.store.recoverOnStartup()).toEqual([]);
  expect(f.counts()).toEqual(counts);
  expect(f.store.get(waiting.runId).status).toBe("waiting_input");
  expect(f.store.get(failed.runId).status).toBe("failed");
  const retry = f.control(running.runId, "agent.retry");
  expect(f.store.control(retry).dispatch?.attempt).toBe(2);
  expect(f.store.control({ ...retry, requestId: randomUUID() }).dispatch).toBeNull();
  expect(() => f.store.control({ ...retry, method: "agent.cancel" })).toThrow("控制标识");
  expect(() => f.store.control({ ...retry, payload: { runId: queued.runId } })).toThrow("控制标识");
  expect(f.store.control(f.control(failed.runId, "agent.retry")).run.attempt).toBe(2);
});
for (const point of ["quote_v1", "agent_turn", "idempotency", "run_update", "run_outbox"] as const)
  it(`R12 rolls back the entire same-connection commit after ${point}`, () => {
    const f = fixture(),
      run = f.store.start(f.start()).run,
      ticket = f.claim(run.runId),
      before = f.counts();
    const sql =
      point === "run_update"
        ? "AFTER UPDATE ON agent_run WHEN json_extract(NEW.data_json,'$.status')='completed'"
        : point === "run_outbox"
          ? "AFTER INSERT ON outbox WHEN NEW.type='agent.run.completed'"
          : `AFTER INSERT ON ${point}`;
    f.db.exec(
      `CREATE TRIGGER fail_commit ${sql} BEGIN SELECT RAISE(ABORT,'synthetic-secret-sql'); END`,
    );
    expect(() => f.store.commitQuote(ticket, f.proposal, "fixture")).toThrow("运行记录读写失败");
    expect(f.counts()).toEqual(before);
    expect(f.store.get(run.runId).status).toBe("running");
    f.db.exec("DROP TRIGGER fail_commit");
    expect(f.store.commitQuote(ticket, f.proposal, "fixture").status).toBe("completed");
  });
it("R14 failed cancel neither persists controls nor produces abort, then retry dispatch survives loss", () => {
  const f = fixture(),
    run = f.store.start(f.start()).run,
    ticket = f.claim(run.runId),
    before = f.counts();
  f.db.exec(
    "CREATE TRIGGER fail_cancel BEFORE INSERT ON outbox WHEN NEW.type='agent.run.cancelled' BEGIN SELECT RAISE(ABORT,'injected'); END",
  );
  expect(() => f.store.control(f.control(run.runId, "agent.cancel"))).toThrow("运行记录读写失败");
  expect(f.store.get(run.runId).status).toBe("running");
  expect(f.counts()).toEqual(before);
  f.db.exec("DROP TRIGGER fail_cancel");
  expect(f.store.control(f.control(run.runId, "agent.cancel")).abort).toEqual(ticket);
  f.reopen();
  expect(f.store.get(run.runId).status).toBe("cancelled");
  f.store.control(f.control(run.runId, "agent.retry"));
  f.reopen();
  f.store.recoverOnStartup();
  expect(f.store.get(run.runId)).toMatchObject({ status: "interrupted", attempt: 2 });
});
it("R17 adopts a verified legacy success and refuses broken receipts instead of dispatching", () => {
  const f = fixture(),
    command = f.start();
  const legacy = { ...command, ...command.payload };
  const result = f.repo.commitAgent(legacy, f.proposal, "fixture");
  expect(result.ok).toBe(true);
  const first = f.store.start(command);
  expect(first.run.status).toBe("completed");
  expect(first.dispatch).toBeNull();
  const other = f.start(),
    old = { ...other, ...other.payload };
  f.repo.commitAgent(old, f.proposal, "fixture");
  const row = f.db
    .prepare("SELECT result_json FROM idempotency WHERE key=?")
    .get(other.idempotencyKey) as { result_json: string };
  const corrupt = JSON.parse(row.result_json);
  corrupt.evidenceIds[0] = randomUUID();
  f.db
    .prepare("UPDATE idempotency SET result_json=? WHERE key=?")
    .run(JSON.stringify(corrupt), other.idempotencyKey);
  expect(() => f.store.start(other)).toThrow("提交凭据不一致");
  expect(f.store.list().runs).toHaveLength(1);
});
it("R18 discovers every equal-timestamp run with stable keyset pages and filters at each read", () => {
  const f = fixture();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-21T00:00:00Z"));
  const ids = Array.from({ length: 5 }, () => f.store.start(f.start()).run.runId).sort();
  const a = f.store.list({ limit: 2 }),
    b = f.store.list({ limit: 2, cursor: a.nextCursor! }),
    c = f.store.list({ limit: 2, cursor: b.nextCursor! });
  expect([...a.runs, ...b.runs, ...c.runs].map((r) => r.runId)).toEqual(ids);
  expect(c.nextCursor).toBeNull();
  f.store.control(f.control(ids[0]!, "agent.cancel"));
  expect(f.store.list({ status: "cancelled" }).runs.map((r) => r.runId)).toEqual([ids[0]]);
  expect(() => f.store.get(randomUUID())).toThrow("运行不存在");
});
it("checks latest revision/scenario at commit and preserves immutable V1 across V2/V3", () => {
  const f = fixture(),
    first = f.store.start(f.start()).run;
  const v1 = f.store.commitQuote(f.claim(first.runId), f.proposal, "fixture");
  const v1json = (
    f.db.prepare("SELECT data_json FROM quote_v1 WHERE id=?").get(v1.committedRevisionId) as {
      data_json: string;
    }
  ).data_json;
  const revise = (
    baseId: string,
    expectedVersion: number,
  ): Extract<RunCommand, { method: "agent.start" }> => ({
    ...common(),
    method: "agent.start",
    payload: {
      method: "agent.revise",
      payload: { baseId, expectedVersion, instruction: "合成修改" },
    },
  });
  const second = f.store.start(revise(v1.committedRevisionId!, 1)).run,
    stale = f.store.start(revise(v1.committedRevisionId!, 1)).run;
  const staleTicket = f.claim(stale.runId);
  const v2 = f.store.commitQuote(
    f.claim(second.runId),
    {
      patches: [{ op: "setQuantity", productId: f.product.id, quantity: "120" }],
      summary: "数量120",
    },
    "fixture",
  );
  expect(() =>
    f.store.commitQuote(
      staleTicket,
      { patches: [{ op: "setDelivery", value: "30天" }], summary: "交期" },
      "fixture",
    ),
  ).toThrow("已有新版本");
  const third = f.store.start(revise(v2.committedRevisionId!, 2)).run;
  const v3 = f.store.commitQuote(
    f.claim(third.runId),
    { patches: [{ op: "setDelivery", value: "30天" }], summary: "交期" },
    "fixture",
  );
  expect(f.store.get(third.runId).committedRevisionId).toBe(v3.committedRevisionId);
  const quotes = data(
    f.repo.executeTrade(
      { schemaVersion: 1, requestId: randomUUID(), method: "trade.get" },
      context,
    ),
  ).quotes;
  expect(quotes.filter((q) => q.version > 1).map((q) => q.goodsTotal)).toEqual([
    "1080.00",
    "1080.00",
  ]);
  expect(
    (
      f.db.prepare("SELECT data_json FROM quote_v1 WHERE id=?").get(v1.committedRevisionId) as {
        data_json: string;
      }
    ).data_json,
  ).toBe(v1json);
  const pending = f.store.start(f.start()).run,
    ticket = f.claim(pending.runId);
  f.repo.executeTrade(
    {
      ...common(),
      method: "scenario.save",
      payload: { expectedVersion: 1, scenario: demoScenario },
    },
    context,
  );
  expect(() => f.store.commitQuote(ticket, f.proposal, "fixture")).toThrow("场景已变化");
});
it("R15 upgrades real v3 records through A migration4 and run5 without rewriting old data", () => {
  const f = fixture();
  // Dedicated old-schema database: never remove tables from a current user database.
  const old = new Database(join(tmpdir(), `tradequote-old-${randomUUID()}.sqlite`));
  const path = old.name;
  cleanups.push(() => rmSync(path, { force: true }));
  cleanups.push(() => old.close());
  migrate(old, migrations.slice(0, 3));
  const command = f.start();
  f.repo.commitAgent({ ...command, ...command.payload }, f.proposal, "fixture");
  const tables = [
    "workspace",
    "scenario_revision",
    "catalog_batch",
    "catalog_product",
    "quote_v1",
    "agent_turn",
    "idempotency",
    "outbox",
  ];
  for (const table of tables) {
    const rows = f.db.prepare(`SELECT * FROM ${table}`).all() as Record<
      string,
      string | number | null
    >[];
    for (const row of rows)
      old
        .prepare(
          `INSERT INTO ${table} (${Object.keys(row).join(",")}) VALUES (${Object.keys(row)
            .map(() => "?")
            .join(",")})`,
        )
        .run(...Object.values(row));
  }
  const snapshot = () => tables.map((table) => old.prepare(`SELECT * FROM ${table}`).all());
  const before = JSON.stringify(snapshot());
  migrate(old);
  migrate(old);
  expect(JSON.stringify(snapshot())).toBe(before);
  expect(old.pragma("user_version", { simple: true })).toBe(migrations.length);
  expect(
    old
      .prepare(
        "SELECT name FROM sqlite_master WHERE name IN ('knowledge_revision','agent_run','agent_run_control')",
      )
      .all(),
  ).toHaveLength(3);
});

it("R16/R19 rejects stale worker sessions and corrupt persisted facts without recording raw failures", () => {
  const f = fixture(),
    run = f.store.start(f.start()).run,
    ticket = f.claim(run.runId);
  expect(
    f.store.commitQuote({ ...ticket, workerSessionId: randomUUID() }, f.proposal, "fixture").status,
  ).toBe("running");
  expect(f.counts().quote_v1).toBe(0);
  f.store.fail(ticket, "MODEL_AUTH_FAILED");
  const rows = f.db.prepare("SELECT data_json FROM agent_run").all();
  expect(JSON.stringify(rows)).not.toContain("executionId");
  expect(f.store.get(run.runId).error).toMatchObject({ code: "MODEL_AUTH_FAILED" });
  f.db.prepare("UPDATE agent_run SET request_hash='corrupted' WHERE run_id=?").run(run.runId);
  expect(() => f.store.get(run.runId)).toThrow("不一致");
  expect(() => f.store.list()).toThrow("不一致");
});
it("start and control effects are returned only after their transaction succeeds", () => {
  const f = fixture();
  f.db.exec(
    "CREATE TRIGGER fail_start BEFORE INSERT ON outbox WHEN NEW.type='agent.run.queued' BEGIN SELECT RAISE(ABORT,'injected'); END",
  );
  expect(() => f.store.start(f.start())).toThrow("运行记录读写失败");
  expect(f.store.list().runs).toEqual([]);
  f.db.exec("DROP TRIGGER fail_start");
  const run = f.store.start(f.start()).run,
    ticket = f.claim(run.runId),
    before = f.counts();
  f.db.exec(
    "CREATE TRIGGER fail_control BEFORE INSERT ON agent_run_control BEGIN SELECT RAISE(ABORT,'injected'); END",
  );
  expect(() => f.store.control(f.control(run.runId, "agent.cancel"))).toThrow("运行记录读写失败");
  expect(f.counts()).toEqual(before);
  f.db.exec("DROP TRIGGER fail_control");
  expect(f.store.commitQuote(ticket, f.proposal, "fixture").status).toBe("completed");
});

it("upgrades a real v6 run/control/write-receipt database to v7 without rewriting old business or run bytes", () => {
  const f = fixture(),
    command = f.start(),
    run = f.store.start(command).run,
    ticket = f.claim(run.runId),
    id = randomUUID();
  f.store.prepareWrite(ticket, id, f.proposal, "synthetic-v6");
  const done = f.store.commitWrite(ticket, id, f.proposal, "synthetic-v6");
  f.store.control(f.control(run.runId, "agent.cancel"));
  const path = `${f.file}.v6`;
  let old = new Database(path);
  cleanups.push(() => old.close());
  migrate(old, migrations.slice(0, 6));
  const tables = [
    "workspace",
    "scenario_revision",
    "catalog_batch",
    "catalog_product",
    "quote_v1",
    "quote_revision",
    "agent_turn",
    "idempotency",
    "outbox",
    "knowledge_revision",
    "agent_run",
    "agent_run_control",
    "agent_write_call",
  ];
  const columns = new Map<string, string[]>();
  for (const table of tables) {
    const names = (old.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
      (column) => column.name,
    );
    columns.set(table, names);
    for (const row of f.db.prepare(`SELECT ${names.join(",")} FROM ${table}`).all() as Record<
      string,
      string | number | null
    >[])
      old
        .prepare(
          `INSERT INTO ${table} (${names.join(",")}) VALUES (${names.map(() => "?").join(",")})`,
        )
        .run(...names.map((name) => row[name]!));
  }
  const snapshot = () =>
    JSON.stringify(
      tables.map((table) =>
        old.prepare(`SELECT ${columns.get(table)!.join(",")} FROM ${table} ORDER BY rowid`).all(),
      ),
    );
  const before = snapshot();
  expect(old.pragma("user_version", { simple: true })).toBe(6);
  old.close();
  old = new Database(path);
  migrate(old);
  migrate(old);
  expect(old.pragma("user_version", { simple: true })).toBe(7);
  expect(snapshot()).toBe(before);
  const upgraded = new SqliteWorkspaceRepository(path);
  try {
    expect(upgraded.runStore().get(done.runId)).toEqual(done);
  } finally {
    upgraded.close();
  }
});
