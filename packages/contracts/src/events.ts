import { z } from "zod";
import { ErrorCodeSchema } from "./errors";

export const RunStatusSchema = z.enum([
  "queued",
  "running",
  "waiting_input",
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);
const envelope = {
  schemaVersion: z.literal(1),
  eventId: z.uuid(),
  runId: z.uuid(),
  seq: z.number().int().positive(),
  timestamp: z.iso.datetime(),
};
const event = <T extends string, S extends z.ZodType>(type: T, payload: S) =>
  z.strictObject({ ...envelope, type: z.literal(type), payload });
export const RunEventSchema = z.discriminatedUnion("type", [
  event("run.started", z.strictObject({ baseRevisionId: z.uuid().nullable() })),
  event("step.started", z.strictObject({ stepId: z.uuid(), label: z.string().min(1).max(200) })),
  event(
    "tool.completed",
    z.strictObject({
      toolCallId: z.string().min(1).max(200),
      toolName: z.string().min(1).max(80),
      ok: z.boolean(),
    }),
  ),
  event(
    "revision.created",
    z.strictObject({
      quoteId: z.uuid(),
      revisionId: z.uuid(),
      aggregateVersion: z.number().int().positive(),
    }),
  ),
  event("clarification.required", z.strictObject({ issueIds: z.array(z.uuid()).min(1) })),
  event(
    "artifact.ready",
    z.strictObject({
      revisionId: z.uuid(),
      artifactId: z.uuid(),
      bundleId: z.uuid(),
    }),
  ),
  event("run.completed", z.strictObject({ revisionId: z.uuid().nullable() })),
  event(
    "run.failed",
    z.strictObject({
      code: ErrorCodeSchema,
      message: z.string().min(1).max(2000),
    }),
  ),
  event("run.cancelled", z.strictObject({ committedRevisionId: z.uuid().nullable() })),
]);
export type RunEvent = z.infer<typeof RunEventSchema>;
