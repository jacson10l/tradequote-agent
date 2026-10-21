import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkLineEndings } from "./check-line-endings.mjs";

const policy = fs.readFileSync(new URL("../.gitattributes", import.meta.url));
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tradequote-eol-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: "pipe" });
  const write = (name, content) => fs.writeFileSync(path.join(root, name), content);
  git("init", "-q");
  git("config", "core.autocrlf", "false");
  git("config", "core.safecrlf", "false");
  write(".gitattributes", policy);
  return { root, git, write };
}

test("tracked and new text use LF; binary assets retain CRLF bytes; check is read-only", (t) => {
  const { root, git, write } = fixture(t);
  const binary = Buffer.from([0, 13, 10, 255]);
  write("asset.png", binary);
  write("unknown.blob", binary);
  write("archive.md", "archive\n");
  git("add", ".");
  write("新 文件.json", "{}\n");
  const before = git("status", "--porcelain=v1");
  assert.equal(checkLineEndings(root).status, "passed");
  assert.equal(git("status", "--porcelain=v1"), before);
  assert.deepEqual(fs.readFileSync(path.join(root, "asset.png")), binary);
});

test("CRLF and mixed endings fail even after git add normalizes the index", (t) => {
  const { root, git, write } = fixture(t);
  write("archive.md", "first\n");
  git("add", ".");
  write("archive.md", "first\r\n");
  write("新 文件.json", "{\r\n}\n");
  git("add", "archive.md");
  assert.throws(() => checkLineEndings(root), /archive.md: WORKTREE_CRLF/);
  assert.throws(() => checkLineEndings(root), /新 文件.json: WORKTREE_CRLF/);
  assert.equal(fs.readFileSync(path.join(root, "archive.md"), "utf8"), "first\r\n");
});

test("missing or overridden LF policy fails even when current bytes are LF", (t) => {
  const { root, write } = fixture(t);
  write("source.ts", "export {};\n");
  write(".gitattributes", "* text=auto\n");
  assert.throws(() => checkLineEndings(root), /source.ts: LF_ATTRIBUTE_REQUIRED/);
  write(".gitattributes", `${policy}\n*.ts text eol=crlf\n`);
  assert.throws(() => checkLineEndings(root), /source.ts: LF_ATTRIBUTE_REQUIRED/);
});

test("preexisting CRLF index requires renormalization", (t) => {
  const { root, git, write } = fixture(t);
  write(".gitattributes", "* -text\n");
  write("archive.md", "archive\r\n");
  git("add", ".");
  write(".gitattributes", policy);
  write("archive.md", "archive\n");
  assert.throws(() => checkLineEndings(root), /archive.md: INDEX_CRLF/);
  git("add", "--renormalize", ".");
  assert.equal(checkLineEndings(root).status, "passed");
});

for (const autocrlf of ["true", "false"]) {
  test(`fresh checkout with core.autocrlf=${autocrlf} preserves text and binary bytes`, (t) => {
    const { root, git, write } = fixture(t);
    const files = {
      "archive.md": Buffer.from("归档\noriginal\n"),
      "generated.json": Buffer.from('{"hash":"synthetic"}\n'),
      "asset.png": Buffer.from([0, 13, 10, 255]),
      "document.pdf": Buffer.from("%PDF-synthetic\r\n"),
      "new-extension.fixture": Buffer.from("text\n"),
    };
    for (const [name, content] of Object.entries(files)) write(name, content);
    git("add", ".");
    git("config", "core.autocrlf", autocrlf);
    for (const name of Object.keys(files)) fs.unlinkSync(path.join(root, name));
    git("checkout-index", "--all", "--force");
    for (const [name, content] of Object.entries(files)) {
      assert.deepEqual(fs.readFileSync(path.join(root, name)), content, name);
    }
    assert.equal(checkLineEndings(root).status, "passed");
  });
}
