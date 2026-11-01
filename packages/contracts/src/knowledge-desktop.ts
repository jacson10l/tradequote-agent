import { z } from "zod";
import { KnowledgeBuildInputSchema, KnowledgeBuildSourcePinSchema } from "./knowledge-build";
import { WikiRevisionRecordSchema, WikiSourceRevisionSchema } from "./knowledge-wiki";
import { readEnvelope, resultSchema, writeEnvelope } from "./protocol";

/** Single-source, single-call desktop slice. Does not pretend to implement the broader build-run protocol. */
export const KnowledgeDesktopCommandSchema = z.discriminatedUnion("method", [
  z.strictObject({
    ...writeEnvelope,
    method: z.literal("knowledge.importCatalog"),
    payload: z.strictObject({
      label: z.string().trim().min(1).max(120),
      csv: z.string().min(1).max(500000),
    }),
  }),
  z.strictObject({
    ...writeEnvelope,
    method: z.literal("knowledge.seedDemo"),
    payload: z.strictObject({}),
  }),
  z.strictObject({
    ...readEnvelope,
    method: z.literal("knowledge.overview"),
    payload: z.strictObject({}),
  }),
  z.strictObject({
    ...writeEnvelope,
    method: z.literal("knowledge.organize"),
    payload: z.strictObject({
      source: KnowledgeBuildSourcePinSchema,
      target: KnowledgeBuildInputSchema.shape.target,
      instructions: KnowledgeBuildInputSchema.shape.instructions,
    }),
  }),
]);
export const KnowledgeDesktopResultSchema = resultSchema(
  z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("knowledgeOverview"),
      sources: z.array(WikiSourceRevisionSchema).max(300),
      records: z.array(WikiRevisionRecordSchema).max(400),
      hasMore: z.boolean(),
    }),
    z.strictObject({
      kind: z.literal("imported"),
      sources: z.number().int().nonnegative(),
      records: z.number().int().nonnegative(),
      reused: z.boolean(),
    }),
    z.strictObject({ kind: z.literal("organized"), record: WikiRevisionRecordSchema }),
  ]),
);
export type KnowledgeDesktopCommand = z.infer<typeof KnowledgeDesktopCommandSchema>;
export type KnowledgeDesktopResult = z.infer<typeof KnowledgeDesktopResultSchema>;
export interface KnowledgeDesktopClient {
  executeKnowledgeDesktop(command: KnowledgeDesktopCommand): Promise<KnowledgeDesktopResult>;
}
