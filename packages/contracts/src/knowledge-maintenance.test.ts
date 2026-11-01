import { describe, expect, it } from "vitest";
import {
  failure,
  KnowledgeImpactExchangeSchema,
  KnowledgeImpactReportSchema,
  KnowledgeIndexCommitExchangeSchema,
  KnowledgeIndexRebuildSchema,
  type KnowledgeIndexStatus,
  KnowledgeIndexStatusSchema,
  KnowledgeLintCheckSchema,
  type KnowledgeLintReport,
  KnowledgeLintReportSchema,
  KnowledgeMaintenanceCommandSchema,
  knowledgeMaintenanceMethodOrigins,
  MaintenanceExchangeSchema,
  MaintenanceIssueSchema,
  RuntimeCommandSchema,
  WorkerRequestSchema,
} from "./index";
import { mockKnowledgeMaintenanceCommands } from "./mock";

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const hash = "b".repeat(64);
const now = "2026-10-22T02:00:00.000Z";
function lint(): KnowledgeLintReport {
  return {
    reportId: id(1),
    receipt: {
      receiptId: id(1),
      workspaceId: id(2),
      revisionId: id(3),
      contentHash: hash,
      sourceSetHash: hash,
      policyVersion: "synthetic-v1",
      checkedAt: now,
      outcome: "passed",
    },
    status: "completed",
    coverage: KnowledgeLintCheckSchema.options.map((check) => ({ check, status: "passed" })),
    issues: [],
    error: null,
  };
}
const target = {
  kind: "knowledge" as const,
  revisionId: id(3),
  documentId: id(4),
  contentHash: hash,
  sourceSetHash: hash,
};
const issue = {
  workspaceId: id(2),
  issueId: id(10),
  issueVersion: 1,
  dedupKey: hash,
  kind: "conflict",
  target,
  severity: "block",
  message: "Synthetic conflict",
  state: "open",
  evidenceIds: [id(1)],
  firstDetectedAt: now,
  lastDetectedAt: now,
  resolution: null,
};
const impact = {
  workspaceId: id(2),
  reportId: id(20),
  subject: { target, reason: "withdrawn", replacementRevisionId: null },
  snapshotSeq: 10,
  checkedAt: now,
  status: "completed",
  totalItems: 0,
  unknownReasons: [],
  error: null,
};
function index(): KnowledgeIndexStatus {
  return {
    workspaceId: id(2),
    index: "keyword",
    generation: 1,
    authoritativeSeq: 10,
    indexedSeq: 10,
    state: "ready",
    rebuildId: null,
    checkedAt: now,
    error: null,
  };
}
describe("B00a P1 maintenance protocols", () => {
  it("only issues a passed P0 receipt for complete unblocked checks", () => {
    const r = lint();
    expect(KnowledgeLintReportSchema.safeParse(r).success).toBe(true);
    const partial = {
      ...r,
      status: "partial",
      coverage: r.coverage.map((c, i) => (i === 0 ? { ...c, status: "unknown" } : c)),
      receipt: { ...r.receipt, outcome: "unknown" },
    };
    expect(KnowledgeLintReportSchema.safeParse(partial).success).toBe(true);
    expect(KnowledgeLintReportSchema.safeParse({ ...partial, receipt: r.receipt }).success).toBe(
      false,
    );
    expect(KnowledgeLintReportSchema.safeParse({ ...partial, status: "completed" }).success).toBe(
      false,
    );
    expect(
      KnowledgeLintReportSchema.safeParse({
        ...r,
        status: "failed",
        receipt: { ...r.receipt, outcome: "unknown" },
        error: failure("STORAGE_ERROR", "Synthetic failure").error,
      }).success,
    ).toBe(true);
  });
  it("rejects duplicate/omitted checks, receipt mismatch and hidden blocking issues", () => {
    const r = lint();
    for (const bad of [
      { ...r, coverage: [] },
      { ...r, coverage: Array(7).fill(r.coverage[0]) },
      { ...r, receipt: { ...r.receipt, receiptId: id(999) } },
      {
        ...r,
        issues: [
          {
            issueKey: hash,
            check: "source_integrity",
            severity: "block",
            message: "Synthetic bad hash",
            sectionIds: [],
            sourceRevisionIds: [],
          },
        ],
      },
    ])
      expect(KnowledgeLintReportSchema.safeParse(bad).success).toBe(false);
    const blocked = {
      ...r,
      receipt: { ...r.receipt, outcome: "blocked" },
      coverage: r.coverage.map((c, i) => (i === 0 ? { ...c, status: "issues" } : c)),
      issues: [
        {
          issueKey: hash,
          check: "source_integrity",
          severity: "block",
          message: "Synthetic bad hash",
          sectionIds: [],
          sourceRevisionIds: [],
        },
      ],
    };
    expect(KnowledgeLintReportSchema.safeParse(blocked).success).toBe(true);
  });
  it("requires issue-versioned human resolution evidence and preserves original detected facts", () => {
    expect(MaintenanceIssueSchema.safeParse(issue).success).toBe(true);
    expect(MaintenanceIssueSchema.safeParse({ ...issue, state: "resolved" }).success).toBe(false);
    const resolution = {
      action: "resolve",
      note: "Synthetic revalidation",
      evidenceIds: [id(11)],
      actorId: "host-human",
      resolvedAt: now,
    };
    expect(
      MaintenanceIssueSchema.safeParse({ ...issue, state: "resolved", resolution }).success,
    ).toBe(true);
    expect(
      MaintenanceIssueSchema.safeParse({ ...issue, state: "dismissed", resolution }).success,
    ).toBe(false);
    expect(
      MaintenanceIssueSchema.safeParse({
        ...issue,
        state: "resolved",
        resolution: { ...resolution, evidenceIds: [] },
      }).success,
    ).toBe(false);
    expect(
      MaintenanceIssueSchema.safeParse({ ...issue, lastDetectedAt: "2020-01-01T00:00:00.000Z" })
        .success,
    ).toBe(false);
  });
  it("never loops or rewinds maintenance pagination after live filtering removes all items", () => {
    const cursor = { snapshotId: id(30), queryHash: hash, afterIssueId: id(10) };
    const query = { kinds: [], states: [], limit: 20, cursor };
    const page = {
      snapshotId: id(30),
      queryHash: hash,
      checkedAt: now,
      issues: [],
      nextCursor: null,
    };
    for (const afterIssueId of [id(10), id(9)])
      expect(
        MaintenanceExchangeSchema.safeParse({
          query,
          page: { ...page, nextCursor: { ...cursor, afterIssueId } },
        }).success,
      ).toBe(false);
    for (const nextCursor of [null, { ...cursor, afterIssueId: id(11) }])
      expect(
        MaintenanceExchangeSchema.safeParse({ query, page: { ...page, nextCursor } }).success,
      ).toBe(true);
    expect(
      MaintenanceExchangeSchema.safeParse({
        query: { ...query, cursor: null, states: ["resolved"] },
        page: { ...page, issues: [issue] },
      }).success,
    ).toBe(false);
  });
  it("distinguishes complete empty influence from unknown/partial/failed influence", () => {
    expect(KnowledgeImpactReportSchema.safeParse(impact).success).toBe(true);
    const partial = {
      ...impact,
      status: "partial",
      totalItems: null,
      unknownReasons: ["Consumption graph incomplete"],
    };
    expect(KnowledgeImpactReportSchema.safeParse(partial).success).toBe(true);
    for (const bad of [
      { ...partial, totalItems: 0 },
      { ...partial, unknownReasons: [] },
      { ...partial, status: "completed" },
      { ...impact, status: "failed" },
    ])
      expect(KnowledgeImpactReportSchema.safeParse(bad).success).toBe(false);
    expect(
      KnowledgeImpactReportSchema.safeParse({
        ...impact,
        status: "failed",
        totalItems: null,
        error: failure("STORAGE_ERROR", "Synthetic scan failure").error,
      }).success,
    ).toBe(true);
  });
  it("binds influence pages to one immutable report and excludes fabricated failure results", () => {
    const cursor = { reportId: id(20), afterItemId: id(30) };
    const query = { reportId: id(20), limit: 20, cursor };
    const page = { report: { ...impact, totalItems: 10 }, items: [], nextCursor: null };
    expect(KnowledgeImpactExchangeSchema.safeParse({ query, page }).success).toBe(true);
    for (const nextCursor of [
      cursor,
      { ...cursor, afterItemId: id(29) },
      { ...cursor, reportId: id(999) },
    ])
      expect(
        KnowledgeImpactExchangeSchema.safeParse({ query, page: { ...page, nextCursor } }).success,
      ).toBe(false);
    expect(
      KnowledgeImpactExchangeSchema.safeParse({
        query,
        page: { ...page, nextCursor: { ...cursor, afterItemId: id(31) } },
      }).success,
    ).toBe(true);
  });
  it("cannot hide known first-page impact or package unknown consumers as complete", () => {
    const query = { reportId: id(20), limit: 20, cursor: null };
    const known = {
      itemId: id(30),
      target,
      viaKnowledgeRevisionIds: [id(3)],
      consumptionId: null,
      consumerState: null,
      requiresReview: false,
    };
    const report = { ...impact, totalItems: 1 };
    expect(
      KnowledgeImpactExchangeSchema.safeParse({
        query,
        page: { report, items: [], nextCursor: null },
      }).success,
    ).toBe(false);
    expect(
      KnowledgeImpactExchangeSchema.safeParse({
        query,
        page: { report, items: [known], nextCursor: null },
      }).success,
    ).toBe(true);
    expect(
      KnowledgeImpactExchangeSchema.safeParse({
        query,
        page: { report, items: [known], nextCursor: { reportId: id(20), afterItemId: id(30) } },
      }).success,
    ).toBe(false);
    const unknown = {
      ...known,
      target: {
        kind: "consumer",
        consumerKind: "quote",
        entityId: id(31),
        revisionId: id(32),
        contentHash: hash,
      },
      consumptionId: id(33),
      consumerState: "unknown",
    };
    expect(
      KnowledgeImpactExchangeSchema.safeParse({
        query,
        page: { report, items: [unknown], nextCursor: null },
      }).success,
    ).toBe(false);
    expect(
      KnowledgeImpactExchangeSchema.safeParse({
        query,
        page: {
          report: {
            ...report,
            status: "partial",
            totalItems: null,
            unknownReasons: ["Consumer status unknown"],
          },
          items: [unknown],
          nextCursor: null,
        },
      }).success,
    ).toBe(true);
    expect(
      KnowledgeImpactExchangeSchema.safeParse({
        query: { ...query, cursor: { reportId: id(20), afterItemId: id(30) } },
        page: { report, items: [], nextCursor: null },
      }).success,
    ).toBe(true);
  });
  it("makes missing/stale/failed projection explicit instead of reporting ready", () => {
    const state = index();
    expect(KnowledgeIndexStatusSchema.safeParse(state).success).toBe(true);
    for (const bad of [
      { ...state, indexedSeq: 11 },
      { ...state, indexedSeq: 9 },
      { ...state, generation: 0 },
      { ...state, state: "failed" },
      { ...state, state: "rebuilding" },
    ])
      expect(KnowledgeIndexStatusSchema.safeParse(bad).success).toBe(false);
    expect(
      KnowledgeIndexStatusSchema.safeParse({ ...state, indexedSeq: 9, state: "stale" }).success,
    ).toBe(true);
    expect(
      KnowledgeIndexStatusSchema.safeParse({
        ...state,
        generation: 0,
        indexedSeq: 0,
        state: "missing",
      }).success,
    ).toBe(true);
  });
  it("fences index swaps by current job/generation/source snapshot without rewriting authority", () => {
    const before = {
      ...index(),
      generation: 0,
      indexedSeq: 0,
      state: "rebuilding",
      rebuildId: id(40),
    };
    const rebuild = {
      workspaceId: id(2),
      rebuildId: id(40),
      operationKey: id(41),
      index: "keyword",
      requestedSeq: 10,
      targetGeneration: 1,
      status: "completed",
      createdAt: now,
      updatedAt: now,
      result: index(),
      error: null,
    };
    expect(KnowledgeIndexRebuildSchema.safeParse(rebuild).success).toBe(true);
    expect(
      KnowledgeIndexCommitExchangeSchema.safeParse({ before, rebuild, after: index() }).success,
    ).toBe(true);
    expect(
      KnowledgeIndexCommitExchangeSchema.safeParse({
        before: { ...before, rebuildId: id(999) },
        rebuild,
        after: index(),
      }).success,
    ).toBe(false);
    expect(
      KnowledgeIndexCommitExchangeSchema.safeParse({
        before: { ...before, generation: 1 },
        rebuild,
        after: index(),
      }).success,
    ).toBe(false);
    const olderResult = {
      ...index(),
      generation: 2,
      authoritativeSeq: 120,
      indexedSeq: 90,
      state: "stale",
    };
    expect(
      KnowledgeIndexCommitExchangeSchema.safeParse({
        before: { ...before, generation: 1, authoritativeSeq: 120, indexedSeq: 100 },
        rebuild: { ...rebuild, requestedSeq: 90, targetGeneration: 2, result: olderResult },
        after: olderResult,
      }).success,
    ).toBe(false);
    expect(KnowledgeIndexRebuildSchema.safeParse({ ...rebuild, status: "failed" }).success).toBe(
      false,
    );
    expect(
      KnowledgeIndexRebuildSchema.safeParse({
        ...rebuild,
        result: { ...index(), workspaceId: id(999) },
      }).success,
    ).toBe(false);
  });
  it("transports typed maintenance commands while rejecting caller-supplied host authority", () => {
    expect(mockKnowledgeMaintenanceCommands).toHaveLength(10);
    for (const command of mockKnowledgeMaintenanceCommands) {
      expect(KnowledgeMaintenanceCommandSchema.safeParse(command).success, command.method).toBe(
        true,
      );
      expect(RuntimeCommandSchema.safeParse(command).success).toBe(true);
      expect(WorkerRequestSchema.safeParse({ id: id(99), command }).success).toBe(true);
      expect(
        KnowledgeMaintenanceCommandSchema.safeParse({
          ...command,
          actorId: "model",
          origin: "human_ui",
        }).success,
      ).toBe(false);
    }
    for (const method of [
      "wiki.resolveMaintenance",
      "wiki.rebuildIndex",
      "source.withdraw",
    ] as const)
      expect(knowledgeMaintenanceMethodOrigins[method]).toEqual(["human_ui"]);
  });
});
