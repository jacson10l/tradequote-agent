/** Known-red synthetic acceptance probes, pending A's lineage decision.
 * No real workspace DB, C schema or production migration is modified. */
import { writeFileSync } from "node:fs";
import Database from "better-sqlite3";
import { afterAll, expect, it } from "vitest";
import { migrate, migrations } from "../src/migrations";

const observations: unknown[] = [];
afterAll(() =>
  writeFileSync(
    "wiki-project/raw/b01-migration-coordination-probe.json",
    JSON.stringify(
      {
        status: "known_gaps",
        scope:
          "Synthetic negative probes only. Not actual C5/6/7 lineage and not an A-approved matrix.",
        fixed: false,
        observations,
      },
      null,
      2,
    ) + "\n",
  ),
);
it.each(["synthetic_unrecognized_6", "ledger_with_missing_immutable_trigger"])(
  "proposed reject policy: %s must not be accepted merely by version/hash",
  (kind) => {
    const db = new Database(":memory:");
    try {
      db.pragma("foreign_keys=ON");
      if (kind === "synthetic_unrecognized_6") {
        for (const step of migrations.filter((s) => s.version <= 4)) db.exec(step.sql);
        db.exec(
          "CREATE TABLE synthetic_unrecognized_feature(id TEXT PRIMARY KEY,data_json TEXT); INSERT INTO synthetic_unrecognized_feature VALUES ('keep','synthetic preserved evidence');",
        );
        db.pragma("user_version=6");
      } else {
        migrate(db);
        db.exec("DROP TRIGGER quote_check_report_no_delete");
      }
      const schema = () =>
        JSON.stringify({
          version: db.pragma("user_version", { simple: true }),
          objects: db.prepare("SELECT type,name,sql FROM sqlite_master ORDER BY type,name").all(),
        });
      const before = schema();
      let error: string | null = null;
      try {
        migrate(db);
      } catch (e) {
        error = e instanceof Error ? e.message : "unknown";
      }
      const hasWiki = Boolean(
        db.prepare("SELECT name FROM sqlite_master WHERE name='knowledge_wiki'").get(),
      );
      observations.push({
        case: kind,
        expected: "reject_without_writes_pending_A_lineage_policy",
        observedError: error,
        versionAfter: db.pragma("user_version", { simple: true }),
        schemaUnchanged: before === schema(),
        hasKnowledgeWiki: hasWiki,
        hasReportNoDeleteTrigger: Boolean(
          db
            .prepare("SELECT name FROM sqlite_master WHERE name='quote_check_report_no_delete'")
            .get(),
        ),
        ledger: db.prepare("SELECT version FROM schema_migration ORDER BY version").all(),
      });
      expect(
        error,
        "unrecognized schema must be rejected before stamping current lineage",
      ).not.toBeNull();
      expect(schema()).toBe(before);
    } finally {
      db.close();
    }
  },
);
