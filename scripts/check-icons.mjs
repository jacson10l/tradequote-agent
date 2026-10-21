import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../apps/desktop/resources");
export function checkIcons(directory = root) {
  const manifest = JSON.parse(readFileSync(resolve(directory, "icon-manifest.json"), "utf8"));
  for (const name of ["icon.svg", "icon.png", "icon.icns", "icon.ico"]) {
    const bytes = readFileSync(resolve(directory, name));
    if (createHash("sha256").update(bytes).digest("hex") !== manifest[name])
      throw new Error(`ICON_DRIFT: ${name}; run pnpm icons:generate`);
  }
  const png = readFileSync(resolve(directory, "icon.png"));
  if (
    png.toString("hex", 0, 8) !== "89504e470d0a1a0a" ||
    png.readUInt32BE(16) !== 1024 ||
    png.readUInt32BE(20) !== 1024
  )
    throw new Error("ICON_PNG_SIZE");
  const icns = readFileSync(resolve(directory, "icon.icns"));
  if (icns.toString("ascii", 0, 4) !== "icns" || icns.readUInt32BE(4) !== icns.length)
    throw new Error("ICON_ICNS_HEADER");
  const ico = readFileSync(resolve(directory, "icon.ico"));
  if (ico.readUInt16LE(0) !== 0 || ico.readUInt16LE(2) !== 1 || ico.readUInt16LE(4) !== 6)
    throw new Error("ICON_ICO_HEADER");
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkIcons();
  console.log("Application icons passed: SVG/1024 PNG/macOS ICNS/Windows ICO");
}
