import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { fail, json, meta, projectRoot, read, readJson, safePath, scan, sha, write } from "./wiki-lib.mjs";

const generated = "wiki-project/raw/generated";
function git(root, args) {
  try { return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return null; }
}
export function ingest(root) {
  const collectedAt = new Date().toISOString();
  const baseline = {
    collectedAt,
    date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()),
    sourceRoot: root,
    git: { head: git(root, ["rev-parse", "HEAD"]), branch: git(root, ["branch", "--show-current"]), status: git(root, ["status", "--short", "--untracked-files=all"]) },
  };
  const manifest = read(root, "wiki-project/raw/source-manifest.md");
  if (!manifest.includes("<!-- ingest:start -->") || !manifest.includes("<!-- ingest:end -->")) fail("raw/source-manifest.md", "INGEST_MARKERS_MISSING");
  const block = `<!-- ingest:start -->\n采集时间：${baseline.collectedAt}；项目路径：\`${root}\`。\n\n基线 HEAD：\`${baseline.git.head ?? "非 Git 来源"}\`；分支：\`${baseline.git.branch ?? "不适用"}\`。\n\n工作区差异（只记录路径及状态，不读取凭据内容）：\n\n\`\`\`text\n${baseline.git.status || "无差异或非 Git 来源"}\n\`\`\`\n<!-- ingest:end -->`;
  write(root, "wiki-project/raw/ingest-baseline.json", json(baseline));
  write(root, "wiki-project/raw/source-manifest.md", manifest.replace(/<!-- ingest:start -->[\s\S]*?<!-- ingest:end -->/, block));
}
export function build(root, { check = false } = {}) {
  const config = readJson(root, "wiki-project/scripts/wiki-config.json");
  const baseline = readJson(root, "wiki-project/raw/ingest-baseline.json");
  const { files, excluded } = scan(root, config);
  for (const file of files) for (const page of file.pages) {
    if (!page.startsWith("wiki/") || !page.endsWith(".md")) fail(file.path, "COVERAGE_TARGET_NOT_SEMANTIC");
    read(root, `wiki-project/${page}`);
  }
  const toolFiles = ["build-code-index.mjs", "wiki-lib.mjs", "wiki-config.json", "lint-wiki.mjs", "wiki-tools.test.mjs", "check-wiki-sync.mjs", "wiki-sync.test.mjs"];
  const toolchain = Object.fromEntries(toolFiles.map(file => [file, sha(read(root, `wiki-project/scripts/${file}`))]));
  const inventory = {
    schemaVersion: 1, baseline,
    scope: "project files only; wiki tooling hashes are provenance, not recursively indexed application source",
    toolchain, files: files.map(({ text, ...file }) => file),
    // Local dependency/cache presence is not stable across checkouts. Excluded
    // paths belong in ingest observations, not a drifting generated snapshot.
    exclusionPolicy: config.exclusionPolicy,
  };
  const page = (title, body) => meta(title, "meta", baseline.date) + body +
    "\n\n关联：[[知识库可靠性与覆盖范围]]、[[Wiki 工作流与任务记录]]。\n";
  const base = `采集基线：\`${baseline.git.head ?? "非 Git 来源"}\`，${baseline.date}。当前工作区内容按 hash 记录，不能把未提交文件归属于该 commit。\n\n`;
  const cell = text => String(text).replaceAll("|", "\\|").replaceAll("\n", " ");
  const table = (heads, rows) => `| ${heads.join(" | ")} |\n| ${heads.map(() => "---").join(" | ")} |\n${rows.map(row => `| ${row.map(cell).join(" | ")} |`).join("\n")}\n`;
  const index = page("代码清单", base + `纳管 ${files.length} 个文件，共 ${files.reduce((n, file) => n + file.lines, 0)} 行。行数含文档、锁文件、实验数据，不代表业务代码量。\n\n` +
    table(["项目相对路径", "类型", "行数", "职责"], files.map(f => [f.path, f.type, f.lines, f.role])));
  const snapshot = page("源码快照", base + "这是路径与内容 hash 快照，不复制源码或敏感文件内容；显式 ingest 才改变采集基线。\n\n" +
    table(["路径", "SHA-256"], files.map(f => [f.path, f.sha256])) +
    "\n维护工具单独留指纹，不纳入应用源码覆盖：\n\n" + table(["工具", "SHA-256"], Object.entries(toolchain)));
  const coverage = page("源码覆盖矩阵", base + "每个文件按实际职责映射；映射代表有对应知识页，不自动证明逐行审计完成。深读范围见 [[知识库可靠性与覆盖范围]]。\n\n" +
    table(["文件", "职责", "知识页"], files.map(f => [f.path, f.role, f.pages.map(p => `[[${path.basename(p, ".md")}]]`).join("、")])));
  const commands = [], dependencies = [], environment = [], tools = [], routes = [], events = [], ipc = [], data = [];
  for (const file of files) {
    const at = number => `${file.path}:${number}`;
    if (path.basename(file.path) === "package.json") {
      const pkg = JSON.parse(file.text);
      const lineFor = name => file.text.split("\n").findIndex(line => line.includes(`"${name}"`)) + 1;
      for (const [name, command] of Object.entries(pkg.scripts ?? {})) commands.push([name, command, at(lineFor(name))]);
      for (const group of ["dependencies", "devDependencies", "peerDependencies"]) {
        for (const [name, version] of Object.entries(pkg[group] ?? {})) dependencies.push([name, version, group, at(lineFor(name))]);
      }
    }
    if (!/\.(?:[cm]?js|tsx?)$/.test(file.path) || file.path.includes("/vendor/")) continue;
    let inToolDefinitions = false;
    file.text.split("\n").forEach((line, index) => {
      for (const match of line.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)|Object\.hasOwn\(process\.env,\s*"([A-Z][A-Z0-9_]*)"\)/g)) environment.push([match[1] ?? match[2], at(index + 1)]);
      if (file.path.endsWith("business-tools.mjs")) {
        if (/^const definitions = \{$/.test(line)) inToolDefinitions = true;
        if (/^};$/.test(line)) inToolDefinitions = false;
        const match = inToolDefinitions && line.match(/^  (\w+): \{/);
        if (match) tools.push([match[1], at(index + 1)]);
      }
      const route = line.match(/req\.url(?: === |, )"([^"]+)"/);
      if (route) routes.push([route[1], "本地合成 HTTP fixture", at(index + 1)]);
      const event = line.match(/emit\("([^"]+)"/);
      if (event) events.push([event[1], "模型协议 SSE fixture", at(index + 1)]);
      const channel = line.match(/ipc(?:Main|Renderer)\.(?:handle|on|invoke)\(["']([^"']+)/);
      if (channel) ipc.push([channel[1], at(index + 1)]);
    });
  }
  // All SQL files, including files outside JS heuristic scan.
  for (const file of files.filter(f => f.path.endsWith(".sql"))) data.push([file.path, "SQL 文件；迁移顺序未推断"]);
  const unique = rows => [...new Map(rows.map(row => [JSON.stringify(row), row])).values()];
  const section = (name, heads, rows, empty) => `## ${name}\n\n${rows.length ? table(heads, unique(rows)) : empty + "\n"}\n`;
  const runtime = page("命令与运行时清单", base +
    "仅解析本地 manifest 和受限文本模式；不执行源码，不推断动态注册，不展开 node_modules。工具名/路由/SSE 属于 M0 fixture，不是 Electron IPC 或产品 API。环境只记录变量名及行号，不收集值。\n\n" +
    section("包脚本", ["命令", "内容", "来源"], commands, "未发现 package scripts。") +
    section("直接依赖", ["包", "版本", "分组", "来源"], dependencies, "未发现 manifest 依赖。") +
    section("配置变量名", ["名称", "来源"], environment, "未发现匹配变量。") +
    section("业务工具注册", ["名称", "来源"], tools, "未发现匹配注册。") +
    section("HTTP fixture 路由", ["路径", "性质", "来源"], routes, "未发现匹配路由。") +
    section("SSE fixture 事件", ["名称", "性质", "来源"], events, "未发现匹配事件。") +
    section("Electron IPC", ["通道", "来源"], ipc, "当前没有 Electron main/preload/renderer 实现，IPC 不适用。") +
    section("数据表与迁移", ["文件", "边界"], data, "当前没有数据库 schema/迁移源码；数组与 Map 为实验内存状态。") +
    "## 作业与构建\n\n无持久化作业队列、CI 或 Electron 构建入口；此判断来自当前纳管范围，不能推断未来目录。维护脚本命令见 [[Wiki 工作流与任务记录]]。\n");
  const outputs = {
    [`${generated}/inventory.json`]: json(inventory),
    [`${generated}/代码清单.md`]: index,
    [`${generated}/源码快照.md`]: snapshot,
    [`${generated}/源码覆盖矩阵.md`]: coverage,
    [`${generated}/命令与运行时清单.md`]: runtime,
  };
  const drift = [];
  for (const [name, content] of Object.entries(outputs)) {
    const absolute = safePath(root, name);
    if (!fs.existsSync(absolute) || read(root, name) !== content) drift.push(name);
  }
  if (check) {
    if (drift.length) fail(drift.join("\n"), "GENERATED_DRIFT：运行生成器并检查语义页");
  } else for (const [name, content] of Object.entries(outputs)) write(root, name, content);
  return { files: files.length, lines: files.reduce((sum, f) => sum + f.lines, 0), generated: Object.keys(outputs).length, excluded: excluded.length };
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => arg.startsWith("--") && !["--check", "--ingest"].includes(arg))) fail("参数", "UNKNOWN_OPTION");
    if (args.includes("--check") && args.includes("--ingest")) fail("参数", "CHECK_IS_READ_ONLY");
    const root = projectRoot(args.find(arg => !arg.startsWith("--")));
    if (args.includes("--ingest")) ingest(root);
    console.log(json({ mode: args.includes("--check") ? "check" : "generate", ...build(root, { check: args.includes("--check") }) }).trim());
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
