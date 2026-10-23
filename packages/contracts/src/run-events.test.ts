import { expect, it } from "vitest";
import {
  RunEventsCommandSchema,
  RunEventsPageSchema,
  RunEventsSignalSchema,
  RuntimeCommandSchema,
  WorkerRequestSchema,
} from "./index";
import { mockAgentRun } from "./mock";

it("keeps event paging read-only, bounded, host-scoped and strict", () => {
  const command = {
    schemaVersion: 1,
    requestId: crypto.randomUUID(),
    method: "agent.events",
    payload: { runId: mockAgentRun.runId },
  };
  expect(RunEventsCommandSchema.parse(command).payload).toEqual({
    runId: mockAgentRun.runId,
    afterSeq: 0,
    limit: 20,
  });
  expect(RuntimeCommandSchema.safeParse(command).success).toBe(true);
  expect(WorkerRequestSchema.safeParse({ id: crypto.randomUUID(), command }).success).toBe(true);
  for (const payload of [
    { runId: mockAgentRun.runId, limit: 101 },
    { runId: mockAgentRun.runId, afterSeq: -1 },
    { runId: mockAgentRun.runId, workspaceId: crypto.randomUUID() },
    { runId: mockAgentRun.runId, key: "synthetic" },
  ])
    expect(RunEventsCommandSchema.safeParse({ ...command, payload }).success).toBe(false);
});
it("rejects gaps, duplicate identities and cross-run pages at the public boundary", () => {
  const event = {
    schemaVersion: 1,
    eventId: crypto.randomUUID(),
    runId: mockAgentRun.runId,
    seq: 1,
    timestamp: mockAgentRun.createdAt,
    type: "run.updated",
    payload: { status: "queued", attempt: 1, committedRevisionId: null, errorCode: null },
  };
  const page = {
    run: mockAgentRun,
    events: [event],
    afterSeq: 0,
    nextSeq: 1,
    headSeq: 1,
    hasMore: false,
  };
  expect(RunEventsPageSchema.safeParse(page).success).toBe(true);
  for (const changed of [
    { ...page, events: [{ ...event, seq: 2 }] },
    { ...page, events: [event, { ...event, seq: 2 }], nextSeq: 2, headSeq: 2 },
    { ...page, events: [{ ...event, runId: crypto.randomUUID() }] },
    { ...page, nextSeq: 0 },
    { ...page, hasMore: true },
    { ...page, events: [], nextSeq: 0, hasMore: true },
  ])
    expect(RunEventsPageSchema.safeParse(changed).success).toBe(false);
  expect(
    RunEventsSignalSchema.safeParse({
      type: "events.available",
      runId: mockAgentRun.runId,
      seq: 1,
      raw: "synthetic",
    }).success,
  ).toBe(false);
});
