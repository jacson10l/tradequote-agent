import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  type AgentCommand,
  AgentOperationSchema,
  AgentRunSchema,
  RunListResultSchema,
  TradeResultSchema,
} from "@tradequote/contracts";
import Database from "better-sqlite3";
import { build } from "vite";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { AgentRunCoordinator } from "./agent-run-coordinator";
import { SqliteWorkspaceRepository } from "./index";
import { migrate, seedTo } from "./migrations";
import { common, data, runFixture } from "./testing/run-fixture";

type Row = Record<string, string | number | null>;
const output = resolve(`.runtime/worker-gates-${randomUUID()}`);
const cleanups: (() => void)[] = [];
beforeAll(async () => {
  mkdirSync(output, { recursive: true });
  symlinkSync(resolve("packages/infrastructure/node_modules"), join(output, "node_modules"), "dir");
  for (const [name, entry] of [
    ["worker", "apps/desktop/src/workers/business.ts"],
    ["host", "tests/fixtures/worker-gates-host.ts"],
  ])
    await build({
      configFile: false,
      logLevel: "silent",
      build: {
        outDir: output,
        emptyOutDir: false,
        target: "node24",
        minify: false,
        lib: { entry: resolve(entry!), formats: ["cjs"], fileName: () => `${name}.cjs` },
        rollupOptions: {
          external: (id) => id.startsWith("node:") || ["electron", "better-sqlite3"].includes(id),
        },
      },
    });
});
afterEach(() => {
  for (const close of cleanups.splice(0).reverse()) close();
});
afterAll(() => rmSync(output, { recursive: true, force: true }));
function rows(db: Database.Database, table: string): Row[] {
  return db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all() as Row[];
}
function snapshot(db: Database.Database, tables: string[]) {
  return Object.fromEntries(tables.map((table) => [table, rows(db, table)]));
}
const businessTables = [
  "workspace",
  "scenario_revision",
  "catalog_batch",
  "catalog_product",
  "quote_v1",
  "quote_revision",
  "agent_turn",
  "idempotency",
];
function historical(version: 3 | 5 | 6 | 7) {
  const f = runFixture(cleanups);
  const v1: AgentCommand = { ...common(), ...f.start().payload };
  const one = f.repo.commitAgent(v1, f.proposal, "synthetic-old");
  if (!one.ok) throw Error("V1 fixture");
  const v2: AgentCommand = {
    ...common(),
    method: "agent.revise",
    payload: { baseId: one.evidenceIds[0]!, expectedVersion: 1, instruction: "120件" },
  };
  const two = f.repo.commitAgent(
    v2,
    {
      patches: [{ op: "setQuantity", productId: f.product.id, quantity: "120" }],
      summary: "合成数量",
    },
    "synthetic-old",
  );
  if (!two.ok) throw Error("V2 fixture");
  const v3: AgentCommand = {
    ...common(),
    method: "agent.revise",
    payload: { baseId: two.evidenceIds[0]!, expectedVersion: 2, instruction: "30天" },
  };
  const three = f.repo.commitAgent(
    v3,
    { patches: [{ op: "setDelivery", value: "30天" }], summary: "合成交期" },
    "synthetic-old",
  );
  if (!three.ok) throw Error("V3 fixture");
  const board = data(
    f.repo.executeTrade(
      { schemaVersion: 1, requestId: randomUUID(), method: "trade.get" },
      { actorId: "synthetic-user", origin: "human_ui" },
    ),
  );
  const unpriced = board.products.find((p) => p.sku === "DEMO-FASTENER");
  if (!unpriced) throw Error("unpriced fixture");
  const unknown: AgentCommand = { ...common(), ...f.start().payload };
  const missing = f.repo.commitAgent(
    unknown,
    { ...f.proposal, lines: [{ productId: unpriced.id, quantity: "1", unit: unpriced.unit }] },
    "synthetic-old",
  );
  if (!missing.ok) throw Error("unknown amount fixture");
  const commands = [v1, v2, v3, unknown];
  if (version >= 5) {
    // Completed old successes have real quote/turn/idempotency facts, no fabricated receipt.
    for (const command of commands)
      f.store.start({
        ...command,
        method: "agent.start",
        payload: AgentOperationSchema.parse({ method: command.method, payload: command.payload }),
      });
    f.store.start(f.start());
    const active = f.store.start(f.start()).run;
    const ticket = f.claim(active.runId);
    if (version >= 6) f.store.prepareWrite(ticket, randomUUID(), f.proposal, "synthetic-old");
    const waiting = f.store.start(f.start()).run;
    f.store.waitForInput(f.claim(waiting.runId), "请人工补充数量");
    const failed = f.store.start(f.start()).run;
    f.store.fail(f.claim(failed.runId), "MODEL_TIMEOUT");
    const cancelled = f.store.start(f.start()).run;
    const cancelledTicket = f.claim(cancelled.runId);
    if (version >= 6)
      f.store.prepareWrite(cancelledTicket, randomUUID(), f.proposal, "synthetic-old");
    f.store.control(f.control(cancelled.runId, "agent.cancel"));
    const interrupted = f.store.start(f.start()).run;
    f.store.control(f.control(interrupted.runId, "agent.cancel"));
    f.store.control(f.control(interrupted.runId, "agent.retry"));
    // Produce interrupted through the actual transition before creating the final active pair.
    f.store.recoverOnStartup();
    f.store.start(f.start());
    const prepared = f.store.start(f.start()).run;
    const preparedTicket = f.claim(prepared.runId);
    if (version >= 6) {
      f.store.prepareWrite(preparedTicket, randomUUID(), f.proposal, "synthetic-old");
      const completed = f.store.start(f.start()).run;
      const completedTicket = f.claim(completed.runId);
      if (version === 7)
        f.store.recordToolStep(completedTicket, {
          toolCallId: randomUUID(),
          attempt: 1,
          ordinal: 1,
          tool: "search_catalog",
          ok: true,
          errorCode: null,
          evidenceIds: [],
        });
      f.store.commitQuote(completedTicket, f.proposal, "synthetic-old");
    }
  }
  // Rebuild original DDL in a separate file, then copy domain-produced rows by original columns.
  // This is never a current database with tables dropped or user_version downgraded.
  const file = join(dirname(f.file), `historical-${version}.sqlite`);
  const db = new Database(file);
  cleanups.push(() => db.close());
  seedTo(db, { lineage: version === 3 ? "common" : "c-run", version });
  const tables = [
    ...businessTables,
    "outbox",
    ...(version >= 5 ? ["agent_run", "agent_run_control"] : []),
    ...(version >= 6 ? ["agent_write_call"] : []),
    ...(version === 7 ? ["agent_tool_step"] : []),
  ];
  for (const table of tables) {
    const columns = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
      (c) => c.name,
    );
    for (const row of rows(f.db, table)) {
      if (table === "outbox" && version < 7 && row.type === "agent.run.event.v1") continue;
      db.prepare(
        `INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
      ).run(...columns.map((c) => row[c] ?? null));
    }
  }
  expect(db.pragma("foreign_key_check")).toEqual([]);
  return { f, file, db, tables, commands, replays: [one, two, three, missing] };
}
async function host(input: {
  database: string;
  mode: "recover" | "ownership" | "reject";
  aliases?: string[];
  commands?: AgentCommand[];
}) {
  const config = join(output, `${randomUUID()}.json`);
  writeFileSync(config, JSON.stringify({ ...input, entry: join(output, "worker.cjs") }));
  return new Promise<Record<string, unknown>>((res, reject) => {
    const child = spawn(process.execPath, [join(output, "host.cjs"), config], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "",
        NODE_PATH: resolve("packages/infrastructure/node_modules"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(Error("Electron host timeout"));
    }, 20000);
    // Preserve UTF-8 characters split across pipe chunks in the replay JSON.
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    // 'close' follows stdio draining; 'exit' can precede the last data chunk.
    child.once("close", (code) => {
      clearTimeout(timer);
      const line = stdout.split("\n").find((line) => line.startsWith("GATE_RESULT="));
      if (code !== 0 || !line) reject(Error(`Electron host ${code}: ${stderr.slice(-3000)}`));
      else {
        try {
          res(JSON.parse(line.slice("GATE_RESULT=".length)));
        } catch (error) {
          reject(error);
        }
      }
    });
  });
}
for (const version of [3, 5, 6, 7] as const)
  it(`M02/M04-M06/F05 legacy v${version}: domain facts survive T0/T1/T2, actual Worker replay and two reopens`, async () => {
    const f = historical(version);
    const before = snapshot(f.db, f.tables);
    migrate(f.db);
    migrate(f.db);
    const after = snapshot(f.db, f.tables);
    for (const table of f.tables) {
      // C6 gains only the documented nullable validation column.
      if (table === "agent_write_call" && version === 6)
        expect(after[table]).toEqual(
          before[table]!.map((row) => ({ ...row, validation_json: null })),
        );
      else expect(after[table]).toEqual(before[table]);
    }
    expect(f.db.pragma("user_version", { simple: true })).toBe(11);
    const ledger = rows(f.db, "migration_registry");
    const frozen = snapshot(f.db, businessTables);
    const controls = rows(f.db, "agent_run_control");
    const events = rows(f.db, "outbox");
    const receipts = rows(f.db, "agent_write_call");
    const steps = rows(f.db, "agent_tool_step");
    const oldRuns = rows(f.db, "agent_run").map((r) =>
      AgentRunSchema.parse(JSON.parse(String(r.data_json))),
    );
    const active = oldRuns.filter((r) => ["queued", "running"].includes(r.status));
    if (version >= 5)
      expect(new Set(oldRuns.map((r) => r.status))).toEqual(
        new Set([
          "queued",
          "running",
          "completed",
          "failed",
          "cancelled",
          "interrupted",
          "waiting_input",
        ]),
      );
    for (let reopen = 0; reopen < 2; reopen++) {
      const result = await host({ database: f.file, mode: "recover", commands: f.commands });
      expect(result.connections).toContain(true);
      expect(result.requests).toBe(0);
      expect(result.replays).toEqual(f.replays);
      const runs = RunListResultSchema.parse(result.runs);
      if (!runs.ok) throw Error("runs unavailable");
      for (const old of oldRuns) {
        const run = runs.data.runs.find((r) => r.runId === old.runId);
        if (["queued", "running"].includes(old.status))
          expect(run).toMatchObject({
            status: "interrupted",
            attempt: old.attempt,
            committedRevisionId: null,
          });
        else expect(run).toEqual(old);
      }
      const board = data(TradeResultSchema.parse(result.board));
      expect(board.quotes.filter((q) => q.id === f.replays[0]!.evidenceIds[0])[0]?.goodsTotal).toBe(
        "900.00",
      );
      expect(
        board.quotes.find((q) => q.id === f.replays[3]!.evidenceIds[0])?.goodsTotal,
      ).toBeNull();
      expect(rows(f.db, "agent_write_call")).toEqual(
        receipts.map((row) => (row.status === "prepared" ? { ...row, status: "abandoned" } : row)),
      );
      expect(rows(f.db, "agent_tool_step")).toEqual(steps);
      for (const run of active)
        expect(
          f.db
            .prepare("SELECT execution_id,worker_session_id FROM agent_run WHERE run_id=?")
            .get(run.runId),
        ).toEqual({ execution_id: null, worker_session_id: null });
      expect(snapshot(f.db, businessTables)).toEqual(frozen);
      expect(rows(f.db, "agent_run_control")).toEqual(controls);
      expect(rows(f.db, "migration_registry")).toEqual(ledger);
      expect(rows(f.db, "outbox").slice(0, events.length)).toEqual(events);
      expect(rows(f.db, "agent_write_call").filter((r) => r.status === "prepared")).toEqual([]);
      expect(f.db.pragma("foreign_key_check")).toEqual([]);
    }
    // Completed legacy v3 commands may be adopted once, but no old event is rewritten.
    if (version >= 5) expect(rows(f.db, "outbox").length - events.length).toBe(active.length * 2);
    const repo = new SqliteWorkspaceRepository(f.file);
    const provider = vi.fn();
    const coordinator = new AgentRunCoordinator(repo, provider);
    expect(provider).not.toHaveBeenCalled();
    expect(repo.runStore().recoverOnStartup()).toEqual([]);
    await coordinator.close();
    repo.close();
  }, 30000);

it("F03 real Workers exclude the same path, directory alias and database symlink until exit", async () => {
  const f = historical(7);
  const directoryAlias = join(output, `dir-${randomUUID()}`);
  const fileAlias = join(dirname(f.file), "alias.sqlite");
  symlinkSync(dirname(f.file), directoryAlias, "dir");
  symlinkSync(f.file, fileAlias);
  const result = await host({
    database: f.file,
    mode: "ownership",
    commands: f.commands,
    aliases: [f.file, join(directoryAlias, "historical-7.sqlite"), fileAlias],
  });
  expect(result.firstReady).toBe(true);
  expect(result.contenders).toMatchObject(
    Array.from({ length: 3 }, () => ({
      ready: false,
      exitCode: 1,
      live: { ok: true, data: { status: "running", attempt: 1 } },
    })),
  );
  expect(result.successorReady).toBe(true);
  expect(result.recovered).toMatchObject({ ok: true, data: { status: "interrupted", attempt: 1 } });
  expect(result.requests).toBe(1);
}, 30000);

for (const damage of ["unknown-version", "missing-trigger", "bad-ledger"] as const)
  it(`F04 real Worker ${damage} refuses before ready/recovery and Main returns a safe failure`, async () => {
    const f = historical(7);
    if (damage === "unknown-version") f.db.pragma("user_version = 99");
    if (damage === "missing-trigger") f.db.exec("DROP TRIGGER agent_tool_step_no_delete");
    if (damage === "bad-ledger") {
      migrate(f.db);
      f.db.exec("UPDATE migration_registry SET sql_hash='synthetic-invalid-hash'");
    }
    const before = snapshot(f.db, f.tables);
    const schema = f.db.prepare("SELECT * FROM sqlite_master ORDER BY name").all();
    const version = f.db.pragma("user_version", { simple: true });
    const registry = damage === "bad-ledger" ? rows(f.db, "migration_registry") : null;
    const bytes = readFileSync(f.file);
    const files = readdirSync(dirname(f.file)).sort();
    const result = await host({ database: f.file, mode: "reject" });
    expect(result.ready).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.connections).not.toContain(true);
    expect(result.reply).toMatchObject({ ok: false, error: { code: "CAPABILITY_UNAVAILABLE" } });
    expect(JSON.stringify(result.reply)).not.toMatch(
      /sqlite|SELECT|migration_registry|synthetic-invalid-hash/,
    );
    expect(snapshot(f.db, f.tables)).toEqual(before);
    expect(readFileSync(f.file)).toEqual(bytes);
    expect(f.db.prepare("SELECT * FROM sqlite_master ORDER BY name").all()).toEqual(schema);
    expect(f.db.pragma("user_version", { simple: true })).toBe(version);
    if (registry) expect(rows(f.db, "migration_registry")).toEqual(registry);
    expect(JSON.stringify(result.reply)).not.toContain(f.file);
    // Worker ownership deliberately precedes preflight; only its sidecar may be created.
    expect(
      readdirSync(dirname(f.file))
        .filter(
          (name) =>
            !["historical-7.sqlite.owner", "historical-7.sqlite.owner-journal"].includes(name),
        )
        .sort(),
    ).toEqual(files);
  }, 30000);
