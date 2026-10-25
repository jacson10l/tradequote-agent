import { expect, it } from "vitest";
import {
  AgentReadCommandSchema,
  AgentReadDataSchema,
  AgentReadResultSchema,
  failure,
  RuntimeCommandSchema,
  WorkerReplySchema,
  WorkerRequestSchema,
} from "./index";

const randomUUID = () => crypto.randomUUID();

const command = () => ({
  schemaVersion: 1,
  requestId: randomUUID(),
  method: "agent.read",
  payload: { instruction: "读取商品并计算预览", quoteRevisionIds: [] },
});
const data = () => ({
  workspaceId: randomUUID(),
  asOf: "2026-10-21T00:00:00.000Z",
  outcome: "completed",
  summary: "未保存报价",
  toolCalls: 0,
  observations: [],
});

it("shares the read command and result through runtime/worker boundaries", () => {
  const input = command();
  expect(RuntimeCommandSchema.parse(input)).toEqual(AgentReadCommandSchema.parse(input));
  expect(
    WorkerRequestSchema.parse({
      id: randomUUID(),
      command: input,
      credentials: { key: "synthetic-key", model: "synthetic-model" },
    }).command.method,
  ).toBe("agent.read");
  const result = { ok: true, data: data(), warnings: [], evidenceIds: [] };
  expect(AgentReadResultSchema.parse(result)).toEqual(result);
  expect(WorkerReplySchema.parse({ id: randomUUID(), result }).result).toEqual(result);
});
it("rejects renderer-controlled workspace, clock, tool set, credentials and write envelope", () => {
  for (const extra of [
    { workspaceId: randomUUID() },
    { asOf: "2000-01-01T00:00:00Z" },
    { tools: ["approve_quote"] },
    { credentials: { key: "synthetic-key" } },
  ])
    expect(
      AgentReadCommandSchema.safeParse({
        ...command(),
        payload: { ...command().payload, ...extra },
      }).success,
    ).toBe(false);
  expect(
    AgentReadCommandSchema.safeParse({ ...command(), idempotencyKey: randomUUID() }).success,
  ).toBe(false);
});
it("bounds and deduplicates read selections and task text", () => {
  const id = randomUUID();
  for (const payload of [
    { instruction: " ", quoteRevisionIds: [] },
    { instruction: "x".repeat(8001), quoteRevisionIds: [] },
    { instruction: "读取", quoteRevisionIds: [id, id] },
    { instruction: "读取", quoteRevisionIds: Array.from({ length: 51 }, () => randomUUID()) },
    { instruction: "读取", quoteRevisionIds: [], productIds: [id, id] },
  ])
    expect(AgentReadCommandSchema.safeParse({ ...command(), payload }).success).toBe(false);
});
it("accepts public failures as observations while rejecting unavailable tools and false write facts", () => {
  const result = failure("NOT_FOUND", "未找到授权报价");
  expect(
    AgentReadDataSchema.parse({
      ...data(),
      toolCalls: 1,
      observations: [{ tool: "get_quote", result }],
    }).observations,
  ).toHaveLength(1);
  for (const tool of ["search_knowledge", "validate_quote", "approve_quote"])
    expect(
      AgentReadDataSchema.safeParse({ ...data(), toolCalls: 1, observations: [{ tool, result }] })
        .success,
    ).toBe(false);
  for (const extra of [{ committedRevisionId: randomUUID() }, { approved: true }])
    expect(AgentReadDataSchema.safeParse({ ...data(), ...extra }).success).toBe(false);
  expect(AgentReadDataSchema.safeParse({ ...data(), toolCalls: 1 }).success).toBe(false);
});
it("keeps clarification text distinct from a completed summary", () => {
  const value = {
    workspaceId: randomUUID(),
    asOf: "2026-10-21T00:00:00.000Z",
    outcome: "waiting_input",
    clarification: "请确认商品单位",
    toolCalls: 0,
    observations: [],
  };
  expect(AgentReadDataSchema.parse(value)).toEqual(value);
  expect(AgentReadDataSchema.safeParse({ ...value, clarification: "" }).success).toBe(false);
});
