import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { build } from "vite";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { AgentRunCoordinator } from "./agent-run-coordinator";
import { common, runFixture } from "./testing/run-fixture";
import { WorkerOwnership } from "./worker-ownership";

const cleanups: (() => void)[] = [];
const output = resolve(`.runtime/crash-${randomUUID()}`);
const children = new Set<ChildProcess>();
beforeAll(async () => {
  mkdirSync(output, { recursive: true });
  await build({
    configFile: false,
    logLevel: "silent",
    build: {
      outDir: output,
      minify: false,
      target: "node24",
      lib: {
        entry: resolve("tests/fixtures/run-crash-child.ts"),
        formats: ["cjs"],
        fileName: () => "probe.cjs",
      },
      rollupOptions: { external: (id) => id.startsWith("node:") || id === "better-sqlite3" },
    },
  });
});
afterEach(async () => {
  for (const child of children) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    const exited = once(child, "exit");
    child.kill("SIGKILL");
    await exited;
  }
  children.clear();
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});
afterAll(() => rmSync(output, { recursive: true, force: true }));
async function launch(file: string, fixture: string, point: string) {
  const child = spawn(process.execPath, [join(output, "probe.cjs"), file, fixture, point], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_PATH: resolve("packages/infrastructure/node_modules"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  let stdout = "",
    stderr = "";
  const checkpoint = new Promise<{ runId: string; pid: number }>((res, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`checkpoint timeout: ${stderr.slice(-2000)}`)),
      10000,
    );
    child.stdout?.on("data", (data) => {
      stdout += data;
      if (!stdout.includes("\n")) return;
      clearTimeout(timer);
      res(JSON.parse(stdout.trim()));
    });
    child.stderr?.on("data", (data) => {
      stderr += data;
    });
    child.once("exit", () => {
      clearTimeout(timer);
      reject(new Error(`early exit: ${stderr.slice(-2000)}`));
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  return { child, checkpoint: await checkpoint };
}
for (const point of [
  "queued",
  "running",
  "proposal",
  "prepared",
  "inside-quote",
  "inside-run",
  "inside-receipt",
  "committed",
  "cancelled",
  "retry-queued",
]) {
  it(`R13/R14 SIGKILL at ${point} keeps atomic business facts, recovers without model requests`, async () => {
    const f = runFixture(cleanups),
      command = f.start(),
      fixturePath = join(output, `${randomUUID()}.json`);
    // Frozen legacy V1/V2/V3 must survive every process/transaction crash byte for byte.
    const original = f.start();
    const first = f.repo.commitAgent(
      { ...original, ...original.payload },
      f.proposal,
      "synthetic-old",
    );
    if (!first.ok) throw new Error("synthetic V1");
    const second = f.repo.commitAgent(
      {
        ...common(),
        method: "agent.revise",
        payload: { baseId: first.evidenceIds[0]!, expectedVersion: 1, instruction: "120" },
      },
      {
        patches: [{ op: "setQuantity", productId: f.product.id, quantity: "120" }],
        summary: "120",
      },
      "synthetic-old",
    );
    if (!second.ok) throw new Error("synthetic V2");
    const third = f.repo.commitAgent(
      {
        ...common(),
        method: "agent.revise",
        payload: { baseId: second.evidenceIds[0]!, expectedVersion: 2, instruction: "交期" },
      },
      { patches: [{ op: "setDelivery", value: "30天" }], summary: "交期" },
      "synthetic-old",
    );
    if (!third.ok) throw new Error("synthetic V3");
    const frozen = f.db
      .prepare(
        "SELECT id,data_json,content_hash FROM quote_v1 UNION ALL SELECT id,data_json,content_hash FROM quote_revision ORDER BY id",
      )
      .all();
    const countsBefore = f.counts();
    writeFileSync(fixturePath, JSON.stringify({ command, proposal: f.proposal }));
    const { child, checkpoint } = await launch(f.file, fixturePath, point);
    // A live writer cannot be stolen, including while its quote transaction is open.
    expect(() => new WorkerOwnership(f.file)).toThrow("旧业务进程");
    const exited = once(child, "exit");
    child.kill("SIGKILL");
    const [, signal] = await exited;
    children.delete(child);
    expect(signal).toBe("SIGKILL");
    const owner = new WorkerOwnership(f.file);
    try {
      f.reopen();
      const json = vi.fn();
      const coordinator = new AgentRunCoordinator(f.repo, () => ({ json }));
      const run = f.store.get(checkpoint.runId);
      expect(run.status).toBe(
        point === "committed" ? "completed" : point === "cancelled" ? "cancelled" : "interrupted",
      );
      expect(run.attempt).toBe(point === "retry-queued" ? 2 : 1);
      expect(f.counts().quote_v1! - countsBefore.quote_v1!).toBe(point === "committed" ? 1 : 0);
      expect(f.counts().agent_turn! - countsBefore.agent_turn!).toBe(point === "committed" ? 1 : 0);
      expect(f.repo.agentReplay({ ...command, ...command.payload })?.ok ?? false).toBe(
        point === "committed",
      );
      for (const row of frozen)
        expect(
          f.db
            .prepare(
              "SELECT id,data_json,content_hash FROM quote_v1 WHERE id=? UNION ALL SELECT id,data_json,content_hash FROM quote_revision WHERE id=?",
            )
            .get((row as { id: string }).id, (row as { id: string }).id),
        ).toEqual(row);
      const receipts = f.db.prepare("SELECT status,revision_id FROM agent_write_call").all();
      if (point === "committed")
        expect(receipts).toEqual([{ status: "committed", revision_id: run.committedRevisionId }]);
      else
        for (const receipt of receipts)
          expect(receipt).toEqual({ status: "abandoned", revision_id: null });
      const before = f.counts();
      expect(f.store.recoverOnStartup()).toEqual([]);
      expect(f.counts()).toEqual(before);
      expect(json).not.toHaveBeenCalled();
      await coordinator.close();
    } finally {
      owner.close();
    }
  });
}
