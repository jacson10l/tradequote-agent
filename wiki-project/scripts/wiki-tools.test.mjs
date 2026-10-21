import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { sha } from "./wiki-lib.mjs";

const original = fileURLToPath(new URL("../../", import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(original, "wiki-project/scripts/wiki-config.json"), "utf8"));
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tradequote-wiki-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(path.join(original, "wiki-project"), path.join(root, "wiki-project"), { recursive: true, dereference: false });
  for (const relative of Object.keys(config.coverage)) {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.copyFileSync(path.join(original, relative), path.join(root, relative));
  }
  // Negative source-reference tests own their valid baseline. The live status
  // page can change its evidence list as the product grows.
  const statusPage = path.join(root, "wiki-project/wiki/项目状态.md");
  const statusText = fs.readFileSync(statusPage, "utf8");
  const fixtureText = statusText.replace(/^sources:\n(?:  - .*\n)+/m, "sources:\n  - README.md:1\n");
  assert.ok(fixtureText.includes("  - README.md:1\n"), "source fixture was not installed");
  fs.writeFileSync(statusPage, fixtureText);
  return root;
}
function run(root, file, args = []) {
  return spawnSync(process.execPath, [path.join(root, "wiki-project/scripts", file), root, ...args], { encoding: "utf8", timeout: 15000 });
}
const generate = (root, ...args) => run(root, "build-code-index.mjs", args);
const lint = root => run(root, "lint-wiki.mjs");
function edit(root, relative, transform) {
  const absolute = path.join(root, relative);
  fs.writeFileSync(absolute, transform(fs.readFileSync(absolute, "utf8")));
}
function fingerprint(root, directory = "wiki-project") {
  const result = {};
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) Object.assign(result, fingerprint(root, relative));
    else if (entry.isFile()) result[relative] = [sha(fs.readFileSync(path.join(root, relative))), fs.statSync(path.join(root, relative)).mtimeMs];
  }
  return result;
}
function rejected(result, rule) {
  assert.notEqual(result.status, 0, "corrupted fixture unexpectedly passed");
  assert.match(result.stderr, rule);
}

test("same content deterministic; relocated root checks read-only; current Git HEAD does not invalidate baseline", t => {
  const root = fixture(t);
  assert.equal(generate(root).status, 0);
  const first = fs.readFileSync(path.join(root, "wiki-project/raw/generated/inventory.json"), "utf8");
  assert.equal(generate(root).status, 0);
  assert.equal(fs.readFileSync(path.join(root, "wiki-project/raw/generated/inventory.json"), "utf8"), first);
  const before = fingerprint(root);
  assert.equal(generate(root, "--check").status, 0);
  const checked = lint(root);
  assert.equal(checked.status, 0, checked.stderr);
  assert.deepEqual(fingerprint(root), before);
  for (const args of [["init", "-q"], ["-c", "user.name=Wiki fixture", "-c", "user.email=wiki@example.com", "commit", "--allow-empty", "-qm", "fixture"]]) {
    assert.equal(spawnSync("git", ["-C", root, ...args], { encoding: "utf8" }).status, 0);
  }
  assert.equal(generate(root, "--check").status, 0);
  rejected(generate(root, "--check", "--ingest"), /CHECK_IS_READ_ONLY/);
  assert.deepEqual(fingerprint(root), before);
});

test("source drift fails without writes; generation repairs snapshot while preserving ingest baseline", t => {
  const root = fixture(t);
  const baseline = fs.readFileSync(path.join(root, "wiki-project/raw/ingest-baseline.json"), "utf8");
  edit(root, "experiments/m0-reuse/business-tools.mjs", text => text + "\n// changed fixture\n");
  const before = fingerprint(root);
  rejected(generate(root, "--check"), /GENERATED_DRIFT/);
  assert.deepEqual(fingerprint(root), before);
  assert.equal(generate(root).status, 0);
  assert.equal(generate(root, "--check").status, 0);
  assert.equal(fs.readFileSync(path.join(root, "wiki-project/raw/ingest-baseline.json"), "utf8"), baseline);
});

test("explicit ingest records a non-Git project honestly", t => {
  const root = fixture(t);
  const result = generate(root, "--ingest");
  assert.equal(result.status, 0, result.stderr);
  const baseline = JSON.parse(fs.readFileSync(path.join(root, "wiki-project/raw/ingest-baseline.json"), "utf8"));
  assert.equal(baseline.git.head, null);
  assert.equal(baseline.git.branch, null);
  assert.equal(baseline.sourceRoot, fs.realpathSync(root));
  assert.equal(generate(root, "--check").status, 0);
});

test("tool inventory names come from definitions, not nested headers/output/schema fields", t => {
  const root = fixture(t);
  assert.equal(generate(root).status, 0);
  const text = fs.readFileSync(path.join(root, "wiki-project/raw/generated/命令与运行时清单.md"), "utf8");
  const section = text.split("## 业务工具注册\n")[1].split("\n## ")[0];
  const rows = section.split("\n").filter(row => /^\| \w+ \|/.test(row));
  const sources = [...new Set(rows.map(row => row.split("|")[2].trim().replace(/:\d+$/, "")))];
  assert.ok(sources.length > 0);
  for (const source of sources) {
    const names = rows.filter(row => row.split("|")[2].trim().replace(/:\d+$/, "") === source).map(row => row.split("|")[1].trim());
    assert.deepEqual(names, ["search_catalog", "calculate_quote", "create_quote_revision"]);
  }
});

test("new unclassified source fails; missing knowledge target and stale mapping fail", t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, "new-module.ts"), "export const value = 1;\n");
  rejected(generate(root), /UNCOVERED_FILE/);
  fs.unlinkSync(path.join(root, "new-module.ts"));
  edit(root, "wiki-project/scripts/wiki-config.json", text => {
    const c = JSON.parse(text); c.coverage["README.md"].pages = ["wiki/不存在.md"]; return JSON.stringify(c);
  });
  rejected(generate(root), /ENOENT/);
  fs.unlinkSync(path.join(root, "README.md"));
  rejected(generate(root), /STALE_COVERAGE/);
});

test("generated coverage tampering is detected by lint and remains untouched", t => {
  const root = fixture(t);
  edit(root, "wiki-project/raw/generated/源码覆盖矩阵.md", text => text.replace("business-tools.mjs", "missing-tools.mjs"));
  const before = fingerprint(root);
  rejected(lint(root), /GENERATED_DRIFT/);
  assert.deepEqual(fingerprint(root), before);
});

test("sensitive filename is excluded before read; external source symlink is not followed", t => {
  const root = fixture(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "tradequote-private-fixture-"));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  const secret = ["sk", "Z".repeat(30)].join("-");
  fs.writeFileSync(path.join(outside, "external.ts"), secret);
  fs.writeFileSync(path.join(root, ".env"), secret);
  fs.chmodSync(path.join(root, ".env"), 0);
  fs.symlinkSync(path.join(outside, "external.ts"), path.join(root, "linked.ts"));
  const result = generate(root, "--check");
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!result.stdout.includes(secret) && !result.stderr.includes(secret));
});

test("Wiki and generated-output symlinks cannot write outside project", t => {
  const root = fixture(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "tradequote-wiki-outside-"));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  const generated = path.join(root, "wiki-project/raw/generated");
  fs.rmSync(generated, { recursive: true });
  fs.symlinkSync(outside, generated);
  rejected(generate(root), /SYMLINK_NOT_ALLOWED/);
  assert.deepEqual(fs.readdirSync(outside), []);
  fs.unlinkSync(generated);
  const wiki = path.join(root, "wiki-project");
  fs.renameSync(wiki, path.join(root, "wiki-saved"));
  fs.symlinkSync(outside, wiki);
  const result = spawnSync(process.execPath, [path.join(original, "wiki-project/scripts/build-code-index.mjs"), root], { encoding: "utf8" });
  rejected(result, /SYMLINK_NOT_ALLOWED/);
});

const page = "wiki-project/wiki/项目状态.md";
for (const [name, transform, rule] of [
  ["missing schema field", text => text.replace(/^title:.*\n/m, ""), /MISSING_FIELD_title/],
  ["bad type", text => text.replace(/^type:.*$/m, "type: unknown"), /TYPE_INVALID/],
  ["bad date", text => text.replace(/^updated:.*$/m, "updated: 2026-02-30"), /DATE_INVALID/],
  ["bad status", text => text.replace(/^status:.*$/m, "status: unknown"), /STATUS_INVALID/],
  ["missing wiki target", text => text + "\n[[不存在的知识页]]\n", /WIKILINK_UNRESOLVED/],
  ["missing markdown target", text => text + "\n[失效](missing.md)\n", /MARKDOWN_LINK_INVALID/],
  ["invalid source line", text => text.replace("README.md:1", "README.md:999999"), /SOURCE_REFERENCE_INVALID/],
  ["verified without code evidence", text => text.replace(/^status:.*$/m, "status: verified"), /VERIFIED_NEEDS_IMPLEMENTATION_SOURCE/],
  ["source escaping project", text => text.replace("README.md:1", "../outside.md:1"), /SOURCE_REFERENCE_INVALID/],
  ["unfilled placeholder", text => text + "\n" + ["待", "填写"].join("") + "\n", /UNREPLACED_PLACEHOLDER/],
]) {
  test(name, t => {
    const root = fixture(t); edit(root, page, transform); rejected(lint(root), rule);
  });
}

test("all sources are validated even after a valid implementation source", t => {
  const root = fixture(t);
  edit(root, page, text => text.replace("  - README.md:1", "  - experiments/m0-reuse/business-tools.mjs:1\n  - missing.ts:1"));
  rejected(lint(root), /SOURCE_REFERENCE_INVALID/);
});

test("orphan pages and duplicate basenames are rejected", t => {
  const root = fixture(t);
  const text = fs.readFileSync(path.join(root, page), "utf8");
  fs.writeFileSync(path.join(root, "wiki-project/wiki/孤立页.md"), text);
  rejected(lint(root), /UNREACHABLE_FROM_INDEX/);
  fs.mkdirSync(path.join(root, "wiki-project/wiki/duplicate"));
  fs.writeFileSync(path.join(root, "wiki-project/wiki/duplicate/项目状态.md"), text);
  rejected(lint(root), /DUPLICATE_BASENAME/);
});

test("completed task requires actual verification record", t => {
  const root = fixture(t);
  edit(root, "wiki-project/wiki/tasks/2026-10-21-M0技术验证.md", text => text.replace(/^status:.*$/m, "status: done"));
  rejected(lint(root), /DONE_WITHOUT_VERIFICATION/);
});

test("archived source cannot bypass inspection through silent changes", t => {
  const root = fixture(t);
  edit(root, "wiki-project/raw/inputs/项目构建技术栈.md", text => text + "\nchanged archive\n");
  rejected(lint(root), /ARCHIVE_HASH_MISMATCH/);
});

test("source references cannot open excluded runtime data", t => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, ".runtime"));
  fs.writeFileSync(path.join(root, ".runtime/state.json"), "{}\n");
  edit(root, page, text => text.replace("README.md:1", ".runtime/state.json:1"));
  rejected(lint(root), /SOURCE_REFERENCE_INVALID/);
});

test("new JSON evidence is checked and sensitive Wiki filenames are rejected before read", t => {
  const root = fixture(t);
  const sample = ["sk", "B".repeat(32)].join("-");
  fs.writeFileSync(path.join(root, "wiki-project/raw/new-evidence.json"), JSON.stringify({ value: sample }));
  const result = lint(root);
  rejected(result, /API_TOKEN/);
  assert.ok(!result.stderr.includes(sample));
  fs.writeFileSync(path.join(root, "wiki-project/raw/.env"), sample);
  fs.chmodSync(path.join(root, "wiki-project/raw/.env"), 0);
  rejected(lint(root), /SENSITIVE_WIKI_PATH_NOT_READ/);
});

test("secret/JWT/private-key/PII detections redact the value in diagnostics", t => {
  const root = fixture(t);
  const originalText = fs.readFileSync(path.join(root, page), "utf8");
  const samples = [
    [["sk", "A".repeat(32)].join("-"), /API_TOKEN/],
    [["eyJ" + "a".repeat(15), "b".repeat(20), "c".repeat(20)].join("."), /JWT/],
    [["-----BEGIN", "PRIVATE KEY-----"].join(" "), /PRIVATE_KEY/],
    [["private", "person.test"].join("@"), /PERSONAL_EMAIL/],
  ];
  for (const [sample, rule] of samples) {
    fs.writeFileSync(path.join(root, page), originalText + "\n" + sample + "\n");
    const result = lint(root);
    rejected(result, rule);
    assert.ok(!result.stdout.includes(sample) && !result.stderr.includes(sample));
  }
});
