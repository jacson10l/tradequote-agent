import { z } from "zod";
import { RunEventSchema } from "./events";
import { readEnvelope, resultSchema } from "./protocol";
import { AgentRunSchema } from "./runs";

const seq = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const RunEventsQuerySchema = z.strictObject({
  runId: z.uuid(),
  afterSeq: seq.default(0),
  limit: z.number().int().min(1).max(100).default(20),
});
export const RunEventsCommandSchema = z.strictObject({
  ...readEnvelope,
  method: z.literal("agent.events"),
  payload: RunEventsQuerySchema,
});
export const RunEventsPageSchema = z
  .strictObject({
    run: AgentRunSchema,
    events: z.array(RunEventSchema).max(100),
    afterSeq: seq,
    nextSeq: seq,
    headSeq: seq,
    hasMore: z.boolean(),
  })
  .superRefine((page, ctx) => {
    if (
      page.events.some((e, i) => e.runId !== page.run.runId || e.seq !== page.afterSeq + i + 1) ||
      new Set(page.events.map((e) => e.eventId)).size !== page.events.length ||
      page.nextSeq !== page.afterSeq + page.events.length ||
      page.nextSeq > page.headSeq ||
      (page.hasMore && page.events.length === 0) ||
      page.hasMore !== page.nextSeq < page.headSeq
    )
      ctx.addIssue({ code: "custom", message: "事件页须属于同一运行且序号连续" });
  });
export const RunEventsResultSchema = resultSchema(RunEventsPageSchema);
// Hints contain no business text and are never authoritative state. Re-read durable pages.
export const RunEventsSignalSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("events.available"), runId: z.uuid(), seq: seq.min(1) }),
  z.strictObject({ type: z.literal("events.connection"), connected: z.boolean() }),
]);
export const RunEventsWatchSchema = z.strictObject({
  type: z.literal("events.watch"),
  enabled: z.boolean(),
});
export type RunEventsQuery = z.input<typeof RunEventsQuerySchema>;
export type RunEventsCommand = z.infer<typeof RunEventsCommandSchema>;
export type RunEventsPage = z.infer<typeof RunEventsPageSchema>;
export type RunEventsResult = z.infer<typeof RunEventsResultSchema>;
export type RunEventsSignal = z.infer<typeof RunEventsSignalSchema>;
export interface RunEventsClient {
  getAgentRunEvents(command: RunEventsCommand): Promise<RunEventsResult>;
  onAgentRunEvents(listener: (signal: RunEventsSignal) => void): () => void;
}
