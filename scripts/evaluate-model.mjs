import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Match the Electron SQLite ABI without touching the user's actual app/data/settings.
if (!process.versions.electron) {
  const require = createRequire(new URL("../apps/desktop/package.json", import.meta.url));
  const result = spawnSync(
    require("electron"),
    [fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    {
      stdio: "inherit",
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    },
  );
  process.exit(result.status ?? 1);
}
const args = process.argv.slice(2);
let server;
try {
  const flags = new Map();
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i],
      value = args[i + 1];
    if (
      !["--mode", "--output"].includes(name) ||
      !value ||
      value.startsWith("--") ||
      flags.has(name)
    )
      throw new Error("arguments");
    flags.set(name, value);
  }
  const mode = flags.get("--mode");
  if (!["fixture", "deepseek"].includes(mode)) throw new Error("mode");
  const root = fileURLToPath(new URL("../", import.meta.url));
  const { createServer } = await import("vite");
  server = await createServer({
    root,
    configFile: false,
    logLevel: "silent",
    server: { middlewareMode: true, hmr: false, ws: false },
  });
  const { evaluateC04 } = await server.ssrLoadModule(
    "/packages/infrastructure/src/evaluation/runner.ts",
  );
  const { markdownReport } = await server.ssrLoadModule(
    "/packages/infrastructure/src/evaluation/report.ts",
  );
  // No key flags, key files, environment credentials or settings decryption. The trusted-host
  // real-provider seam is intentionally not wired to desktop IPC in this fixture-first slice.
  const report = await evaluateC04({ mode });
  const output = resolve(root, flags.get("--output") ?? `.runtime/c04-${mode}`);
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  await writeFile(`${output}.json`, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  await writeFile(`${output}.md`, markdownReport(report), { mode: 0o600 });
  console.log(
    JSON.stringify({
      mode,
      status: report.status,
      cases: report.rows.length,
      modelCalls: report.modelCalls,
      realRequests: report.realRequests,
    }),
  );
  process.exitCode = report.status === "passed" ? 0 : report.status === "not_run" ? 2 : 1;
} catch {
  console.error(
    "C04 evaluation failed. Use --mode fixture|deepseek [--output report-prefix]. No raw error or provider payload is logged.",
  );
  process.exitCode = 1;
} finally {
  await server?.close();
}
