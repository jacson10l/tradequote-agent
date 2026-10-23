/** Explicit acceptance probes against A's fixed lineage design. Results are
 * recorded separately from normal unit tests; historical evidence is untouched. */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterAll, expect, it } from "vitest";
import { SqliteWorkspaceRepository } from "../src/index";
import { sqlFingerprint } from "../src/migration-lineage";
import { identify, MIGRATION_STEPS, migrate } from "../src/migrations";

const observations: { case: string; observedError: string | null; schemaUnchanged: boolean }[] = [];
afterAll(() =>
  writeFileSync(
    "wiki-project/raw/b01-lineage-boundary-probe.json",
    JSON.stringify(
      {
        status: observations.every((o) => o.observedError !== null && o.schemaUnchanged)
          ? "passed"
          : "known_gaps",
        scope:
          "Synthetic acceptance boundaries against A b9a0af7 plus B type adaptations; no user database",
        observations,
      },
      null,
      2,
    ) + "\n",
  ),
);
it.each([
  "synthetic_unrecognized_6",
  "ledger_with_missing_immutable_trigger",
  "same_name_noop_trigger",
  "legacy_ledger_claims_absent_knowledge",
  "unknown_legacy_ledger_version",
  "registry_corruption_at_readonly_preflight",
])("rejects %s before accepting or recording a migration", (kind) => {
  const db = new Database(":memory:");
  try {
    db.pragma("foreign_keys=ON");
    if (kind === "synthetic_unrecognized_6") {
      for (const step of MIGRATION_STEPS.filter((s) => s.lineage === "common")) db.exec(step.sql);
      db.exec(
        "CREATE TABLE synthetic_unrecognized_feature(id TEXT PRIMARY KEY,data_json TEXT); INSERT INTO synthetic_unrecognized_feature VALUES ('keep','synthetic evidence');",
      );
      db.pragma("user_version=6");
    } else if (kind === "legacy_ledger_claims_absent_knowledge") {
      for (const step of MIGRATION_STEPS.slice(0, 6)) db.exec(step.sql);
      db.pragma("user_version=6");
      db.exec("CREATE TABLE schema_migration(version INTEGER PRIMARY KEY,sql_hash TEXT NOT NULL)");
      const knowledge = MIGRATION_STEPS.find((s) => s.lineage === "knowledge-wiki")!;
      db.prepare("INSERT INTO schema_migration VALUES (6,?)").run(sqlFingerprint(knowledge.sql));
    } else {
      migrate(db);
      if (kind === "ledger_with_missing_immutable_trigger")
        db.exec("DROP TRIGGER quote_check_report_no_delete");
      if (kind === "same_name_noop_trigger")
        db.exec(
          "DROP TRIGGER quote_check_report_no_delete; CREATE TRIGGER quote_check_report_no_delete BEFORE DELETE ON quote_check_report BEGIN SELECT 1; END;",
        );
      if (kind === "unknown_legacy_ledger_version")
        db.exec(
          "CREATE TABLE schema_migration(version INTEGER PRIMARY KEY,sql_hash TEXT NOT NULL); INSERT INTO schema_migration VALUES (99,'unknown')",
        );
      if (kind === "registry_corruption_at_readonly_preflight")
        db.exec("UPDATE migration_registry SET sql_hash='corrupted' WHERE lineage='check-report'");
    }
    const snapshot = () =>
      JSON.stringify({
        version: db.pragma("user_version", { simple: true }),
        objects: db.prepare("SELECT type,name,sql FROM sqlite_master ORDER BY type,name").all(),
      });
    const before = snapshot();
    let error: string | null = null;
    try {
      if (kind === "registry_corruption_at_readonly_preflight") identify(db);
      else migrate(db);
    } catch (e) {
      error = e instanceof Error ? e.message : "unknown";
    }
    observations.push({ case: kind, observedError: error, schemaUnchanged: before === snapshot() });
    expect(
      error,
      "A's stated reject policy must hold before accepting/stamping capabilities",
    ).not.toBeNull();
    expect(snapshot()).toBe(before);
  } finally {
    db.close();
  }
});

it("rejects corrupted registry on disk without changing the original database bytes", () => {
  const dir = mkdtempSync(join(tmpdir(), "tq-registry-preflight-"));
  const file = join(dir, "synthetic.sqlite");
  try {
    const db = new Database(file);
    migrate(db);
    db.exec("UPDATE migration_registry SET sql_hash='corrupted' WHERE lineage='check-report'");
    db.close();
    const before = readFileSync(file);
    let error: string | null = null;
    try {
      const repo = new SqliteWorkspaceRepository(file);
      repo.close();
    } catch (e) {
      error = e instanceof Error ? e.message : "unknown";
    }
    const unchanged = before.equals(readFileSync(file));
    observations.push({
      case: "registry_reject_preserves_disk_bytes",
      observedError: error,
      schemaUnchanged: unchanged,
    });
    expect(error).not.toBeNull();
    expect(unchanged, "read-only rejection must precede journal_mode=WAL").toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
