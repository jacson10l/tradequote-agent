import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, expect, it } from "vitest";
import { SqliteWorkspaceRepository } from "./index";
import { sqlFingerprint } from "./migration-lineage";
import { identify, MIGRATION_STEPS, MigrationLineageError, migrate, seedTo } from "./migrations";

const dirs: string[] = [];
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), "tq-ledger-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const knowledgeFingerprint = () =>
  sqlFingerprint(
    MIGRATION_STEPS.find((s) => s.lineage === "knowledge-wiki" && s.version === 6)!.sql,
  );

// N10：新账本 hash 被改错，须在读写真开/WAL 之前只读拒绝，不产生 -wal/-shm。
it("rejects corrupted registry before read-write open (N10)", () => {
  const file = join(temp(), "db.sqlite");
  const db = new Database(file);
  try {
    migrate(db); // unified，user_version=8，registry 记录正确 hash
    db.prepare(
      "UPDATE migration_registry SET sql_hash='wrong' WHERE lineage='common' AND version=1",
    ).run();
  } finally {
    db.close();
  }
  expect(() => new SqliteWorkspaceRepository(file)).toThrow(MigrationLineageError);
  expect(existsSync(`${file}-wal`)).toBe(false);
  expect(existsSync(`${file}-shm`)).toBe(false);
});

// N10 一致性：registry 登记的能力在 schema 中并不存在（如 c-v7 库却登记 knowledge-wiki:6）。
it("rejects registry row whose capability is absent from schema (N10 consistency)", () => {
  const db = new Database(":memory:");
  try {
    seedTo(db, { lineage: "c-run", version: 7 }); // c-v7：无知识四表
    db.exec(
      "CREATE TABLE migration_registry(lineage TEXT NOT NULL, version INTEGER NOT NULL, sql_hash TEXT NOT NULL, applied_at TEXT NOT NULL, PRIMARY KEY(lineage, version))",
    );
    db.prepare(
      "INSERT INTO migration_registry(lineage,version,sql_hash,applied_at) VALUES ('knowledge-wiki',6,?,?)",
    ).run(knowledgeFingerprint(), "now");
    expect(() => identify(db)).toThrow(MigrationLineageError);
  } finally {
    db.close();
  }
});

// N11：旧 schema_migration 声称已执行知识 6，但 schema 实际是 c-v7（无知识四表），须先拒绝。
it("rejects legacy ledger claiming knowledge:6 on a c-v7 schema (N11)", () => {
  const db = new Database(":memory:");
  try {
    seedTo(db, { lineage: "c-run", version: 7 });
    db.exec("CREATE TABLE schema_migration(version INTEGER, sql_hash TEXT)");
    db.prepare("INSERT INTO schema_migration(version,sql_hash) VALUES (6,?)").run(
      knowledgeFingerprint(),
    );
    expect(() => identify(db)).toThrow(MigrationLineageError);
  } finally {
    db.close();
  }
});

// M09-L01：旧账本出现无法解释的未知登记（version=99），不得忽略，必须安全拒绝。
it("rejects unknown legacy version (M09-L01)", () => {
  const db = new Database(":memory:");
  try {
    seedTo(db, { lineage: "c-run", version: 7 });
    db.exec("CREATE TABLE schema_migration(version INTEGER, sql_hash TEXT)");
    db.prepare("INSERT INTO schema_migration(version,sql_hash) VALUES (99,?)").run("0".repeat(64));
    expect(() => identify(db)).toThrow(MigrationLineageError);
  } finally {
    db.close();
  }
});

// M09-L02：旧账本被重建为无唯一约束并重复插入同一 version，须按重复身份拒绝而非静默去重。
it("rejects duplicate legacy version in non-unique ledger (M09-L02)", () => {
  const db = new Database(":memory:");
  try {
    seedTo(db, { lineage: "knowledge-wiki", version: 6 }); // a-v6：知识四表确实存在
    db.exec("CREATE TABLE schema_migration(version INTEGER, sql_hash TEXT)");
    const insert = db.prepare("INSERT INTO schema_migration(version,sql_hash) VALUES (6,?)");
    insert.run(knowledgeFingerprint());
    insert.run(knowledgeFingerprint());
    expect(() => identify(db)).toThrow(MigrationLineageError);
  } finally {
    db.close();
  }
});
