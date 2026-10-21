import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/desktop/package.json", import.meta.url));
const electron = require("electron");
// Use Electron's Node ABI, matching the production native SQLite module.
const result = spawnSync(electron, ["node_modules/vitest/vitest.mjs", "run"], {
  stdio: "inherit",
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
});
process.exit(result.status ?? 1);
