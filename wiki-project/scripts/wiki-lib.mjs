import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export const types = new Set(["architecture", "module", "process", "interface", "glossary", "risk-register", "current-state", "task", "decision", "meta"]);
export const statuses = new Set(["verified", "observed", "active", "draft", "done"]);
export const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export const sha = value => createHash("sha256").update(value).digest("hex");
export const lines = text => text ? text.replace(/\r?\n$/, "").split(/\r?\n/).length : 0;
export const json = value => JSON.stringify(value, null, 2) + "\n";
export const fail = (file, rule) => { throw new Error(`${file}: ${rule}`); };

export function projectRoot(input) {
  if (!input) fail("参数", "请提供项目根路径");
  const root = fs.realpathSync(input);
  safePath(root, "wiki-project");
  return root;
}

// Reject symlinks in every path component before reading/writing. This also
// prevents output-directory and source-reference escapes, not just scan escapes.
export function safePath(root, relative) {
  const absolute = path.resolve(root, relative);
  const rel = path.relative(root, absolute);
  if (rel.startsWith(`..${path.sep}`) || rel === ".." || path.isAbsolute(rel)) fail(relative, "PATH_ESCAPE");
  let cursor = root;
  for (const part of rel.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    try { if (fs.lstatSync(cursor).isSymbolicLink()) fail(relative, "SYMLINK_NOT_ALLOWED"); }
    catch (error) { if (error.code === "ENOENT") break; throw error; }
  }
  return absolute;
}
export const read = (root, relative) => fs.readFileSync(safePath(root, relative), "utf8");
export function readJson(root, relative) {
  const text = read(root, relative);
  const issues = sensitiveContent(text);
  if (issues.length) fail(relative, issues.join(","));
  try { return JSON.parse(text); } catch { fail(relative, "JSON_INVALID"); }
}
export function write(root, relative, text) {
  const absolute = safePath(root, relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, text);
}

const ignoredDirs = new Set(["wiki-project", ".git", "node_modules", ".runtime", ".scratch", ".cache", ".next", ".turbo", ".venv", "__pycache__", "dist", "build", "target", "coverage", "release", "out", ".ssh", ".aws", ".gnupg"]);
export const sensitiveName = name => /^\.env(?:\.|$)/i.test(name)
  || /^(?:\.npmrc|\.pypirc|\.netrc|id_rsa|id_ed25519|credentials(?:\..*)?|secrets?(?:\..*)?|tokens?(?:\..*)?|cookies?(?:\..*)?|passwords?(?:\..*)?|auth\.json)$/i.test(name)
  || /\.(?:pem|key|p12|pfx|db|sqlite|sqlite3)(?:-wal|-shm)?$/i.test(name);
const extensions = new Set([".md", ".json", ".yaml", ".yml", ".toml", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".html", ".sql", ".rs", ".py", ".sh"]);
export function scan(root, config) {
  const files = [], excluded = [];
  function visit(dir = "") {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true }).sort((a, b) => cmp(a.name, b.name))) {
      const rel = [dir, entry.name].filter(Boolean).join("/");
      if (entry.isSymbolicLink()) { excluded.push({ path: rel, reason: "symlink-not-followed" }); continue; }
      if (sensitiveName(entry.name)) { excluded.push({ path: rel, reason: "sensitive-name-not-read" }); continue; }
      if (entry.isDirectory()) {
        if (ignoredDirs.has(entry.name)) { excluded.push({ path: rel, reason: "excluded-directory" }); continue; }
        visit(rel); continue;
      }
      if (!entry.isFile()) continue;
      if (!extensions.has(path.extname(entry.name)) && ![".gitignore", "LICENSE", "NOTICE"].includes(entry.name)
        && !config.extraFiles.includes(rel)) { excluded.push({ path: rel, reason: "non-managed-type" }); continue; }
      const buffer = fs.readFileSync(safePath(root, rel));
      const text = buffer.toString("utf8");
      if (!Buffer.from(text).equals(buffer)) fail(rel, "NON_UTF8_MANAGED_FILE");
      const issues = sensitiveContent(text);
      if (issues.length) fail(rel, issues.join(","));
      const mapping = config.coverage[rel];
      if (!mapping?.pages?.length || !mapping.role) fail(rel, "UNCOVERED_FILE：先阅读源码并登记 coverage");
      files.push({ path: rel, type: path.extname(rel).slice(1) || entry.name, lines: lines(text), bytes: buffer.length, sha256: sha(buffer), ...mapping, text });
    }
  }
  visit();
  for (const rel of Object.keys(config.coverage)) {
    if (!files.some(file => file.path === rel)) fail(rel, "STALE_COVERAGE：映射指向未纳管文件");
  }
  return { files: files.sort((a, b) => cmp(a.path, b.path)), excluded };
}

export function sensitiveContent(text) {
  const rules = [
    ["PRIVATE_KEY", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ["API_TOKEN", /\b(?:sk-[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16})\b/],
    ["JWT", /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/],
    ["SECRET_LITERAL", /(?:api[_-]?key|password|access[_-]?token|secret)\s*[:=]\s*["'][A-Za-z0-9_+/-]{24,}["']/i],
    ["PERSONAL_ID", /(?<!\d)[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dX](?!\d)/],
    ["PERSONAL_PHONE", /(?:手机号|手机号码|联系电话)\s*[:：]\s*(?:\+86[- ]?)?1[3-9]\d{9}/],
    ["PERSONAL_EMAIL", /\b[A-Z0-9._%+-]+@(?!example\.(?:com|org|net)\b)[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ];
  return rules.filter(([, regex]) => regex.test(text)).map(([name]) => name);
}

// Deliberately small, documented YAML subset: strings, list-of-strings and [].
// Unsupported syntax fails; no evaluation of YAML tags or expressions.
export function frontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error("FRONTMATTER_MISSING");
  const fields = {};
  let list;
  function scalar(value) {
    if (value.startsWith('"')) return JSON.parse(value);
    if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replaceAll("''", "'");
    if (/[\[\]{}]|^!!|^[>|&*]/.test(value)) throw new Error("FRONTMATTER_UNSUPPORTED");
    return value;
  }
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const item = line.match(/^  - (.+)$/);
    if (item && list) { fields[list].push(scalar(item[1])); continue; }
    const field = line.match(/^([a-zA-Z][\w-]*):(?: (.*))?$/);
    if (!field || Object.hasOwn(fields, field[1])) throw new Error("FRONTMATTER_SYNTAX");
    list = undefined;
    if (field[2] === undefined || field[2] === "[]") { fields[field[1]] = []; list = field[1]; }
    else fields[field[1]] = scalar(field[2]);
  }
  return { fields, body: text.slice(match[0].length) };
}
export const validDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export const prose = text => text.replace(/^```[^\n]*\n[\s\S]*?^```[^\n]*$/gm, "").replace(/`[^`\n]+`/g, "");
export function wikiFiles(root, dir) {
  const result = [];
  for (const entry of fs.readdirSync(safePath(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isSymbolicLink()) fail(rel, "SYMLINK_NOT_ALLOWED");
    if (sensitiveName(entry.name)) fail(rel, "SENSITIVE_WIKI_PATH_NOT_READ");
    if ([".git", "node_modules", ".runtime", ".scratch"].includes(entry.name)) fail(rel, "UNEXPECTED_WIKI_DIRECTORY");
    if (entry.isDirectory()) result.push(...wikiFiles(root, rel));
    else result.push(rel);
  }
  return result.sort(cmp);
}
export function reference(root, value) {
  const match = value.match(/^(wiki-repo:)?(.+):([1-9]\d*)$/);
  if (!match) throw new Error("SOURCE_REFERENCE_FORMAT");
  const relative = match[1] ? `wiki-project/${match[2]}` : match[2];
  if (relative.split("/").some(part => sensitiveName(part) || (ignoredDirs.has(part) && part !== "wiki-project"))) throw new Error("SENSITIVE_REFERENCE");
  const text = read(root, relative);
  if (Number(match[3]) > lines(text)) throw new Error("SOURCE_LINE_OUT_OF_RANGE");
  return { path: relative, implementation: !match[1] && /\.(?:[cm]?js|tsx?|jsx|rs|py|sql)$/.test(relative) };
}
export function meta(title, type, date, source = "wiki-repo:raw/source-manifest.md:1") {
  return `---\ntitle: ${title}\ntype: ${type}\nstatus: observed\nupdated: ${date}\nsources:\n  - ${source}\n---\n\n# ${title}\n\n`;
}
