import { execFileSync } from "node:child_process";
import {
  constants,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "apps/desktop/package.json"));
export function desktopExecutable() {
  const original = require("electron");
  if (process.platform !== "darwin") return original;
  const source = resolve(original, "../../..");
  const cache = join(root, ".runtime/desktop");
  const bundle = join(cache, "TradeQuote.app");
  const stamp = JSON.stringify({
    original,
    electron: require("electron/package.json").version,
    revision: 1,
  });
  const executable = join(bundle, "Contents/MacOS/Electron");
  const manifest = join(cache, "identity.json");
  if (existsSync(executable) && existsSync(manifest) && readFileSync(manifest, "utf8") === stamp)
    return executable;
  mkdirSync(cache, { recursive: true });
  const staging = join(cache, `TradeQuote-${process.pid}.app`);
  try {
    cpSync(source, staging, {
      recursive: true,
      verbatimSymlinks: true,
      mode: constants.COPYFILE_FICLONE,
    });
    const plist = join(staging, "Contents/Info.plist");
    for (const [key, value] of [
      ["CFBundleName", "TradeQuote"],
      ["CFBundleDisplayName", "TradeQuote"],
      ["CFBundleIdentifier", "local.tradequote.desktop.dev"],
    ]) {
      execFileSync("/usr/libexec/PlistBuddy", ["-c", `Set :${key} ${value}`, plist], {
        stdio: "pipe",
      });
    }
    // Metadata changes invalidate the upstream signature. Only re-sign this local copy.
    execFileSync("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", staging], {
      stdio: "pipe",
    });
    rmSync(bundle, { recursive: true, force: true });
    renameSync(staging, bundle);
    writeFileSync(manifest, stamp);
    return executable;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
