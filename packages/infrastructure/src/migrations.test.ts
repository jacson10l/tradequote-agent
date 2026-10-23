import Database from "better-sqlite3";
import { expect, it } from "vitest";
import { migrate, migrations } from "./migrations";

it("installs the real sparse registry, preserves old bytes, and applies a later C migration 5 once", () => {
  const db = new Database(":memory:");
  try {
    migrate(db);
    expect(db.prepare("SELECT version FROM schema_migration ORDER BY version").all()).toEqual(
      [1, 2, 3, 4, 6, 7].map((version) => ({ version })),
    );
    // Synthetic C schema for sequencing only; no production placeholder is registered.
    const later = [
      ...migrations,
      { version: 5, sql: "CREATE TABLE synthetic_c_run(id TEXT);" },
    ].sort((a, b) => a.version - b.version);
    migrate(db, later);
    migrate(db, later);
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE name='synthetic_c_run'").get(),
    ).toBeDefined();
    expect(db.pragma("user_version", { simple: true })).toBe(7);
    expect(() => migrate(db)).toThrow("DATABASE_NEWER_THAN_APPLICATION");
  } finally {
    db.close();
  }
});

it.each([3, 4, 6])(
  "adopts a legacy user_version %i database without recording reserved migration 5",
  (version) => {
    const db = new Database(":memory:");
    try {
      for (const step of migrations.filter((step) => step.version <= version)) db.exec(step.sql);
      db.pragma(`user_version=${version}`);
      db.prepare(
        "INSERT INTO workspace VALUES (1,'legacy','preserved',1,'2026-10-21T00:00:00Z')",
      ).run();
      migrate(db);
      expect(db.prepare("SELECT name FROM workspace").get()).toEqual({ name: "preserved" });
      expect(
        db.prepare("SELECT version FROM schema_migration WHERE version=5").get(),
      ).toBeUndefined();
      migrate(db);
    } finally {
      db.close();
    }
  },
);

it("rolls back delayed migration 5, its ledger and any later changes together", () => {
  const db = new Database(":memory:");
  try {
    migrate(db);
    const broken = [
      ...migrations,
      { version: 5, sql: "CREATE TABLE partial(id TEXT); INVALID SQL;" },
    ].sort((a, b) => a.version - b.version);
    expect(() => migrate(db, broken)).toThrow();
    expect(
      db.prepare("SELECT version FROM schema_migration WHERE version=5").get(),
    ).toBeUndefined();
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='partial'").get()).toBeUndefined();
    expect(db.pragma("user_version", { simple: true })).toBe(7);
    expect(() =>
      migrate(
        db,
        migrations.map((s) => (s.version === 4 ? { ...s, sql: s.sql + "\n-- changed" } : s)),
      ),
    ).toThrow("MIGRATION_CHANGED_AFTER_APPLY");
  } finally {
    db.close();
  }
});

it("rolls back a failed first install and rejects duplicate or unordered registry versions", () => {
  const db = new Database(":memory:");
  try {
    expect(() =>
      migrate(db, [
        ...migrations,
        { version: 8, sql: "CREATE TABLE partial(id TEXT); INVALID SQL;" },
      ]),
    ).toThrow();
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).toEqual([]);
    expect(db.pragma("user_version", { simple: true })).toBe(0);
    expect(() => migrate(db, [migrations[0]!, migrations[0]!])).toThrow(
      "INVALID_MIGRATION_SEQUENCE",
    );
    expect(() => migrate(db, [migrations[1]!, migrations[0]!])).toThrow(
      "INVALID_MIGRATION_SEQUENCE",
    );
    migrate(db);
  } finally {
    db.close();
  }
});
