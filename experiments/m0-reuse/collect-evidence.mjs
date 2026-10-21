import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { platform, arch, release } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

process.chdir(dirname(fileURLToPath(import.meta.url)));
mkdirSync("evidence", { recursive: true });
const hash = path => createHash("sha256").update(readFileSync(path)).digest("hex");
const source = JSON.parse(readFileSync("vendor/solivio/provenance.json", "utf8"));
for (const file of source.files) {
  assert.equal(hash(file.localPath.replace("experiments/m0-reuse/", "")), file.sha256);
}
const commands = [
  ["pnpm", ["exec", "tsx", "--test", "solivio.test.ts"], "solivio.tap"],
  [process.execPath, ["harness-probe.mjs"], "harness.stdout.log"],
];
const runs = commands.map(([command, args, output]) => {
  const started = performance.now();
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 90000 });
  writeFileSync(`evidence/${output}`, result.stdout + result.stderr);
  return { command: [command === process.execPath ? "node" : command, ...args].join(" "), exitCode: result.status, elapsedMs: Math.round(performance.now() - started), output, error: result.error?.message };
});
const clientRequire = createRequire(import.meta.resolve("@deepseek-ai/dsh-sdk-client"));
const versions = {};
for (const name of ["@deepseek-ai/dsh", "@deepseek-ai/dsh-sdk-client"]) {
  versions[name] = JSON.parse(readFileSync(clientRequire.resolve(`${name}/package.json`), "utf8")).version;
}
assert.equal(versions["@deepseek-ai/dsh"], versions["@deepseek-ai/dsh-sdk-client"]);
const files = ["package.json", "pnpm-lock.yaml", "solivio.test.ts", "business-tools.mjs", "harness-probe.mjs", "collect-evidence.mjs", "evidence/harness.json", "evidence/solivio.tap"];
const report = {
  at: new Date().toISOString(),
  environment: { node: process.version, pnpm: spawnSync("pnpm", ["--version"], { encoding: "utf8" }).stdout.trim(), platform: platform(), arch: arch(), release: release() },
  credentials: { deepseekKeyPresent: Object.hasOwn(process.env, "DEEPSEEK_API_KEY"), configuredModelPresent: Object.hasOwn(process.env, "DEEPSEEK_MODEL"), secretValuesRead: false },
  scope: "upstream extraction and installed Harness against synthetic local services",
  versions, directDependencies: JSON.parse(readFileSync("package.json", "utf8")).dependencies,
  solivioSourceHashesVerified: true,
  commands: runs,
  notRun: ["real DeepSeek inference", "Electron packaging/installation", "Windows", "production SQLite transaction/crash recovery", "PDF/RTL", "full Solivio application"],
  sha256: Object.fromEntries(files.map(path => [path, hash(path)])),
};
writeFileSync("evidence/summary.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
if (runs.some(run => run.exitCode !== 0)) process.exitCode = 1;
