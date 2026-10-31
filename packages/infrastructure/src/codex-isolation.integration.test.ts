import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { z } from "zod";
import { CodexHarness } from "./codex-harness";

const live = process.env.TRADEQUOTE_VERIFY_CODEX === "1" ? it : it.skip;
live(
  "native Codex model registry excludes execution, web and MCP tools from inherited synthetic configuration",
  async () => {
    const home = await mkdtemp(join(tmpdir(), "tq-codex-config-test-"));
    let advertised: unknown;
    const server = createServer(async (request, response) => {
      let text = "";
      for await (const chunk of request) text += chunk;
      advertised = JSON.parse(text).tools;
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({ error: { message: "synthetic protocol inspection; no inference" } }),
      );
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("fixture port");
    const marker = join(home, "mcp-started.txt");
    const mcp = join(home, "synthetic-mcp.cjs");
    await writeFile(
      mcp,
      `require('node:fs').writeFileSync(${JSON.stringify(marker)},'started');process.stdin.resume();`,
    );
    await writeFile(
      join(home, "config.toml"),
      `model_provider="synthetic"\nmodel="synthetic-model"\nweb_search="live"\n[model_providers.synthetic]\nname="Synthetic"\nbase_url="http://127.0.0.1:${address.port}/v1"\nenv_key="SYNTHETIC_CODEX_KEY"\nwire_api="responses"\nrequires_openai_auth=false\nrequest_max_retries=0\nstream_max_retries=0\n[mcp_servers.synthetic]\ncommand=${JSON.stringify(process.execPath)}\nargs=[${JSON.stringify(mcp)}]\nstartup_timeout_sec=1\n`,
    );
    try {
      const harness = new CodexHarness({
        timeoutMs: 15000,
        launch: (cwd, args) =>
          spawn("codex", args, {
            cwd,
            env: {
              PATH: process.env.PATH,
              HOME: home,
              CODEX_HOME: home,
              SYNTHETIC_CODEX_KEY: "synthetic-not-a-secret",
              ELECTRON_RUN_AS_NODE: "1",
            },
            stdio: ["pipe", "pipe", "pipe"],
          }),
      });
      await expect(
        harness.run({
          policy: "read",
          instruction: "synthetic inspection",
          context: {},
          tools: [
            {
              name: "search_catalog",
              description: "fixture",
              inputSchema: z.strictObject({}),
              invoke: async () => ({}),
            },
          ],
          availableTools: () => ["search_catalog"],
          cancellation: new AbortController().signal,
        }),
      ).rejects.toBeDefined();
      expect(advertised).toBeDefined();
      console.log(
        JSON.stringify({
          kind: "synthetic-native-tool-registry",
          names: Array.isArray(advertised) ? advertised.map((tool) => tool.name) : [],
        }),
      );
      expect(Array.isArray(advertised) && advertised.map((tool) => tool.name).sort()).toEqual([
        "request_user_input",
        "tradequote_search_catalog",
      ]);
      // Inventory can initialize configured MCPs; none is exposed in the business thread.
      expect(await readFile(marker, "utf8")).toBe("started");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(home, { recursive: true, force: true });
    }
  },
  25000,
);
