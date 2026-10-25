import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { AgentRunCoordinator } from "./agent-run-coordinator";
import { RunEventStore } from "./run-event-store";
import { runFixture } from "./testing/run-fixture";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanups.splice(0).reverse()) close();
});
it("pages stable per-run seq across interleaved outbox rows, replay, retry and reopen", () => {
  const f = runFixture(cleanups);
  const command = f.start(),
    run = f.store.start(command).run,
    ticket = f.claim(run.runId);
  f.store.start(f.start()); // unrelated run/global outbox seq must not create a gap
  f.store.recordToolStep(ticket, {
    toolCallId: randomUUID(),
    attempt: 1,
    ordinal: 1,
    tool: "search_catalog",
    ok: true,
    errorCode: null,
    evidenceIds: [],
  });
  const cancel = f.control(run.runId, "agent.cancel");
  f.store.control(cancel);
  const count = f.counts();
  f.store.control(cancel);
  expect(f.counts()).toEqual(count);
  f.store.control(f.control(run.runId, "agent.retry"));
  const second = f.claim(run.runId, 2);
  f.store.fail(second, "MODEL_TIMEOUT");
  const all = [];
  let afterSeq = 0;
  for (;;) {
    const page = f.store.events({ runId: run.runId, afterSeq, limit: 2 });
    expect(page.events.length).toBeLessThanOrEqual(2);
    expect(page.run.attempt).toBe(2);
    all.push(...page.events);
    afterSeq = page.nextSeq;
    if (!page.hasMore) break;
  }
  expect(all.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  expect(new Set(all.map((e) => e.eventId)).size).toBe(8);
  expect(all.filter((e) => e.type === "tool.completed")).toHaveLength(1);
  expect(all.filter((e) => e.type === "run.updated").map((e) => e.payload.attempt)).toContain(2);
  expect(JSON.stringify(all)).not.toContain("100件");
  const before = f.counts();
  f.reopen();
  expect(f.store.events({ runId: run.runId, limit: 100 }).events).toEqual(all);
  expect(f.counts()).toEqual(before);
  expect(() => f.store.events({ runId: run.runId, afterSeq: 100 })).toThrow();
  expect(() => f.store.events({ runId: randomUUID() })).toThrow();
});

it("quote and event failure roll back together, without leaving a sequence gap", () => {
  const f = runFixture(cleanups),
    run = f.store.start(f.start()).run,
    ticket = f.claim(run.runId);
  const previous = f.store.events({ runId: run.runId }),
    before = f.counts();
  f.db.exec(
    "CREATE TRIGGER c03_abort BEFORE INSERT ON outbox WHEN NEW.type='agent.run.event.v1' AND json_extract(NEW.payload_json,'$.payload.status')='completed' BEGIN SELECT RAISE(ABORT,'synthetic'); END",
  );
  expect(() => f.store.commitQuote(ticket, f.proposal, "synthetic-model")).toThrow();
  expect(f.counts()).toEqual(before);
  expect(f.store.events({ runId: run.runId })).toEqual(previous);
  f.db.exec("DROP TRIGGER c03_abort");
  f.store.commitQuote(ticket, f.proposal, "synthetic-model");
  const next = f.store.events({ runId: run.runId, afterSeq: previous.headSeq });
  expect(next.events.map((e) => e.seq)).toEqual([previous.headSeq + 1]);
  expect(next.run.status).toBe("completed");
  expect(f.counts().quote_v1).toBe(1);
});

it("publishes only committed journal rows and never a rolled-back event", () => {
  const f = runFixture(cleanups),
    run = f.store.start(f.start()).run;
  const first = f.store.eventHints(0),
    journal = new RunEventStore(f.db, f.repo.read()!.id);
  expect(() =>
    f.db
      .transaction(() => {
        journal.append(run);
        expect(() => journal.hints(first.cursor)).toThrow();
        expect(f.store.eventHints(first.cursor).hints).toEqual([]);
        throw Error("synthetic rollback");
      })
      .immediate(),
  ).toThrow("synthetic rollback");
  expect(f.store.eventHints(first.cursor).hints).toEqual([]);
  f.db.transaction(() => journal.append(run)).immediate();
  expect(f.store.eventHints(first.cursor).hints).toEqual([
    { type: "events.available", runId: run.runId, seq: 2 },
  ]);
});

it("legacy runs have no fabricated events; reads and recovery never call a provider", async () => {
  const f = runFixture(cleanups),
    run = f.store.start(f.start()).run;
  // Synthetic pre-C03 storage: an existing queued run with no journal namespace.
  f.db.prepare("DELETE FROM outbox WHERE type='agent.run.event.v1'").run();
  const before = f.db.prepare("SELECT data_json FROM agent_run WHERE run_id=?").get(run.runId);
  expect(f.store.events({ runId: run.runId })).toMatchObject({
    events: [],
    afterSeq: 0,
    nextSeq: 0,
    headSeq: 0,
    hasMore: false,
  });
  expect(f.db.prepare("SELECT data_json FROM agent_run WHERE run_id=?").get(run.runId)).toEqual(
    before,
  );
  const provider = vi.fn();
  const coordinator = new AgentRunCoordinator(f.repo, provider);
  expect(
    coordinator.events({
      schemaVersion: 1,
      requestId: randomUUID(),
      method: "agent.events",
      payload: { runId: run.runId, afterSeq: 0, limit: 20 },
    }),
  ).toMatchObject({ ok: true, data: { run: { status: "interrupted" }, headSeq: 1 } });
  expect(provider).not.toHaveBeenCalled();
  await coordinator.close();
});

it("journal corruption fails closed without exporting arbitrary text", async () => {
  const f = runFixture(cleanups),
    run = f.store.start(f.start()).run;
  f.db
    .prepare(
      "UPDATE outbox SET payload_json=json_set(payload_json,'$.private','SYNTHETIC_PRIVATE') WHERE type='agent.run.event.v1'",
    )
    .run();
  const coordinator = new AgentRunCoordinator(f.repo, vi.fn());
  const result = coordinator.events({
    schemaVersion: 1,
    requestId: randomUUID(),
    method: "agent.events",
    payload: { runId: run.runId, afterSeq: 0, limit: 20 },
  });
  expect(result).toMatchObject({ ok: false, error: { code: "STORAGE_ERROR" } });
  expect(JSON.stringify(result)).not.toContain("SYNTHETIC_PRIVATE");
  await coordinator.close();
});
