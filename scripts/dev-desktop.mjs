import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { desktopExecutable } from "./desktop-executable.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(new URL("../apps/desktop/package.json", import.meta.url));
const cli = resolve(dirname(require.resolve("electron-vite/package.json")), "bin/electron-vite.js");
const child = spawn(process.execPath, [cli, "dev", ...process.argv.slice(2)], {
  cwd: resolve(root, "apps/desktop"),
  env: { ...process.env, ELECTRON_EXEC_PATH: desktopExecutable() },
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
