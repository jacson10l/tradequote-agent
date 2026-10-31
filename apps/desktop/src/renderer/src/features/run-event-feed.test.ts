import { type RunEvent, RunEventSchema, type RunEventsPage } from "@tradequote/contracts";
import { mockAgentRun } from "@tradequote/contracts/mock";
import { expect, it } from "vitest";
import { RunEventFeed } from "./run-event-feed";

const event = (seq: number): RunEvent =>
  RunEventSchema.parse({
    schemaVersion: 1,
    eventId: crypto.randomUUID(),
    runId: mockAgentRun.runId,
    seq,
    timestamp: mockAgentRun.createdAt,
    type: "run.updated",
    payload: { status: "queued", attempt: 1, committedRevisionId: null, errorCode: null },
  });
const page = (
  afterSeq: number,
  events: RunEvent[],
  headSeq = afterSeq + events.length,
): RunEventsPage => ({
  run: mockAgentRun,
  afterSeq,
  events,
  headSeq,
  nextSeq: afterSeq + events.length,
  hasMore: headSeq > afterSeq + events.length,
});
it("deduplicates repeated pages and accepts only contiguous replay", () => {
  const feed = new RunEventFeed(mockAgentRun.runId),
    first = page(0, [event(1), event(2)], 4);
  expect(feed.accept(first)).toBe(true);
  expect(feed.accept(first)).toBe(false);
  feed.accept(page(2, [event(3), event(4)]));
  expect(feed.seq).toBe(4);
  expect(feed.events).toHaveLength(4);
});
it("does not advance across a gap and fills it from the last accepted cursor", () => {
  const feed = new RunEventFeed(mockAgentRun.runId);
  feed.accept(page(0, [event(1)], 3));
  expect(() => feed.accept(page(2, [event(3)]))).toThrow("EVENT_GAP");
  expect(feed.seq).toBe(1);
  feed.accept(page(1, [event(2), event(3)]));
  expect(feed.events.map((e) => e.seq)).toEqual([1, 2, 3]);
});
it("rejects cross-page duplicate IDs, malformed rows and foreign runs atomically", () => {
  const feed = new RunEventFeed(mockAgentRun.runId),
    first = event(1);
  feed.accept(page(0, [first], 2));
  expect(() => feed.accept(page(1, [{ ...event(2), eventId: first.eventId }]))).toThrow();
  expect(() =>
    feed.accept({ ...page(1, [event(2)]), run: { ...mockAgentRun, runId: crypto.randomUUID() } }),
  ).toThrow();
  expect(() => feed.accept(page(1, [event(3)]))).toThrow();
  expect(feed.seq).toBe(1);
  expect(feed.events).toEqual([first]);
});
it("bounds display retention while preserving a monotonic replay cursor", () => {
  const feed = new RunEventFeed(mockAgentRun.runId);
  for (let i = 0; i < 12; i++)
    feed.accept(
      page(
        i * 100,
        Array.from({ length: 100 }, (_, j) => event(i * 100 + j + 1)),
        1200,
      ),
    );
  expect(feed.seq).toBe(1200);
  expect(feed.events).toHaveLength(100);
  expect(feed.events[0]?.seq).toBe(1101);
});
