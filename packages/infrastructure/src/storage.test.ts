import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CreateWorkspace, RenameWorkspace } from "@tradequote/contracts";
import Database from "better-sqlite3";
import { afterEach, expect, it } from "vitest";
import { FileArtifactStore, SqliteWorkspaceRepository } from "./index";
import { sqlFingerprint } from "./migration-lineage";
import { MIGRATION_STEPS, MigrationLineageError, migrate, seedTo } from "./migrations";

const dirs: string[] = [];
const temp = () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "tradequote-test-")));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const context = { actorId: "test-user", origin: "human_ui" as const };
const create = (): CreateWorkspace => ({
  schemaVersion: 1,
  requestId: randomUUID(),
  idempotencyKey: randomUUID(),
  method: "workspace.create",
  payload: { name: "测试工作区" },
});
it("commits once, survives reopen, rejects key reuse and stale versions", () => {
  const file = join(temp(), "workspace.sqlite");
  let repo = new SqliteWorkspaceRepository(file);
  const command = create();
  const initial = repo.commit(command, context);
  repo.close();
  repo = new SqliteWorkspaceRepository(file);
  try {
    expect(repo.read()?.name).toBe("测试工作区");
    expect(repo.commit({ ...command, requestId: randomUUID() }, context)).toEqual(initial);
    expect(repo.commit({ ...command, payload: { name: "different" } }, context)).toMatchObject({
      ok: false,
      error: { code: "IDEMPOTENCY_CONFLICT" },
    });
    const rename: RenameWorkspace = {
      ...create(),
      method: "workspace.rename",
      payload: { name: "新版", expectedVersion: 1 },
    };
    expect(repo.commit(rename, context)).toMatchObject({ ok: true, data: { version: 2 } });
    expect(repo.commit({ ...rename, idempotencyKey: randomUUID() }, context)).toMatchObject({
      ok: false,
      error: { code: "REVISION_CONFLICT" },
    });
    const check = new Database(file);
    try {
      expect(check.prepare("SELECT COUNT(*) AS count FROM outbox").get()).toEqual({ count: 2 });
    } finally {
      check.close();
    }
  } finally {
    repo.close();
  }
});
it("rolls back business write when outbox insertion fails", () => {
  const file = join(temp(), "workspace.sqlite");
  const repo = new SqliteWorkspaceRepository(file);
  const db = new Database(file);
  try {
    db.exec(
      "CREATE TRIGGER fail_event BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT, 'injected'); END;",
    );
    expect(() => repo.commit(create(), context)).toThrow();
    expect(repo.read()).toBeNull();
    expect(db.prepare("SELECT COUNT(*) AS count FROM idempotency").get()).toEqual({ count: 0 });
  } finally {
    db.close();
    repo.close();
  }
});
it("migration failure rolls back and future schema refuses downgrade", () => {
  const db = new Database(join(temp(), "workspace.sqlite"));
  try {
    migrate(db);
    expect(db.pragma("user_version", { simple: true })).toBe(11);
    expect(() =>
      migrate(db, [
        ...MIGRATION_STEPS,
        { lineage: "common", version: 99, sql: "CREATE TABLE partial(id TEXT); INVALID SQL;" },
      ]),
    ).toThrow();
    expect(db.pragma("user_version", { simple: true })).toBe(11);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='partial'").get()).toBeUndefined();
    db.pragma("user_version=99");
    expect(() => migrate(db)).toThrow(MigrationLineageError);
  } finally {
    db.close();
  }
});
it("stores immutable content hashes and rejects traversal, tampering and symlinks", async () => {
  const root = temp();
  const store = new FileArtifactStore(root);
  const bytes = new TextEncoder().encode("synthetic artifact");
  const id = await store.putImmutable(bytes);
  expect(await store.putImmutable(bytes)).toBe(id);
  expect(await store.readById(id)).toEqual(Buffer.from(bytes));
  await expect(store.readById("../outside")).rejects.toThrow("INVALID_ARTIFACT_ID");
  writeFileSync(join(root, id), "changed");
  expect(await store.verifyHash(id)).toBe(false);
  const other = "a".repeat(64);
  symlinkSync(join(root, id), join(root, other));
  await expect(store.readById(other)).rejects.toThrow("ARTIFACT_NOT_REGULAR");
});

it.each(["missing_predecessor", "duplicate_legacy_identity"])(
  "rejects %s in a persisted legacy database before creating a registry or changing facts",
  (kind) => {
    const db = new Database(":memory:");
    try {
      if (kind === "missing_predecessor") {
        db.exec(MIGRATION_STEPS[0]!.sql);
        db.exec(MIGRATION_STEPS[2]!.sql);
        db.pragma("user_version=3");
      } else {
        seedTo(db, { lineage: "common", version: 3 });
        db.exec("CREATE TABLE schema_migration(version INTEGER, sql_hash TEXT)");
        const insert = db.prepare("INSERT INTO schema_migration VALUES (?,?)");
        insert.run(1, sqlFingerprint(MIGRATION_STEPS[0]!.sql));
        insert.run(1, sqlFingerprint(MIGRATION_STEPS[0]!.sql));
      }
      const snapshot = () => ({
        schema: db.prepare("SELECT * FROM sqlite_master ORDER BY name").all(),
        version: db.pragma("user_version", { simple: true }),
        ledger:
          kind === "duplicate_legacy_identity"
            ? db.prepare("SELECT * FROM schema_migration ORDER BY rowid").all()
            : [],
      });
      const before = snapshot();
      expect(() => migrate(db)).toThrow(MigrationLineageError);
      expect(snapshot()).toEqual(before);
      expect(
        db.prepare("SELECT name FROM sqlite_master WHERE name='migration_registry'").get(),
      ).toBeUndefined();
    } finally {
      db.close();
    }
  },
);
