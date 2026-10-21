import fs from "node:fs";
import { isBuiltin } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";

export function inspectImports(file, text) {
  const failures = [];
  const source = parse(text, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
    createImportExpressions: true,
  });
  const renderer = file.includes("/renderer/");
  const pure = file.startsWith("packages/domain/") || file.startsWith("packages/contracts/");
  function visit(node) {
    if (!node || typeof node !== "object") return;
    const spec = [
      "ImportDeclaration",
      "ExportNamedDeclaration",
      "ExportAllDeclaration",
      "ImportExpression",
    ].includes(node.type)
      ? node.source
      : node.type === "CallExpression" && node.callee?.name === "require"
        ? node.arguments[0]
        : node.type === "TSExternalModuleReference"
          ? node.expression
          : undefined;
    if (spec?.type === "StringLiteral") {
      const name = spec.value;
      const target = name.startsWith(".")
        ? path.posix.normalize(path.posix.join(path.posix.dirname(file), name))
        : name;
      if (
        ((renderer || pure) && isBuiltin(name)) ||
        (pure &&
          !name.startsWith(".") &&
          !["@tradequote/contracts", "zod", "vitest"].includes(name) &&
          !(file.startsWith("packages/domain/") && name === "decimal.js")) ||
        (file.startsWith("packages/contracts/") && target.includes("domain")) ||
        (name.startsWith(".") &&
          target.startsWith("packages/") &&
          target.split("/")[1] !== file.split("/")[1]) ||
        (renderer &&
          /(?:electron|better-sqlite|drizzle|@tradequote\/(?:infrastructure|domain)|\/(?:main|workers|preload)\/|packages\/(?:infrastructure|domain))/.test(
            target,
          )) ||
        (pure && /(?:electron|better-sqlite|drizzle|infrastructure|apps\/)/.test(target))
      )
        failures.push(`${file}: forbidden dependency ${name}`);
    } else if (spec) failures.push(`${file}: nonliteral module import is not allowed`);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object" && "type" in value) visit(value);
    }
  }
  visit(source);
  return failures;
}
function walk(dir) {
  const failures = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "out", "dist"].includes(item.name)) continue;
    const file = path.join(dir, item.name).split(path.sep).join("/");
    if (item.isDirectory()) failures.push(...walk(file));
    else if (/\.(ts|tsx)$/.test(file))
      failures.push(...inspectImports(file, fs.readFileSync(file, "utf8")));
  }
  return failures;
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const failures = [...walk("apps"), ...walk("packages")];
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log("Module boundaries passed");
}
