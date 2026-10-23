import { type RunEvent, type RunEventsPage, RunEventsPageSchema } from "@tradequote/contracts";

/** A cursor advances only after accepting a complete, contiguous durable page. */
export class RunEventFeed {
  seq = 0;
  head = 0;
  events: RunEvent[] = [];
  private seen = new Map<string, number>();
  constructor(readonly runId: string) {}
  accept(input: RunEventsPage) {
    const page = RunEventsPageSchema.parse(input);
    if (page.run.runId !== this.runId) throw Error("EVENT_SCOPE");
    if (page.afterSeq !== this.seq) {
      if (page.nextSeq <= this.seq) return false; // duplicate/stale delivery
      throw Error("EVENT_GAP");
    }
    const seen = new Map(this.seen);
    for (const event of page.events) {
      if (seen.has(event.eventId)) throw Error("EVENT_ID_CONFLICT");
      seen.set(event.eventId, event.seq);
    }
    this.seq = page.nextSeq;
    this.head = page.headSeq;
    this.events = [...this.events, ...page.events].slice(-100);
    for (const [id, seq] of seen) if (seq < this.seq - 1000) seen.delete(id);
    this.seen = seen;
    return true;
  }
}
