import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { desktopExecutable } from "./desktop-executable.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "apps/desktop/package.json"));
test("macOS native process and runtime display TradeQuote while upstream Electron stays intact", {
  skip: process.platform !== "darwin",
  timeout: 30000,
}, async () => {
  const original = require("electron");
  const plist = resolve(original, "../../Info.plist");
  const before = readFileSync(plist);
  const executable = desktopExecutable();
  assert.deepEqual(readFileSync(plist), before);
  assert.equal(desktopExecutable(), executable);
  const data = mkdtempSync(join(tmpdir(), "tradequote-identity-"));
  const ready = join(data, "identity.json");
  const fixture = join(data, "main.cjs");
  writeFileSync(
    fixture,
    `const {app}=require('electron');
const {writeFileSync}=require('node:fs');
app.setPath('userData', process.env.TRADEQUOTE_IDENTITY_TEST_DATA);
app.setName('TradeQuote');
app.whenReady().then(()=>writeFileSync(process.env.TRADEQUOTE_IDENTITY_TEST_READY, JSON.stringify({name:app.getName(),userData:app.getPath('userData')})));
`,
  );
  const child = spawn(executable, [fixture], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "",
      TRADEQUOTE_IDENTITY_TEST_DATA: data,
      TRADEQUOTE_IDENTITY_TEST_READY: ready,
    },
    stdio: "ignore",
  });
  try {
    const deadline = Date.now() + 15000;
    while (!existsSync(ready) && Date.now() < deadline && child.exitCode === null)
      await new Promise((resolve) => setTimeout(resolve, 50));
    assert.ok(existsSync(ready), `developer Electron did not start (exit ${child.exitCode})`);
    const state = JSON.parse(readFileSync(ready, "utf8"));
    assert.equal(state.name, "TradeQuote");
    assert.equal(state.userData, data);
    const nativeName = execFileSync(
      "/usr/bin/osascript",
      [
        "-l",
        "JavaScript",
        "-e",
        `ObjC.import('AppKit'); $.NSRunningApplication.runningApplicationWithProcessIdentifier(${child.pid}).localizedName.js`,
      ],
      { encoding: "utf8", timeout: 5000 },
    ).trim();
    assert.equal(nativeName, "TradeQuote");
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    }
    rmSync(data, { recursive: true, force: true });
  }
});
