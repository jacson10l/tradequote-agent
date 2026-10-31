#!/usr/bin/env node
import { spawnSync } from "node:child_process";
/**
 * B re-runnable contract review probe.
 *
 * Purpose: turn the ad-hoc review replay into a fixed, repeatable artefact. It runs the named
 * contract/domain suites, records the exact commit, per-file SHA-256 and machine environment, and
 * writes one JSON file that reviewers can diff. Coverage is declared (not inferred) so a removed
 * case is visible as a missing caseId rather than a silently smaller total.
 *
 * Usage:
 *   node scripts/contract-review-probe.mjs --out wiki-project/raw/b-contract-probe.json
 *   node scripts/contract-review-probe.mjs --list
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const targets = [
  "packages/contracts/src/maintenance-evidence.test.ts",
  "packages/contracts/src/knowledge-maintenance.test.ts",
  "packages/domain/src/quote-checks.test.ts",
];
/** Production sources the probe's verdicts depend on; pinned so a review can be replayed exactly. */
const probedSources = [
  "packages/contracts/src/knowledge-maintenance.ts",
  "packages/contracts/src/knowledge-wiki.ts",
  "packages/contracts/src/knowledge.ts",
  "packages/domain/src/quote-checks.ts",
  "packages/domain/src/quote-checks.samples.ts",
];
/** Declared coverage: every review axis the probe must keep. */
const requiredCoverage = {
  permission: ["EVID-03", "EVID-09"],
  evidenceMismatch: ["EVID-04", "EVID-05", "EVID-07", "EVID-08"],
  idempotency: ["EVID-11"],
  exchangeIntegrity: ["EVID-10", "EVID-12"],
  eligibilityMatrix: ["EVID-01", "EVID-02", "EVID-06"],
  quoteSamples: ["QUOTE-01", "QUOTE-02", "QUOTE-03", "QUOTE-04", "QUOTE-05", "QUOTE-06"],
};
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : (args[index + 1] ?? fallback);
};
const git = (gitArgs) => {
  const result = spawnSync("git", gitArgs, { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
};
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function caseIds() {
  const found = [];
  for (const target of targets) {
    const text = await readFile(join(root, target), "utf8");
    for (const match of text.matchAll(/\bit\(\s*"([A-Z]+-\d+)/gu)) found.push(match[1]);
  }
  return found;
}

if (flag("--list")) {
  const ids = await caseIds();
  process.stdout.write(`${ids.join("\n")}\n`);
  process.exit(0);
}

const outPath = option("--out", "wiki-project/raw/b-contract-probe.json");
const reportPath = join(root, ".probe-report.json");
const startedAt = new Date().toISOString();
const command = [
  "node",
  "node_modules/vitest/vitest.mjs",
  "run",
  ...targets,
  "--reporter=json",
  `--outputFile=${reportPath}`,
];
const run = spawnSync(command[0], command.slice(1), { cwd: root, encoding: "utf8" });
const exitCode = run.status ?? 1;
let raw = null;
try {
  raw = JSON.parse(await readFile(reportPath, "utf8"));
} catch {
  raw = null;
} finally {
  await rm(reportPath, { force: true });
}
if (!raw) {
  process.stderr.write(`${run.stdout}\n${run.stderr}\n`);
  throw new Error("探针未生成可解析的 vitest JSON 报告");
}
const files = [];
for (const [role, list] of [
  ["test", targets],
  ["source", probedSources],
]) {
  for (const target of list) {
    const absolute = join(root, target);
    files.push({
      role,
      path: target,
      sha256: existsSync(absolute) ? sha256(await readFile(absolute)) : null,
    });
  }
}
const cases = [];
for (const suite of raw.testResults ?? []) {
  for (const assertion of suite.assertionResults ?? []) {
    const caseId = /([A-Z]+-\d+)/u.exec(assertion.fullName ?? "")?.[1] ?? null;
    cases.push({
      caseId,
      title: assertion.fullName,
      file: relative(root, suite.name ?? "").replace(/\\/gu, "/"),
      status: assertion.status,
      durationMs: assertion.duration ?? null,
      failure: (assertion.failureMessages ?? []).join("\n").slice(0, 2000) || null,
    });
  }
}
cases.sort((a, b) => (a.caseId ?? "").localeCompare(b.caseId ?? ""));
const observed = new Set(cases.filter((item) => item.caseId).map((item) => item.caseId));
const coverage = Object.fromEntries(
  Object.entries(requiredCoverage).map(([axis, ids]) => [
    axis,
    {
      required: ids,
      missing: ids.filter((id) => !observed.has(id)),
      failed: cases
        .filter((item) => ids.includes(item.caseId) && item.status !== "passed")
        .map((item) => item.caseId),
    },
  ]),
);
const missing = Object.values(coverage).flatMap((entry) => entry.missing);
const failed = cases
  .filter((item) => item.status !== "passed")
  .map((item) => item.caseId ?? item.title);
const dirty = git(["status", "--porcelain"]).split("\n").filter(Boolean);
const evidence = {
  status: exitCode === 0 && failed.length === 0 && missing.length === 0 ? "passed" : "failed",
  checks: [{ name: "b-contract-review-probe", command: command.join(" "), exitCode }],
  probe: "b-contract-review-probe",
  probeVersion: 1,
  reason: option("--reason", "B 契约证据资格与规则样例复核"),
  generatedAt: new Date().toISOString(),
  startedAt,
  source: {
    commit: git(["rev-parse", "HEAD"]),
    branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
    worktree: dirty.length === 0 ? "clean" : "dirty",
    dirtyPaths: dirty.map((line) => line.slice(3)).slice(0, 50),
    files,
  },
  runner: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    command: command.join(" "),
  },
  targets,
  coverage,
  cases,
  summary: {
    total: cases.length,
    passed: cases.filter((item) => item.status === "passed").length,
    failed: failed.length,
    missingCaseIds: missing,
    ok: exitCode === 0 && failed.length === 0 && missing.length === 0,
  },
  exitCode,
};
await mkdir(dirname(join(root, outPath)), { recursive: true });
await writeFile(join(root, outPath), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
process.stdout.write(
  [
    `probe: ${evidence.summary.passed}/${evidence.summary.total} passed, exit=${exitCode}`,
    `commit: ${evidence.source.commit} (${evidence.source.worktree})`,
    `missing caseIds: ${missing.length === 0 ? "none" : missing.join(", ")}`,
    `failed: ${failed.length === 0 ? "none" : failed.join(", ")}`,
    `evidence: ${outPath}`,
  ].join("\n") + "\n",
);
process.exit(evidence.summary.ok ? 0 : 1);
