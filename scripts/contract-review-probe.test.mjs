import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * Guards the probe's declared coverage. Runs only `--list` (no vitest spawn) so `pnpm check` stays
 * fast; the full replay is `node scripts/contract-review-probe.mjs --out <path>`.
 */
const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, "$1");
const probe = spawnSync(process.execPath, ["scripts/contract-review-probe.mjs", "--list"], {
  cwd: root,
  encoding: "utf8",
});
const ids = probe.stdout.trim().split(/\r?\n/u).filter(Boolean);

test("probe lists every executable case and exits 0", () => {
  assert.equal(probe.status, 0, probe.stderr);
  assert.ok(ids.length >= 18, `expected at least 18 cases, got ${ids.length}`);
  assert.equal(new Set(ids).size, ids.length, "case ids must be unique");
});

test("probe keeps explicit coverage for permission, evidence mismatch and same-key replay", () => {
  const source = readFileSync(
    new URL("../scripts/contract-review-probe.mjs", import.meta.url),
    "utf8",
  );
  for (const axis of ["permission", "evidenceMismatch", "idempotency", "quoteSamples"]) {
    assert.match(source, new RegExp(`${axis}: \\[`, "u"), `missing declared axis ${axis}`);
  }
  for (const required of ["EVID-03", "EVID-09", "EVID-04", "EVID-07", "EVID-11", "QUOTE-02"])
    assert.ok(ids.includes(required), `missing required case ${required}`);
});

test("samples stay synthetic and versioned", () => {
  const samples = readFileSync(
    new URL("../packages/domain/src/quote-checks.samples.ts", import.meta.url),
    "utf8",
  );
  assert.match(samples, /export const sampleVersion = "b01-quote-checks-samples-v1"/u);
  assert.match(samples, /sourceStatus: "synthetic"/u);
  assert.match(samples, /非真实供应商/u);
});
