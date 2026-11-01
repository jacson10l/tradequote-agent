import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { app, utilityProcess } from "electron";
import { BusinessWorker } from "../../apps/desktop/src/main/worker-client";
import {
  type AgentCommand,
  AgentOperationSchema,
  RunResultSchema,
  type RuntimeCommand,
} from "../../packages/contracts/src/index";

// Isolated Electron host: the actual business entry and Main client are under test.
const input = JSON.parse(readFileSync(process.argv[2]!, "utf8")) as {
  entry: string;
  database: string;
  mode: "recover" | "ownership" | "reject";
  aliases?: string[];
  commands?: AgentCommand[];
};
async function launch(database: string, endpoint?: string) {
  const child = utilityProcess.fork(input.entry, [database, ...(endpoint ? [endpoint] : [])], {
    stdio: "pipe",
  });
  let stderr = "";
  child.stderr?.on("data", (data) => {
    stderr += data;
  });
  let didExit = false;
  const exited = new Promise<number>((resolve) =>
    child.once("exit", (code) => {
      didExit = true;
      resolve(code);
    }),
  );
  const ready = await new Promise<boolean>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(Error("startup timeout"));
    }, 10000);
    child.on("message", (message) => {
      if (message?.type === "ready") {
        clearTimeout(timer);
        resolve(true);
      }
    });
    void exited.then(() => {
      clearTimeout(timer);
      resolve(false);
    });
  });
  return {
    ready,
    get stderr() {
      return stderr;
    },
    request(command: RuntimeCommand) {
      return new Promise<unknown>((resolve, reject) => {
        const id = randomUUID();
        const timer = setTimeout(() => {
          child.off("message", listener);
          reject(Error("request timeout"));
        }, 5000);
        const listener = (message: { id?: string; result?: unknown }) => {
          if (message.id !== id) return;
          clearTimeout(timer);
          child.off("message", listener);
          resolve(message.result);
        };
        child.on("message", listener);
        child.postMessage({
          id,
          command,
          credentials: { key: "synthetic-gate-key", model: "synthetic-model" },
        });
      });
    },
    async close() {
      if (!didExit) child.kill();
      return exited;
    },
  };
}
async function main() {
  await app.whenReady();
  try {
    let result: unknown;
    if (input.mode === "ownership") {
      let requests = 0;
      let received = () => {};
      const called = new Promise<void>((resolve) => {
        received = resolve;
      });
      const server = createServer(() => {
        requests++;
        received();
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw Error("fixture server");
      const first = await launch(input.database, `http://127.0.0.1:${address.port}`);
      const command = input.commands?.[0];
      if (!command) throw Error("synthetic command required");
      const started = RunResultSchema.parse(
        await first.request({
          ...command,
          requestId: randomUUID(),
          idempotencyKey: randomUUID(),
          method: "agent.start",
          payload: AgentOperationSchema.parse({ method: command.method, payload: command.payload }),
        }),
      );
      if (!started.ok) throw Error("synthetic start");
      await called;
      const query: RuntimeCommand = {
        schemaVersion: 1,
        requestId: randomUUID(),
        method: "agent.get",
        payload: { runId: started.data.runId },
      };
      const contenders = [];
      try {
        for (const alias of input.aliases ?? []) {
          const other = await launch(alias);
          contenders.push({
            ready: other.ready,
            exitCode: await other.close(),
            stderr: other.stderr,
            live: await first.request(query),
          });
        }
      } finally {
        await first.close();
      }
      const successor = await launch(input.database);
      result = {
        firstReady: first.ready,
        firstStderr: first.stderr,
        contenders,
        successorReady: successor.ready,
        recovered: await successor.request(query),
        requests,
      };
      await successor.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    } else if (input.mode === "reject") {
      const raw = await launch(input.database);
      const exitCode = await raw.close();
      const main = new BusinessWorker(input.entry, input.database);
      const connections: boolean[] = [];
      main.onRunEvents((signal) => {
        if (signal.type === "events.connection") connections.push(signal.connected);
      });
      const reply = await main.request({
        schemaVersion: 1,
        requestId: randomUUID(),
        method: "workspace.get",
      });
      await main.close();
      result = { ready: raw.ready, exitCode, connections, reply, stderr: raw.stderr };
    } else {
      let requests = 0;
      const server = createServer((_req, res) => {
        requests++;
        res.writeHead(500).end();
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw Error("fixture server");
      const main = new BusinessWorker(
        input.entry,
        input.database,
        `http://127.0.0.1:${address.port}`,
      );
      const connections: boolean[] = [];
      main.onRunEvents((signal) => {
        if (signal.type === "events.connection") connections.push(signal.connected);
      });
      try {
        const query = (method: "agent.list" | "trade.get"): RuntimeCommand =>
          method === "agent.list"
            ? { schemaVersion: 1, requestId: randomUUID(), method, payload: { limit: 50 } }
            : { schemaVersion: 1, requestId: randomUUID(), method };
        const runs = await main.request(query("agent.list"));
        const board = await main.request(query("trade.get"));
        const replays = [];
        for (const command of input.commands ?? [])
          replays.push(
            await main.request(command, { key: "synthetic-gate-key", model: "synthetic-model" }),
          );
        result = { connections, runs, board, replays, requests };
      } finally {
        await main.close();
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }
    // Electron app.exit does not wait for buffered pipe output to finish.
    await new Promise<void>((resolve, reject) => {
      process.stdout.write(`GATE_RESULT=${JSON.stringify(result)}\n`, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
}
void main();
