import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectImports } from "./check-boundaries.mjs";

test("renderer cannot reach Node, database or desktop internals through import forms", () => {
  for (const text of [
    "import fs from 'fs'",
    "export * from '@tradequote/infrastructure'",
    "const db = require('better-sqlite3')",
    "import('../main/file')",
    "import(name)",
    "import fs = require('node:fs')",
  ]) {
    assert.ok(inspectImports("apps/desktop/src/renderer/x.ts", text).length > 0, text);
  }
});
test("pure modules use public contracts while other platform dependencies are rejected", () => {
  assert.deepEqual(
    inspectImports(
      "packages/domain/src/x.ts",
      "import type { Workspace } from '@tradequote/contracts'; import { x } from './local';",
    ),
    [],
  );
  for (const text of [
    "import 'openai'",
    "import '../../infrastructure/src/index'",
    "export * from 'node:path'",
  ])
    assert.ok(inspectImports("packages/domain/src/x.ts", text).length > 0);
  assert.ok(
    inspectImports("packages/contracts/src/x.ts", "import '@tradequote/domain'").length > 0,
  );
});
