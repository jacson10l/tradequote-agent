import { describe, expect, it } from "vitest";
import {
  evaluateMaintenanceResolution,
  KnowledgeMaintenanceLifecycleEventSchema,
  type MaintenanceEvidence,
  MaintenanceEvidenceSchema,
  type MaintenanceIssue,
  MaintenanceIssueSchema,
  MaintenanceResolutionExchangeSchema,
  type MaintenanceResolutionIntent,
  MaintenanceResolutionIntentSchema,
  MaintenanceResolutionReplaySchema,
  type MaintenanceTarget,
  maintenanceResolutionEligibility,
  maintenanceResolutionPayload,
} from "./index";

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const hash = (char: string) => char.repeat(64);
const detectedAt = "2026-10-22T03:00:00.000Z";
const evidenceAt = "2026-10-22T04:00:00.000Z";
const resolvedAt = "2026-10-22T05:00:00.000Z";
const knowledgeTarget: MaintenanceTarget = {
  kind: "knowledge",
  revisionId: id(3),
  documentId: id(4),
  contentHash: hash("a"),
  sourceSetHash: hash("b"),
};
const sourceTarget: MaintenanceTarget = {
  kind: "source",
  sourceId: id(6),
  sourceRevisionId: id(7),
  artifactHash: hash("e"),
};
function issue(
  kind: MaintenanceIssue["kind"],
  target: MaintenanceTarget = knowledgeTarget,
): MaintenanceIssue {
  return {
    workspaceId: id(2),
    issueId: id(10),
    issueVersion: 3,
    dedupKey: hash("d"),
    kind,
    target,
    severity: kind === "index_stale" ? "warning" : "block",
    message: "合成维护问题",
    state: "open",
    evidenceIds: [id(30)],
    firstDetectedAt: detectedAt,
    lastDetectedAt: detectedAt,
    resolution: null,
  };
}
const published: PublishedEvidence = {
  kind: "knowledge.revision_published",
  workspaceId: id(2),
  evidenceId: id(40),
  occurredAt: evidenceAt,
  actorId: "host-human",
  revision: {
    documentId: id(4),
    revisionId: id(5),
    version: 2,
    contentHash: hash("c"),
    sourceSetHash: hash("d"),
    publishedAt: evidenceAt,
  },
};
const revised: MaintenanceEvidence = {
  kind: "source.revised",
  workspaceId: id(2),
  evidenceId: id(41),
  occurredAt: evidenceAt,
  actorId: "host-human",
  source: {
    sourceId: id(6),
    sourceRevisionId: id(8),
    previousSourceRevisionId: id(7),
    artifactHash: hash("f"),
    validity: { status: "confirmed", validFrom: null, validUntil: null },
  },
};
const reverified: MaintenanceEvidence = {
  kind: "source.integrity_reverified",
  workspaceId: id(2),
  evidenceId: id(42),
  occurredAt: evidenceAt,
  actorId: "host-job",
  verification: { sourceRevisionId: id(7), artifactHash: hash("e"), matchesRecordedHash: true },
};
const rebuilt: MaintenanceEvidence = {
  kind: "index.rebuilt",
  workspaceId: id(2),
  evidenceId: id(43),
  occurredAt: evidenceAt,
  actorId: "host-human",
  index: { index: "keyword", generation: 4, indexedSeq: 120, authoritativeSeq: 120 },
};
type ReviewDecisionEvidence = Extract<MaintenanceEvidence, { kind: "issue.review_decision" }>;
type PublishedEvidence = Extract<MaintenanceEvidence, { kind: "knowledge.revision_published" }>;
function decision(
  outcome: "duplicate_of" | "superseded" | "false_positive" | "not_applicable",
  version = 3,
): ReviewDecisionEvidence {
  return {
    kind: "issue.review_decision",
    workspaceId: id(2),
    evidenceId: id(44),
    occurredAt: evidenceAt,
    actorId: "host-human",
    decision: {
      issueId: id(10),
      issueVersion: version,
      outcome,
      canonicalIssueId: outcome === "duplicate_of" ? id(11) : null,
      rationale: "合成裁决记录",
    },
  };
}
function intent(
  current: MaintenanceIssue,
  action: MaintenanceResolutionIntent["action"],
  evidence: MaintenanceEvidence[],
  overrides: Partial<MaintenanceResolutionIntent> = {},
): MaintenanceResolutionIntent {
  return {
    workspaceId: id(2),
    actorId: "host-human",
    origin: "human_ui",
    action,
    issue: current,
    expectedIssueVersion: current.issueVersion,
    resolvedAt,
    evidence,
    ...overrides,
  };
}
function event(
  current: MaintenanceIssue,
  action: MaintenanceResolutionIntent["action"],
  evidence: MaintenanceEvidence[],
) {
  return {
    schemaVersion: 1 as const,
    workspaceId: current.workspaceId,
    eventId: id(50),
    entityId: current.issueId,
    entityVersion: current.issueVersion + 1,
    type:
      action === "resolve"
        ? ("maintenance.resolved" as const)
        : action === "dismiss"
          ? ("maintenance.dismissed" as const)
          : ("maintenance.in_progress" as const),
    evidenceIds: evidence.map((item) => item.evidenceId),
    actorId: "host-human",
    occurredAt: resolvedAt,
    note: "合成处理",
  };
}
function resolvedIssue(
  current: MaintenanceIssue,
  action: "resolve" | "dismiss",
  evidence: MaintenanceEvidence[],
): MaintenanceIssue {
  return {
    ...current,
    issueVersion: current.issueVersion + 1,
    state: action === "resolve" ? "resolved" : "dismissed",
    resolution: {
      action,
      note: "合成处理",
      evidenceIds: evidence.map((item) => item.evidenceId),
      actorId: "host-human",
      resolvedAt,
    },
  };
}
describe("B maintenance evidence qualification", () => {
  it("EVID-01 resolve accepts only a newer published revision of the same document", () => {
    const current = issue("source_updated");
    expect(evaluateMaintenanceResolution(intent(current, "resolve", [published]))).toEqual({
      ok: true,
      action: "resolve",
      evidenceIds: [id(40)],
    });
    const after = resolvedIssue(current, "resolve", [published]);
    expect(
      MaintenanceResolutionExchangeSchema.safeParse({
        intent: intent(current, "resolve", [published]),
        after,
        event: event(current, "resolve", [published]),
      }).success,
    ).toBe(true);
  });
  it("EVID-02 resolve covers source revision, integrity reverify, index rebuild and duplicate merge", () => {
    const cases: Array<[MaintenanceIssue, MaintenanceEvidence]> = [
      [issue("source_updated", sourceTarget), revised],
      [issue("hash_mismatch", sourceTarget), reverified],
      [issue("index_stale"), rebuilt],
      [issue("duplicate"), decision("duplicate_of")],
    ];
    for (const [current, evidence] of cases)
      expect(evaluateMaintenanceResolution(intent(current, "resolve", [evidence])).ok).toBe(true);
  });
  it("EVID-03 rejects cross-workspace evidence and cross-workspace requests", () => {
    const current = issue("source_updated");
    const foreign = { ...published, workspaceId: id(9) } as MaintenanceEvidence;
    expect(evaluateMaintenanceResolution(intent(current, "resolve", [foreign]))).toMatchObject({
      ok: false,
      code: "ACTION_NOT_ALLOWED",
      reason: "evidence_workspace_mismatch",
    });
    expect(
      evaluateMaintenanceResolution(
        intent(current, "resolve", [published], { workspaceId: id(9) }),
      ),
    ).toMatchObject({ ok: false, reason: "workspace_mismatch" });
    expect(evaluateMaintenanceResolution(intent(current, "start_review", [foreign]))).toMatchObject(
      {
        ok: false,
        reason: "evidence_workspace_mismatch",
      },
    );
  });
  it("EVID-04 rejects evidence that predates the latest detection", () => {
    const current = issue("source_updated");
    const stale = { ...published, occurredAt: "2026-10-22T02:30:00.000Z" } as MaintenanceEvidence;
    expect(evaluateMaintenanceResolution(intent(current, "resolve", [stale]))).toMatchObject({
      ok: false,
      code: "REVISION_CONFLICT",
      reason: "evidence_predates_detection",
    });
    const future = { ...published, occurredAt: "2026-10-22T06:00:00.000Z" } as MaintenanceEvidence;
    expect(evaluateMaintenanceResolution(intent(current, "resolve", [future]))).toMatchObject({
      ok: false,
      reason: "evidence_after_resolution",
    });
  });
  it("EVID-05 rejects republishing the same revision/content as a fix", () => {
    const current = issue("source_updated");
    const same = {
      ...published,
      revision: { ...published.revision, revisionId: id(3) },
    } as MaintenanceEvidence;
    expect(evaluateMaintenanceResolution(intent(current, "resolve", [same]))).toMatchObject({
      ok: false,
      code: "VALIDATION_ERROR",
      reason: "evidence_not_decisive",
    });
  });
  it("EVID-06 rejects dismiss by fact and resolve by mere adjudication", () => {
    const current = issue("source_updated");
    expect(evaluateMaintenanceResolution(intent(current, "dismiss", [published]))).toMatchObject({
      ok: false,
      reason: "evidence_kind_not_eligible",
    });
    expect(
      evaluateMaintenanceResolution(intent(current, "resolve", [decision("false_positive")])),
    ).toMatchObject({ ok: false, reason: "evidence_kind_not_eligible" });
    expect(
      evaluateMaintenanceResolution(intent(current, "resolve", [decision("superseded")])),
    ).toMatchObject({ ok: false, reason: "evidence_kind_not_eligible" });
  });
  it("EVID-07 rejects decisions bound to another issue version or to itself", () => {
    const current = issue("source_updated");
    expect(
      evaluateMaintenanceResolution(intent(current, "dismiss", [decision("not_applicable", 2)])),
    ).toMatchObject({ ok: false, code: "REVISION_CONFLICT", reason: "evidence_snapshot_mismatch" });
    const duplicate = issue("duplicate");
    const self = decision("duplicate_of");
    expect(
      evaluateMaintenanceResolution(
        intent(duplicate, "resolve", [
          { ...self, decision: { ...self.decision, canonicalIssueId: duplicate.issueId } },
        ]),
      ),
    ).toMatchObject({ ok: false, reason: "evidence_not_decisive" });
  });
  it("EVID-08 rejects unknown validity and unborn sources as resolution", () => {
    const current = issue("expired", sourceTarget);
    const unknown = {
      ...revised,
      source: {
        ...revised.source,
        validity: { status: "unknown" as const, validFrom: null, validUntil: null },
      },
    } as MaintenanceEvidence;
    expect(evaluateMaintenanceResolution(intent(current, "resolve", [unknown]))).toMatchObject({
      ok: false,
      code: "SOURCE_CONFLICT",
      reason: "evidence_void",
    });
    const expired = {
      ...revised,
      source: {
        ...revised.source,
        validity: {
          status: "confirmed" as const,
          validFrom: null,
          validUntil: "2026-10-22T04:30:00.000Z",
        },
      },
    } as MaintenanceEvidence;
    expect(evaluateMaintenanceResolution(intent(current, "resolve", [expired]))).toMatchObject({
      ok: false,
      reason: "evidence_void",
    });
  });
  it("EVID-09 rejects non-human actors, stale issue versions, closed issues and duplicate evidence", () => {
    const current = issue("source_updated");
    expect(
      evaluateMaintenanceResolution(
        intent(current, "resolve", [published], { origin: "agent_tool" }),
      ),
    ).toMatchObject({ ok: false, code: "ACTION_NOT_ALLOWED", reason: "actor_not_human" });
    expect(
      evaluateMaintenanceResolution(
        intent(current, "resolve", [published], { expectedIssueVersion: 2 }),
      ),
    ).toMatchObject({ ok: false, code: "REVISION_CONFLICT", reason: "issue_version_stale" });
    const closed = { ...current, state: "resolved" as const };
    expect(evaluateMaintenanceResolution(intent(closed, "resolve", [published]))).toMatchObject({
      ok: false,
      reason: "issue_already_closed",
    });
    expect(
      evaluateMaintenanceResolution(intent(current, "resolve", [published, published])),
    ).toMatchObject({ ok: false, reason: "evidence_not_decisive" });
  });
  it("EVID-10 rejects exchanges that rewrite identity, jump versions or mismatch the event", () => {
    const current = issue("source_updated");
    const after = resolvedIssue(current, "resolve", [published]);
    const good = {
      intent: intent(current, "resolve", [published]),
      after,
      event: event(current, "resolve", [published]),
    };
    expect(MaintenanceResolutionExchangeSchema.safeParse(good).success).toBe(true);
    for (const bad of [
      { ...good, after: { ...after, target: sourceTarget } },
      { ...good, after: { ...after, firstDetectedAt: resolvedAt } },
      { ...good, after: { ...after, issueVersion: 9 } },
      { ...good, after: { ...after, lastDetectedAt: "2026-10-22T01:00:00.000Z" } },
      { ...good, after: { ...after, resolution: { ...after.resolution!, evidenceIds: [id(99)] } } },
      { ...good, event: { ...good.event, entityVersion: 1 } },
      { ...good, event: { ...good.event, type: "maintenance.dismissed" } },
      { ...good, intent: intent(current, "start_review", [published]) },
    ])
      expect(MaintenanceResolutionExchangeSchema.safeParse(bad).success).toBe(false);
    const started = {
      ...current,
      issueVersion: current.issueVersion + 1,
      state: "in_progress" as const,
    };
    expect(
      MaintenanceResolutionExchangeSchema.safeParse({
        intent: intent(current, "start_review", [published]),
        after: started,
        event: event(current, "start_review", [published]),
      }).success,
    ).toBe(true);
  });
  it("EVID-11 binds idempotency to one payload and separates same-key replay from same-key new args", () => {
    const request = maintenanceResolutionPayload({
      workspaceId: id(2),
      actorId: "host-human",
      origin: "human_ui",
      issueId: id(10),
      expectedIssueVersion: 3,
      action: "resolve",
      note: "合成处理",
      evidenceIds: [id(41), id(40)],
    });
    const reordered = maintenanceResolutionPayload({
      workspaceId: id(2),
      actorId: "host-human",
      origin: "human_ui",
      issueId: id(10),
      expectedIssueVersion: 3,
      action: "resolve",
      note: "合成处理",
      evidenceIds: [id(40), id(41)],
    });
    expect(request).toBe(reordered);
    expect(request).not.toContain("requestId");
    expect(request).not.toContain(resolvedAt);
    const other = maintenanceResolutionPayload({
      workspaceId: id(2),
      actorId: "host-human",
      origin: "human_ui",
      issueId: id(10),
      expectedIssueVersion: 3,
      action: "dismiss",
      note: "合成处理",
      evidenceIds: [id(40)],
    });
    const base = { idempotencyKey: id(60), workspaceId: id(2), payload: request };
    expect(
      MaintenanceResolutionReplaySchema.safeParse({ request: base, stored: null, outcome: "new" })
        .success,
    ).toBe(true);
    expect(
      MaintenanceResolutionReplaySchema.safeParse({
        request: base,
        stored: { ...base, payload: reordered },
        outcome: "replay",
      }).success,
    ).toBe(true);
    expect(
      MaintenanceResolutionReplaySchema.safeParse({
        request: base,
        stored: { ...base, payload: other },
        outcome: "idempotency_conflict",
      }).success,
    ).toBe(true);
    for (const bad of [
      { request: base, stored: { ...base, payload: other }, outcome: "replay" },
      { request: base, stored: null, outcome: "replay" },
      { request: base, stored: { ...base, idempotencyKey: id(61) }, outcome: "replay" },
      { request: base, stored: { ...base, workspaceId: id(9) }, outcome: "replay" },
    ])
      expect(MaintenanceResolutionReplaySchema.safeParse(bad).success).toBe(false);
  });
  it("EVID-12 rejects fabricated evidence records and keeps the eligibility matrix total", () => {
    for (const bad of [
      {
        ...published,
        revision: { ...published.revision, publishedAt: "2026-10-22T06:00:00.000Z" },
      },
      {
        kind: "source.validity_confirmed",
        workspaceId: id(2),
        evidenceId: id(45),
        occurredAt: evidenceAt,
        actorId: "host-human",
        confirmation: {
          sourceId: id(6),
          sourceRevisionId: id(7),
          validity: { status: "unknown", validFrom: null, validUntil: null },
        },
      },
      { ...rebuilt, index: { ...rebuilt.index, indexedSeq: 119 } },
      { ...rebuilt, index: { ...rebuilt.index, generation: 0 } },
      {
        ...decision("duplicate_of"),
        decision: { ...decision("duplicate_of").decision, canonicalIssueId: null },
      },
      {
        ...decision("false_positive"),
        decision: { ...decision("false_positive").decision, canonicalIssueId: id(12) },
      },
      {
        kind: "agent.proposal",
        workspaceId: id(2),
        evidenceId: id(46),
        occurredAt: evidenceAt,
        actorId: "model",
      },
    ])
      expect(MaintenanceEvidenceSchema.safeParse(bad).success).toBe(false);
    for (const kind of Object.keys(maintenanceResolutionEligibility))
      expect(MaintenanceIssueSchema.shape.kind.options).toContain(kind);
    expect(maintenanceResolutionEligibility.duplicate.dismiss).toEqual(["issue.review_decision"]);
    expect(
      MaintenanceResolutionIntentSchema.safeParse(intent(issue("orphan"), "resolve", [])).success,
    ).toBe(false);
    expect(
      KnowledgeMaintenanceLifecycleEventSchema.safeParse(
        event(issue("orphan"), "resolve", [published]),
      ).success,
    ).toBe(true);
  });
});
