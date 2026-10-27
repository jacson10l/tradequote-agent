import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CheckListResultSchema,
  CheckResultSchema,
  type RuleDefinition,
  WikiResultSchema,
} from "@tradequote/contracts";
import { createWikiService } from "@tradequote/domain";
import Database from "better-sqlite3";
import { expect, it } from "vitest";
import { CheckStore } from "./check-store";
import { SqliteWorkspaceRepository } from "./index";
import { sqlFingerprint } from "./migration-lineage";
import { MIGRATION_STEPS } from "./migrations";
import { TradeStore } from "./trade-store";
import { SqliteWikiCheckSource } from "./wiki-check-source";
import { SqliteWikiStore } from "./wiki-store";
import { createSyntheticQuote, seedPublished } from "./wiki-test.fixture";

const context = { actorId: "test-user", origin: "human_ui" as const };
const value = <T>(r: { ok: true; data: T } | { ok: false; error: { message: string } }): T => {
  if (!r.ok) throw Error(r.error.message);
  return r.data;
};

it("upgrades populated B7 with immutable multi-source report/consumption/old ledger and replays its first result after two reopens", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tq-b-lineage-"));
  const file = join(dir, "synthetic.sqlite");
  let db: Database.Database | undefined;
  let repo: SqliteWorkspaceRepository | undefined;
  try {
    db = new Database(file);
    db.pragma("foreign_keys=ON");
    // Freeze the historical B7 capability set; later A8 must not leak into this old fixture.
    const legacySteps = MIGRATION_STEPS.filter((s) => s.lineage !== "c-run" && s.version <= 7);
    expect(legacySteps.map((s) => `${s.lineage}:${s.version}`)).toEqual([
      "common:1",
      "common:2",
      "common:3",
      "common:4",
      "knowledge-wiki:6",
      "check-report:7",
    ]);
    db.exec("CREATE TABLE schema_migration(version INTEGER PRIMARY KEY,sql_hash TEXT NOT NULL)");
    for (const step of legacySteps) {
      db.exec(step.sql);
      db.prepare("INSERT INTO schema_migration VALUES (?,?)").run(
        step.version,
        sqlFingerprint(step.sql),
      );
    }
    db.pragma("user_version=7");
    const workspaceId = randomUUID();
    db.prepare("INSERT INTO workspace VALUES (1,?,?,1,?)").run(
      workspaceId,
      "synthetic legacy B7",
      "2026-10-22T00:00:00.000Z",
    );
    const connection = db;
    const ports: Pick<SqliteWorkspaceRepository, "executeTrade" | "executeWiki"> = {
      executeTrade: (cmd, ctx) => new TradeStore(connection).execute(cmd, ctx),
      executeWiki: (cmd, ctx) =>
        createWikiService(new SqliteWikiStore(connection)).execute(cmd, ctx),
    };
    const quote = createSyntheticQuote(ports);
    const rule: RuleDefinition = {
      ruleId: randomUUID(),
      category: "commercial_terms",
      field: "payment",
      condition: { kind: "required" },
      title: "合成规则",
      message: "合成缺项",
      failureSeverity: "block",
      suggestedAction: "人工补齐",
    };
    const seeded = await seedPublished(file, ports, workspaceId, {
      kind: "rule",
      locale: "en",
      rules: [rule],
    });
    const command = {
      schemaVersion: 1,
      requestId: randomUUID(),
      idempotencyKey: randomUUID(),
      method: "quote.check",
      payload: { revisionId: quote.id },
    };
    const first = value(
      CheckResultSchema.parse(
        new CheckStore(db, new SqliteWikiCheckSource(db)).execute(command, context),
      ),
    );
    expect(first.wikiCitations).toEqual([seeded.citation]);
    expect(first.wikiCitations?.[0]?.sourceRefs).toHaveLength(2);
    const tables = (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all() as { name: string }[]
    ).map((r) => r.name);
    const snapshot = (connection: Database.Database) =>
      Object.fromEntries(
        tables.map((table) => [
          table,
          connection.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
        ]),
      );
    const before = snapshot(db);
    db.close();
    db = undefined;
    for (let i = 0; i < 2; i++) {
      repo = new SqliteWorkspaceRepository(file);
      db = new Database(file);
      expect(db.pragma("user_version", { simple: true })).toBe(8);
      expect(
        db
          .prepare(
            "SELECT lineage,version FROM migration_registry WHERE version IN (6,7) ORDER BY lineage,version",
          )
          .all(),
      ).toEqual([
        { lineage: "c-run", version: 6 },
        { lineage: "c-run", version: 7 },
        { lineage: "check-report", version: 7 },
        { lineage: "knowledge-wiki", version: 6 },
      ]);
      expect(
        db
          .prepare(
            "SELECT lineage,version FROM migration_registry WHERE lineage='knowledge-wiki' AND version=8",
          )
          .all(),
      ).toEqual([{ lineage: "knowledge-wiki", version: 8 }]);
      expect(db.prepare("SELECT COUNT(*) AS n FROM knowledge_lint").get()).toEqual({ n: 0 });
      expect(snapshot(db)).toEqual(before);
      expect(
        CheckResultSchema.parse(
          repo.executeChecks({ ...command, requestId: randomUUID() }, context),
        ),
      ).toMatchObject({ ok: true, data: first });
      const history = value(
        CheckListResultSchema.parse(
          repo.executeChecks(
            {
              schemaVersion: 1,
              requestId: randomUUID(),
              method: "quote.getChecks",
              payload: { revisionId: quote.id },
            },
            context,
          ),
        ),
      );
      expect(history).toEqual([first]);
      const consumption = value(
        WikiResultSchema.parse(
          await repo.executeWiki(
            {
              schemaVersion: 1,
              requestId: randomUUID(),
              method: "wiki.getConsumption",
              payload: { kind: "artifact", revisionId: first.reportId },
            },
            { ...context, workspaceId, now: new Date().toISOString() },
          ),
        ),
      );
      expect(consumption).toMatchObject({
        kind: "consumption",
        consumption: { citations: [seeded.citation] },
      });
      expect(snapshot(db)).toEqual(before);
      db.close();
      db = undefined;
      repo.close();
      repo = undefined;
    }
  } finally {
    db?.close();
    repo?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
