import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { checkIcons } from "./check-icons.mjs";

test("committed icon resources match their source manifest", () => {
  checkIcons();
});
test("editing either SVG or packaged icon without generation blocks the build", (t) => {
  const dir = mkdtempSync(resolve(tmpdir(), "tradequote-icon-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(resolve("apps/desktop/resources"), dir, { recursive: true });
  for (const name of ["icon.svg", "icon.png", "icon.icns", "icon.ico"]) {
    const file = resolve(dir, name),
      original = readFileSync(file);
    writeFileSync(file, Buffer.concat([original, Buffer.from("changed")]));
    assert.throws(() => checkIcons(dir), /ICON_DRIFT/);
    writeFileSync(file, original);
  }
  checkIcons(dir);
});
