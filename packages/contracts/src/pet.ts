import { z } from "zod";
import { ErrorCodeSchema } from "./errors";
import { IssueSchema } from "./protocol";

/**
 * 虚拟形象（报价小人）契约。
 *
 * 与业务询报价严格隔离：人设与会话记忆存独立 pet-memory.db（不写业务 SQLite、
 * 不写 wiki-project），对话走独立上下文（不混入业务事件/账本）。人设需人工审核
 * 后生效；会话记忆免审自动写、有界（滑动窗口 + 摘要）。
 */

export const PetPersonaSchema = z.strictObject({
  id: z.uuid(),
  version: z.number().int().positive(),
  content: z.string().trim().min(1).max(4000),
  status: z.enum(["candidate", "approved"]),
  approvedBy: z.string().trim().max(200).nullable(),
  approvedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type PetPersona = z.infer<typeof PetPersonaSchema>;

export const PetMemoryItemSchema = z.strictObject({
  id: z.uuid(),
  kind: z.enum(["fact", "summary"]),
  content: z.string().trim().min(1).max(4000),
  createdAt: z.iso.datetime(),
});
export type PetMemoryItem = z.infer<typeof PetMemoryItemSchema>;

export const PetStateSchema = z.strictObject({
  persona: PetPersonaSchema.nullable(),
  memories: z.array(PetMemoryItemSchema),
});
export type PetState = z.infer<typeof PetStateSchema>;

export const PetResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    data: PetStateSchema,
    warnings: z.array(z.never()),
    evidenceIds: z.array(z.string()),
  }),
  z.strictObject({
    ok: z.literal(false),
    error: z.strictObject({
      code: ErrorCodeSchema,
      message: z.string(),
      retryable: z.boolean(),
      issues: z.array(IssueSchema),
    }),
  }),
]);
export type PetResult = z.infer<typeof PetResultSchema>;

export const PetChatResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    data: z.strictObject({
      reply: z.string().trim().min(1).max(4000),
    }),
    warnings: z.array(z.never()),
    evidenceIds: z.array(z.string()),
  }),
  z.strictObject({
    ok: z.literal(false),
    error: z.strictObject({
      code: ErrorCodeSchema,
      message: z.string(),
      retryable: z.boolean(),
      issues: z.array(IssueSchema),
    }),
  }),
]);
export type PetChatResult = z.infer<typeof PetChatResultSchema>;

const writeEnvelope = {
  schemaVersion: z.literal(1),
  requestId: z.uuid(),
  idempotencyKey: z.uuid(),
};

export const PetCommandSchema = z.discriminatedUnion("method", [
  z.strictObject({ ...writeEnvelope, method: z.literal("pet.getState") }),
  z.strictObject({
    ...writeEnvelope,
    method: z.literal("pet.proposePersona"),
    payload: z.strictObject({ content: z.string().trim().min(1).max(4000) }),
  }),
  z.strictObject({
    ...writeEnvelope,
    method: z.literal("pet.approvePersona"),
    payload: z.strictObject({
      personaId: z.uuid(),
      approvedBy: z.string().trim().min(1).max(200),
    }),
  }),
  z.strictObject({
    ...writeEnvelope,
    method: z.literal("pet.chat"),
    payload: z.strictObject({
      message: z.string().trim().min(1).max(4000),
      history: z
        .array(
          z.strictObject({
            role: z.enum(["user", "assistant"]),
            content: z.string().trim().min(1).max(4000),
          }),
        )
        .max(20)
        .default([]),
    }),
  }),
]);
export type PetCommand = z.infer<typeof PetCommandSchema>;

export interface PetClient {
  getPetState(command: Extract<PetCommand, { method: "pet.getState" }>): Promise<PetResult>;
  proposePersona(
    command: Extract<PetCommand, { method: "pet.proposePersona" }>,
  ): Promise<PetResult>;
  approvePersona(
    command: Extract<PetCommand, { method: "pet.approvePersona" }>,
  ): Promise<PetResult>;
  petChat(command: Extract<PetCommand, { method: "pet.chat" }>): Promise<PetChatResult>;
}
