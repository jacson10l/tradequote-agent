import { describe, expect, it } from "vitest";
import {
  failure,
  KnowledgeBuildCandidateCommitExchangeSchema,
  KnowledgeBuildCommandSchema,
  KnowledgeBuildEventSchema,
  KnowledgeBuildInputSchema,
  KnowledgeBuildListExchangeSchema,
  KnowledgeBuildProposalExchangeSchema,
  KnowledgeBuildProposalSchema,
  type KnowledgeBuildRun,
  KnowledgeBuildRunSchema,
  KnowledgeBuildTransitionSchema,
  knowledgeBuildMethodOrigins,
  RuntimeCommandSchema,
  WorkerRequestSchema,
} from "./index";
import {
  mockKnowledgeBuildInput as input,
  mockKnowledgeBuildCommands,
  mockWikiStageInput,
  mockKnowledgeBuildProposal as proposal,
} from "./mock";

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const hash = "a".repeat(64);
const now = "2026-10-22T02:00:00.000Z";
function queued(): KnowledgeBuildRun {
  return {
    workspaceId: id(1),
    runId: id(2),
    operationKey: id(3),
    runVersion: 1,
    executionTicketId: null,
    command: {
      schemaVersion: 1,
      requestId: id(4),
      idempotencyKey: id(3),
      method: "knowledgeBuild.start",
      payload: input,
    },
    sourceSetHash: hash,
    status: "queued",
    attempt: 1,
    createdAt: now,
    updatedAt: now,
    usage: { modelCalls: 0, outputBytes: 0, elapsedMs: 0 },
    checkpoint: { lastEventSeq: 1, phase: "queued", proposalKeys: [] },
    completion: null,
    error: null,
  };
}
function running(): KnowledgeBuildRun {
  return {
    ...queued(),
    runVersion: 2,
    executionTicketId: id(5),
    status: "running",
    checkpoint: { lastEventSeq: 2, phase: "model_requested", proposalKeys: [] },
  };
}
function completed(): KnowledgeBuildRun {
  const run = running();
  return {
    ...run,
    status: "completed",
    runVersion: 3,
    usage: { modelCalls: 1, outputBytes: 100, elapsedMs: 100 },
    checkpoint: { lastEventSeq: 4, phase: "candidates_committed", proposalKeys: ["proposal_one"] },
    completion: {
      receiptId: id(6),
      workspaceId: run.workspaceId,
      runId: run.runId,
      operationKey: run.operationKey,
      attempt: run.attempt,
      executionTicketId: id(5),
      inputSourceSetHash: hash,
      committedAt: now,
      candidates: [
        {
          lifecycleState: "candidate",
          proposalKey: "proposal_one",
          candidateRevisionId: id(7),
          documentId: id(8),
          version: 1,
          contentHash: hash,
          sourceSetHash: hash,
          sources: input.sources,
        },
      ],
      candidateRevisionIds: [id(7)],
    },
  };
}
describe("B00a P1 knowledge generation protocol", () => {
  it("freezes exact source/base/target and bounded model budgets without quote fields", () => {
    expect(KnowledgeBuildInputSchema.parse(input)).toEqual(input);
    for (const bad of [
      { ...input, sources: [] },
      { ...input, sources: [...input.sources, ...input.sources] },
      { ...input, budget: { ...input.budget, maxModelCalls: 6 } },
      { ...input, budget: { ...input.budget, timeoutMs: 120001 } },
      { ...input, budget: { ...input.budget, maxOutputBytes: 128001 } },
      { ...input, maxCandidates: 11 },
      { ...input, operation: "revise" },
      { ...input, quoteId: id(9) },
      { ...input, apiKey: "not-a-real-credential" },
    ])
      expect(KnowledgeBuildInputSchema.safeParse(bad).success).toBe(false);
    const base = {
      documentId: id(10),
      revisionId: id(11),
      contentHash: hash,
      sourceSetHash: hash,
      expectedVersion: 1,
    };
    expect(
      KnowledgeBuildInputSchema.safeParse({ ...input, operation: "revise", base, maxCandidates: 1 })
        .success,
    ).toBe(true);
    expect(
      KnowledgeBuildInputSchema.safeParse({ ...input, operation: "merge", base, maxCandidates: 1 })
        .success,
    ).toBe(false);
  });
  it("accepts SOP proposal local keys but rejects model-created authority and forged human facts", () => {
    expect(KnowledgeBuildProposalExchangeSchema.safeParse({ input, proposal }).success).toBe(true);
    for (const extra of [
      { revisionId: id(9) },
      { proposalId: id(9) },
      { contentHash: hash },
      { sourceSetHash: hash },
      { reviewer: "model" },
      { status: "published" },
    ])
      expect(KnowledgeBuildProposalSchema.safeParse({ ...proposal, ...extra }).success).toBe(false);
    expect(
      KnowledgeBuildProposalSchema.safeParse({
        ...proposal,
        validity: { ...proposal.validity, status: "confirmed" },
      }).success,
    ).toBe(false);
    const section = proposal.sections[0]!;
    expect(
      KnowledgeBuildProposalSchema.safeParse({
        ...proposal,
        sections: [
          { ...section, citations: [{ ...section.citations[0], assertion: "human_note" }] },
        ],
      }).success,
    ).toBe(false);
  });
  it("rejects unknown sources/relations, source-free statements and invalid Markdown coordinates", () => {
    const section = proposal.sections[0]!;
    for (const p of [
      { ...proposal, sections: [{ ...section, citations: [] }] },
      {
        ...proposal,
        sections: [
          { ...section, citations: [{ ...section.citations[0], sourceRevisionId: id(999) }] },
        ],
      },
      { ...proposal, sections: [{ ...section, location: { kind: "text", start: 0, end: 999 } }] },
      { ...proposal, relations: [{ kind: "related", targetRevisionId: id(999) }] },
      {
        ...proposal,
        suggestions: [{ kind: "merge", targetRevisionId: id(999), reason: "synthetic" }],
      },
      { ...proposal, sections: [section, section] },
    ])
      expect(KnowledgeBuildProposalExchangeSchema.safeParse({ input, proposal: p }).success).toBe(
        false,
      );
    expect(
      KnowledgeBuildProposalExchangeSchema.safeParse({
        input: { ...input, target: { ...input.target, kind: "rule" } },
        proposal,
      }).success,
    ).toBe(false);
  });
  it("only completes with a nonempty unique atomic candidate receipt for the exact execution", () => {
    const run = completed();
    expect(KnowledgeBuildRunSchema.safeParse(run).success).toBe(true);
    const receipt = run.completion!;
    for (const changed of [
      { ...run, completion: null },
      { ...run, committedRevisionId: id(99) },
      { ...run, completion: { ...receipt, candidateRevisionIds: [] } },
      { ...run, completion: { ...receipt, candidateRevisionIds: [id(7), id(7)] } },
      { ...run, completion: { ...receipt, workspaceId: id(999) } },
      { ...run, completion: { ...receipt, runId: id(999) } },
      { ...run, completion: { ...receipt, operationKey: id(999) } },
      { ...run, completion: { ...receipt, attempt: 2 } },
      { ...run, completion: { ...receipt, executionTicketId: id(999) } },
      {
        ...run,
        completion: {
          ...receipt,
          candidates: [{ ...receipt.candidates[0], lifecycleState: "published" }],
        },
      },
      { ...run, usage: { ...run.usage, modelCalls: 3 } },
      { ...run, checkpoint: { ...run.checkpoint, proposalKeys: [] } },
    ])
      expect(KnowledgeBuildRunSchema.safeParse(changed).success).toBe(false);
  });
  it.each(["failed", "cancelled", "interrupted"] as const)(
    "%s cannot contain candidates or erase failure classification",
    (status) => {
      const run = {
        ...running(),
        status,
        error: status === "cancelled" ? null : failure("MODEL_TIMEOUT", "Synthetic failure").error,
      };
      expect(KnowledgeBuildRunSchema.safeParse(run).success).toBe(true);
      expect(
        KnowledgeBuildRunSchema.safeParse({ ...run, completion: completed().completion }).success,
      ).toBe(false);
      if (status !== "cancelled")
        expect(KnowledgeBuildRunSchema.safeParse({ ...run, error: null }).success).toBe(false);
    },
  );
  it("resets cancelled/failed/interrupted attempts explicitly and never revives old worker authority", () => {
    const before: KnowledgeBuildRun = {
      ...running(),
      runVersion: 3,
      status: "interrupted",
      error: failure("CANCELLED", "Interrupted on reopen").error,
    };
    const after: KnowledgeBuildRun = {
      ...queued(),
      runVersion: 4,
      attempt: 2,
      checkpoint: { ...queued().checkpoint, lastEventSeq: 5 },
    };
    expect(
      KnowledgeBuildTransitionSchema.safeParse({ before, after, action: "retry" }).success,
    ).toBe(true);
    for (const a of [
      { ...after, attempt: 1 },
      { ...after, runVersion: 3 },
      {
        ...after,
        command: { ...after.command, payload: { ...input, instructions: "different input" } },
      },
      { ...after, checkpoint: { ...after.checkpoint, lastEventSeq: 1 } },
    ])
      expect(
        KnowledgeBuildTransitionSchema.safeParse({ before, after: a, action: "retry" }).success,
      ).toBe(false);
    expect(
      KnowledgeBuildTransitionSchema.safeParse({ before: completed(), after, action: "retry" })
        .success,
    ).toBe(false);
    expect(
      KnowledgeBuildTransitionSchema.safeParse({
        before: running(),
        after: { ...completed(), executionTicketId: id(999) },
        action: "complete",
      }).success,
    ).toBe(false);
  });
  it("represents ordinary queued precondition/running model failure without erasing completed facts", () => {
    for (const before of [queued(), running()]) {
      const after = {
        ...before,
        runVersion: before.runVersion + 1,
        status: "failed",
        error: failure("MODEL_TIMEOUT", "Synthetic failure").error,
        checkpoint: { ...before.checkpoint, lastEventSeq: before.checkpoint.lastEventSeq + 1 },
      };
      expect(
        KnowledgeBuildTransitionSchema.safeParse({ before, after, action: "fail" }).success,
      ).toBe(true);
      expect(
        KnowledgeBuildTransitionSchema.safeParse({
          before,
          after: { ...after, attempt: 2 },
          action: "fail",
        }).success,
      ).toBe(false);
      expect(
        KnowledgeBuildTransitionSchema.safeParse({
          before,
          after: { ...after, error: null },
          action: "fail",
        }).success,
      ).toBe(false);
    }
    expect(
      KnowledgeBuildTransitionSchema.safeParse({
        before: completed(),
        after: {
          ...running(),
          status: "failed",
          runVersion: 4,
          error: failure("MODEL_TIMEOUT", "Late failure").error,
        },
        action: "fail",
      }).success,
    ).toBe(false);
  });
  it("preserves completed facts on late cancel and permits only valid versioned transitions", () => {
    expect(
      KnowledgeBuildTransitionSchema.safeParse({
        before: queued(),
        after: running(),
        action: "start",
      }).success,
    ).toBe(true);
    expect(
      KnowledgeBuildTransitionSchema.safeParse({
        before: running(),
        after: completed(),
        action: "complete",
      }).success,
    ).toBe(true);
    expect(
      KnowledgeBuildTransitionSchema.safeParse({
        before: completed(),
        after: completed(),
        action: "cancel",
      }).success,
    ).toBe(true);
    expect(
      KnowledgeBuildTransitionSchema.safeParse({
        before: completed(),
        after: { ...queued(), status: "cancelled", runVersion: 4 },
        action: "cancel",
      }).success,
    ).toBe(false);
  });
  it("fences list snapshots/workspaces and strictly advances empty continuation pages", () => {
    const cursor = { snapshotId: id(10), afterRunId: id(20) };
    const query = { limit: 20, cursor };
    const page = { workspaceId: id(1), snapshotId: id(10), runs: [], nextCursor: null };
    expect(KnowledgeBuildListExchangeSchema.safeParse({ query, page }).success).toBe(true);
    for (const afterRunId of [id(20), id(21)])
      expect(
        KnowledgeBuildListExchangeSchema.safeParse({
          query,
          page: { ...page, nextCursor: { ...cursor, afterRunId } },
        }).success,
      ).toBe(false);
    expect(
      KnowledgeBuildListExchangeSchema.safeParse({
        query,
        page: { ...page, nextCursor: { ...cursor, afterRunId: id(19) } },
      }).success,
    ).toBe(true);
    expect(
      KnowledgeBuildListExchangeSchema.safeParse({
        query: { limit: 20, cursor: null },
        page: { ...page, runs: [{ ...queued(), workspaceId: id(999) }] },
      }).success,
    ).toBe(false);
  });
  it("separates frozen allowed sources from each candidate's actually used source set", () => {
    const run = completed();
    run.command.payload = structuredClone(run.command.payload);
    run.command.payload.sources.push({ sourceRevisionId: id(99), artifactHash: hash });
    run.completion!.candidates[0]!.sourceSetHash = "c".repeat(64);
    expect(KnowledgeBuildRunSchema.safeParse(run).success).toBe(true);
    expect(
      KnowledgeBuildRunSchema.safeParse({
        ...run,
        completion: { ...run.completion, inputSourceSetHash: "d".repeat(64) },
      }).success,
    ).toBe(false);
  });
  it("exposes a host-only candidate transaction contract fenced by current attempt and scope", () => {
    const run = {
      ...running(),
      checkpoint: { lastEventSeq: 3, phase: "proposal_validated", proposalKeys: ["proposal_one"] },
    };
    const commit = {
      runId: id(2),
      expectedRunVersion: 2,
      attempt: 1,
      operationKey: id(3),
      executionTicketId: id(5),
      candidates: [
        {
          proposalKey: "proposal_one",
          expectedVersion: 0,
          revision: {
            workspaceId: id(1),
            revisionId: id(7),
            documentId: id(8),
            version: 1,
            parentRevisionId: null,
            createdAt: now,
            content: mockWikiStageInput.content,
            artifactId: hash,
            contentHash: hash,
            sourceSetHash: hash,
          },
        },
      ],
    };
    expect(KnowledgeBuildCandidateCommitExchangeSchema.safeParse({ run, commit }).success).toBe(
      true,
    );
    for (const c of [
      { ...commit, attempt: 2 },
      { ...commit, executionTicketId: id(99) },
      { ...commit, expectedRunVersion: 1 },
      { ...commit, candidates: [] },
    ])
      expect(
        KnowledgeBuildCandidateCommitExchangeSchema.safeParse({ run, commit: c }).success,
      ).toBe(false);
  });
  it("keeps build events separate from quote commits and refuses credentials/checkpoint payload injection", () => {
    const event = {
      schemaVersion: 1,
      workspaceId: id(1),
      eventId: id(99),
      runId: id(2),
      seq: 4,
      attempt: 1,
      timestamp: now,
      type: "knowledgeBuild.completed",
      payload: completed().completion,
    };
    expect(KnowledgeBuildEventSchema.safeParse(event).success).toBe(true);
    expect(
      KnowledgeBuildEventSchema.safeParse({ ...event, payload: { committedRevisionId: id(99) } })
        .success,
    ).toBe(false);
    expect(
      KnowledgeBuildRunSchema.safeParse({
        ...queued(),
        checkpoint: { ...queued().checkpoint, prompt: "unfiltered raw prompt" },
      }).success,
    ).toBe(false);
  });
  it("requires control OCC/idempotency, denies model start/control and rejects legacy transports", () => {
    expect(mockKnowledgeBuildCommands).toHaveLength(5);
    for (const command of mockKnowledgeBuildCommands) {
      expect(KnowledgeBuildCommandSchema.safeParse(command).success).toBe(true);
      expect(RuntimeCommandSchema.safeParse(command).success).toBe(false);
      expect(WorkerRequestSchema.safeParse({ id: id(99), command }).success).toBe(false);
      expect(
        KnowledgeBuildCommandSchema.safeParse({ ...command, workspaceId: id(99) }).success,
      ).toBe(false);
    }
    for (const method of [
      "knowledgeBuild.start",
      "knowledgeBuild.cancel",
      "knowledgeBuild.retry",
    ] as const)
      expect(knowledgeBuildMethodOrigins[method]).toEqual(["human_ui"]);
    expect(
      KnowledgeBuildCommandSchema.safeParse({
        ...mockKnowledgeBuildCommands[3],
        payload: { runId: id(2) },
      }).success,
    ).toBe(false);
  });
});
