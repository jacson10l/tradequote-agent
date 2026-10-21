import {
  ErrorCodeSchema,
  EvaluationReportSchema,
  ModelCredentialsSchema,
} from "@tradequote/contracts";
import { z } from "zod";
// Internal utility-process channel. This is deliberately absent from RuntimeCommand/renderer DTOs.
export const EvaluationWorkerInputSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("start"),
    mode: z.enum(["fixture", "deepseek"]),
    workspaceRoot: z.string().min(1),
    credentials: ModelCredentialsSchema.optional(),
    httpFixture: z
      .strictObject({
        endpoint: z.string().regex(/^http:\/\/127\.0\.0\.1:\d+$/),
        credentials: ModelCredentialsSchema,
      })
      .optional(),
  }),
  z.strictObject({ type: z.literal("cancel") }),
  z.strictObject({ type: z.literal("heartbeat") }),
]);
export const EvaluationWorkerOutputSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("ready") }),
  z.strictObject({ type: z.literal("progress"), observedRows: z.number().int().min(0).max(48) }),
  z.strictObject({ type: z.literal("report"), report: EvaluationReportSchema }),
  z.strictObject({ type: z.literal("failed"), code: ErrorCodeSchema }),
]);
