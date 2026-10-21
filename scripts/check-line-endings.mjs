import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// Git supplies both its binary classification and effective path attributes.
// NUL-delimited records preserve spaces, tabs and non-ASCII file names.
export function checkLineEndings(root = ".") {
  const output = execFileSync(
    "git",
    ["-C", root, "ls-files", "--cached", "--others", "--exclude-standard", "--eol", "-z"],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  const errors = [];
  let checked = 0;
  for (const record of new Set(output.split("\0").filter(Boolean))) {
    const separator = record.indexOf("\t");
    const header = record.slice(0, separator);
    const file = record.slice(separator + 1);
    const working = header.match(/\bw\/(\S*)/)?.[1];
    const attributes = header.split("attr/")[1]?.trim().split(/\s+/) ?? [];
    // Absent working files, symlinks and submodules have no working EOL info.
    if (!working || attributes.includes("-text")) continue;
    if (working === "-text" && !attributes.includes("text")) continue;
    checked++;
    if (!attributes.includes("eol=lf")) errors.push(`${file}: LF_ATTRIBUTE_REQUIRED`);
    if (working === "crlf" || working === "mixed") errors.push(`${file}: WORKTREE_CRLF`);
    if (/\bi\/(?:crlf|mixed)\b/.test(header)) errors.push(`${file}: INDEX_CRLF`);
  }
  if (errors.length) throw new Error(errors.join("\n"));
  return { status: "passed", checked };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(checkLineEndings(), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
