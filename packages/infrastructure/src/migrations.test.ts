import Database from "better-sqlite3";
import { expect, it } from "vitest";
import { capabilityId, sqlFingerprint } from "./migration-lineage";
import { identify, MIGRATION_STEPS, MigrationLineageError, migrate } from "./migrations";

const common = ["common:1", "common:2", "common:3", "common:4"];
const inputs = [
  ["empty", 0, []],
  ["common-v1", 1, common.slice(0, 1)],
  ["common-v2", 2, common.slice(0, 2)],
  ["common-v3", 3, common.slice(0, 3)],
  ["a01b-v4", 4, common],
  ["c-v5", 5, [...common, "c-run:5"]],
  ["c-v6", 6, [...common, "c-run:5", "c-run:6"]],
  ["c-v7", 7, [...common, "c-run:5", "c-run:6", "c-run:7"]],
  ["a-v6", 6, [...common, "knowledge-wiki:6"]],
  ["b-v7", 7, [...common, "knowledge-wiki:6", "check-report:7"]],
] as const;

const schema = (db: Database.Database) => ({
  version: db.pragma("user_version", { simple: true }),
  objects: db.prepare("SELECT type,name,sql FROM sqlite_master ORDER BY type,name").all(),
});

it.each(inputs)(
  "upgrades actual SQLite %s and keeps prior rows and same-number identities",
  (lineage, version, ids) => {
    const db = new Database(":memory:");
    try {
      db.pragma("foreign_keys=ON");
      for (const step of MIGRATION_STEPS)
        if ((ids as readonly string[]).includes(capabilityId(step))) db.exec(step.sql);
      db.pragma(`user_version=${version}`);
      if (version > 0)
        db.exec(
          "INSERT INTO workspace VALUES (1,'synthetic-legacy','preserved',1,'2026-10-21T00:00:00Z')",
        );
      expect(identify(db).lineage).toBe(lineage);
      migrate(db);
      expect(identify(db).lineage).toBe("a01f");
      expect(db.pragma("user_version", { simple: true })).toBe(11);
      expect(
        db
          .prepare(
            "SELECT lineage,version,sql_hash FROM migration_registry ORDER BY lineage,version",
          )
          .all(),
      ).toEqual(
        MIGRATION_STEPS.map((s) => ({
          lineage: s.lineage,
          version: s.version,
          sql_hash: sqlFingerprint(s.sql),
        })).sort((a, b) =>
          a.lineage < b.lineage ? -1 : a.lineage > b.lineage ? 1 : a.version - b.version,
        ),
      );
      if (version > 0)
        expect(db.prepare("SELECT name FROM workspace").get()).toEqual({ name: "preserved" });
      const before = schema(db);
      const ledger = db.prepare("SELECT * FROM migration_registry ORDER BY lineage,version").all();
      migrate(db);
      expect(schema(db)).toEqual(before);
      expect(db.prepare("SELECT * FROM migration_registry ORDER BY lineage,version").all()).toEqual(
        ledger,
      );
    } finally {
      db.close();
    }
  },
);

it.each(["first", "c-v6"])(
  "rolls back all schema, ledger and version on failed %s install",
  (input) => {
    const db = new Database(":memory:");
    try {
      if (input === "c-v6") {
        for (const step of MIGRATION_STEPS.slice(0, 6)) db.exec(step.sql);
        db.pragma("user_version=6");
      }
      const before = schema(db);
      const broken = MIGRATION_STEPS.map((step) =>
        step.lineage === "check-report" ? { ...step, sql: step.sql + "\nINVALID SQL;" } : step,
      );
      expect(() => migrate(db, broken)).toThrow();
      expect(schema(db)).toEqual(before);
      migrate(db);
      expect(identify(db).lineage).toBe("a01f");
    } finally {
      db.close();
    }
  },
);

it.each(["trigger", "index", "version", "legacy-hash", "registry-hash"])(
  "rejects %s corruption without changing schema or stored rows",
  (kind) => {
    const db = new Database(":memory:");
    try {
      migrate(db);
      if (kind === "trigger") db.exec("DROP TRIGGER quote_check_report_no_delete");
      if (kind === "index") db.exec("DROP INDEX quote_check_report_history");
      if (kind === "version") db.pragma("user_version=99");
      if (kind === "legacy-hash")
        db.exec(
          "CREATE TABLE schema_migration(version INTEGER PRIMARY KEY,sql_hash TEXT); INSERT INTO schema_migration VALUES (7,'bad-hash')",
        );
      if (kind === "registry-hash")
        db.exec("UPDATE migration_registry SET sql_hash='bad-hash' WHERE lineage='check-report'");
      const before = schema(db);
      const ledger = db.prepare("SELECT * FROM migration_registry ORDER BY lineage,version").all();
      expect(() => migrate(db)).toThrow(MigrationLineageError);
      expect(schema(db)).toEqual(before);
      expect(db.prepare("SELECT * FROM migration_registry ORDER BY lineage,version").all()).toEqual(
        ledger,
      );
    } finally {
      db.close();
    }
  },
);
