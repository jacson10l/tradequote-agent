import { existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/desktop/package.json", import.meta.url));
// Electron 44 lazily materializes its executable; electron-vite requires path.txt at startup.
const executable = require("electron");
if (!existsSync(executable)) throw new Error("ELECTRON_BINARY_NOT_READY");
console.log("Electron executable ready");
