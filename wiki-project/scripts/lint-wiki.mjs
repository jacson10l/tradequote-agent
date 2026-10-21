import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "./build-code-index.mjs";
import { cmp, frontmatter, json, projectRoot, prose, read, readJson, reference, safePath, scan, sensitiveContent, sha, statuses, types, validDate, wikiFiles } from "./wiki-lib.mjs";

export function lint(root) {
  const errors = [];
  const error = (file, rule) => errors.push(`${file}: ${rule}`);
  // Check first, never regenerate on lint.
  try { build(root, { check: true }); } catch (issue) { error("生成器", issue.message); }
  const config = readJson(root, "wiki-project/scripts/wiki-config.json");
  // Archives are exempt from authored-page syntax/secret rules only while their
  // original approved hashes remain unchanged.
  try {
    const archive = JSON.parse(read(root, "wiki-project/raw/file-provenance.json"));
    for (const entry of archive.sources) {
      if (sha(fs.readFileSync(safePath(root, entry.copy))) !== entry.sha256) error(entry.copy, "ARCHIVE_HASH_MISMATCH");
    }
    for (const file of config.archivalMarkdown) {
      if (!archive.sources.some(entry => entry.copy === `wiki-project/${file}`)) error(file, "ARCHIVE_EXEMPTION_UNVERIFIED");
    }
  } catch { error("raw/file-provenance.json", "ARCHIVE_PROVENANCE_INVALID"); }
  for (const name of config.required) {
    try { read(root, `wiki-project/${name}`); } catch { error(name, "REQUIRED_FILE_MISSING_OR_UNSAFE"); }
  }
  const allFiles = wikiFiles(root, "wiki-project");
  const paths = allFiles.filter(file => file.endsWith(".md"));
  for (const file of allFiles.filter(file => !file.endsWith(".md") && /\.(?:mjs|json|log|tap)$/.test(file))) {
    const text = read(root, file);
    for (const rule of sensitiveContent(text)) error(file, rule);
    if (text.split("\n").some(line => /[ \t]+$/.test(line))) error(file, "TRAILING_WHITESPACE");
  }
  const byName = new Map(), documents = new Map(), edges = new Map();
  for (const file of paths) {
    const name = path.basename(file, ".md");
    if (byName.has(name)) error(file, "DUPLICATE_BASENAME");
    byName.set(name, file);
    documents.set(file, read(root, file));
    edges.set(file, new Set());
  }
  const semantic = file => file.startsWith("wiki-project/wiki/");
  const archival = file => config.archivalMarkdown.includes(file.replace("wiki-project/", ""));
  function addEdge(from, to) {
    if (edges.has(to)) edges.get(from).add(to);
  }
  for (const [file, text] of documents) {
    if (!archival(file)) {
      for (const rule of sensitiveContent(text)) error(file, rule);
      if (text.split("\n").some(line => /[ \t]+$/.test(line))) error(file, "TRAILING_WHITESPACE");
    }
    const needsSchema = semantic(file) || file.startsWith("wiki-project/raw/generated/");
    let body = text;
    if (needsSchema) {
      try {
        const parsed = frontmatter(text), fields = parsed.fields;
        body = parsed.body;
        for (const name of ["title", "type", "status", "updated", "sources"]) {
          if (!Object.hasOwn(fields, name)) error(file, `MISSING_FIELD_${name}`);
        }
        if (typeof fields.title !== "string" || !fields.title.trim()) error(file, "TITLE_INVALID");
        if (!types.has(fields.type)) error(file, "TYPE_INVALID");
        if (!statuses.has(fields.status)) error(file, "STATUS_INVALID");
        if (!validDate(fields.updated)) error(file, "DATE_INVALID");
        let implementation = false;
        if (!Array.isArray(fields.sources)) error(file, "SOURCES_NOT_LIST");
        else for (const source of fields.sources) {
          if (source.startsWith("conversation:") || /^https?:\/\//.test(source)) continue;
          try { const checked = reference(root, source); implementation = checked.implementation || implementation; }
          catch { error(file, "SOURCE_REFERENCE_INVALID"); }
        }
        if (fields.status === "verified" && !implementation) error(file, "VERIFIED_NEEDS_IMPLEMENTATION_SOURCE");
        if (fields.type === "task") {
          for (const heading of ["目标", "范围", "验收", "改动", "验证", "未完成项"]) {
            if (!new RegExp(`^## ${heading}\\s*$`, "m").test(body)) error(file, `TASK_SECTION_${heading}`);
          }
          if (fields.status === "done") {
            if (!Array.isArray(fields.verification) || !fields.verification.length) error(file, "DONE_WITHOUT_VERIFICATION");
            else for (const source of fields.verification) {
              try {
                const ref = reference(root, source);
                const record = JSON.parse(read(root, ref.path));
                if (record.status !== "passed" || !record.checks?.length || record.checks.some(c => c.exitCode !== 0)) throw new Error();
              } catch { error(file, "DONE_VERIFICATION_INVALID"); }
            }
          }
        }
        if (fields.type === "decision") {
          if (!/^\d{4}-.+\.md$/.test(path.basename(file))) error(file, "DECISION_FILENAME");
          for (const heading of ["背景", "决定", "替代方案", "后果", "回滚方式"]) {
            if (!new RegExp(`^## ${heading}\\s*$`, "m").test(body)) error(file, `DECISION_SECTION_${heading}`);
          }
        }
        if (/(?:\bTODO\b|\bTBD\b|待填写|待补充|YYYY-MM-DD|<填写[^>]*>)/.test(prose(body))) error(file, "UNREPLACED_PLACEHOLDER");
      } catch { error(file, "FRONTMATTER_INVALID"); }
    }
    // Archived external documents remain verbatim; their example links are not
    // project navigation. They still have unique names and must be reachable.
    if (archival(file)) continue;
    const content = prose(body);
    for (const match of content.matchAll(/\[\[([^\]]+)\]\]/g)) {
      const name = match[1].split("|")[0].split("#")[0];
      const target = byName.get(name);
      if (!target) error(file, "WIKILINK_UNRESOLVED");
      else addEdge(file, target);
    }
    for (const match of content.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
      let target = match[1].trim().replace(/^<|>$/g, "").split("#")[0];
      if (!target || /^(?:https?:|mailto:|app:|plugin:)/.test(target)) continue;
      try {
        target = decodeURIComponent(target);
        const resolved = path.relative(root, path.resolve(root, path.dirname(file), target)).split(path.sep).join("/");
        const absolute = safePath(root, resolved);
        if (!fs.existsSync(absolute)) throw new Error();
        addEdge(file, resolved);
      } catch { error(file, "MARKDOWN_LINK_INVALID"); }
    }
    // Explicit source anchors outside fenced examples, including inline code.
    const withoutFences = body.replace(/^```[^\n]*\n[\s\S]*?^```[^\n]*$/gm, "");
    for (const match of withoutFences.matchAll(/(?:wiki-repo:)?[\w./\-\u4e00-\u9fff]+\.(?:mjs|cjs|js|tsx?|json|md|ya?ml|sql|rs|py):[1-9]\d*/g)) {
      try { reference(root, match[0]); } catch { error(file, "INLINE_SOURCE_REFERENCE_INVALID"); }
    }
  }
  for (const [file, links] of edges) {
    if (semantic(file) && [...links].filter(link => link !== file && semantic(link)).length < 2) error(file, "NEEDS_TWO_RELATED_SEMANTIC_PAGES");
  }
  const visited = new Set();
  function visit(file) {
    if (visited.has(file)) return;
    visited.add(file);
    for (const next of edges.get(file) ?? []) visit(next);
  }
  visit("wiki-project/index.md");
  for (const file of paths) {
    if (!visited.has(file)) error(file, "UNREACHABLE_FROM_INDEX");
    if (file !== "wiki-project/index.md" && ![...edges.entries()].some(([from, targets]) => from !== file && targets.has(file))) error(file, "NO_INBOUND_LINK");
  }
  try {
    const { files } = scan(root, config);
    for (const file of files) for (const page of file.pages) {
      if (!documents.has(`wiki-project/${page}`) || !page.startsWith("wiki/")) error(file.path, "COVERAGE_TARGET_INVALID");
    }
    // Tooling is inside Wiki and intentionally outside application inventory.
    for (const file of fs.readdirSync(safePath(root, "wiki-project/scripts"))) {
      if (!/\.(?:mjs|json)$/.test(file)) continue;
      const text = read(root, `wiki-project/scripts/${file}`);
      for (const rule of sensitiveContent(text)) error(`scripts/${file}`, rule);
      if (text.split("\n").some(line => /[ \t]+$/.test(line))) error(`scripts/${file}`, "TRAILING_WHITESPACE");
    }
  } catch (issue) { error("覆盖", issue.message); }
  if (errors.length) throw new Error([...new Set(errors)].sort(cmp).join("\n"));
  return { status: "passed", markdown: paths.length, semantic: paths.filter(semantic).length, reachable: visited.size };
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(json(lint(projectRoot(process.argv[2]))).trim()); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
