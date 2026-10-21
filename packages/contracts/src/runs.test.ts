import { describe, expect, it } from "vitest";
import {
  AgentCommandSchema,
  AgentRunSchema,
  failure,
  RunCommandSchema,
  RunListQuerySchema,
  RunListResultSchema,
  RunResultSchema,
  RuntimeCommandSchema,
  WorkerRequestSchema,
} from "./index";
import { mockAgentRun as run } from "./mock";

const start = {
  schemaVersion: 1,
  requestId: run.runId,
  idempotencyKey: run.operationKey,
  method: "agent.start",
  payload: { method: run.command.method, payload: run.command.payload },
};
describe("B00 run recovery boundary", () => {
  it("reuses executable inputs without a second envelope or credentials", () => {
    expect(RunCommandSchema.safeParse(start).success).toBe(true);
    expect(AgentCommandSchema.safeParse(run.command).success).toBe(true);
    for (const invalid of [
      { ...start, credentials: { key: "synthetic", model: "test" } },
      { ...start, actorId: "admin" },
      { ...start, payload: run.command },
      { ...start, payload: { ...start.payload, idempotencyKey: run.runId } },
      { ...start, payload: { method: "quote.check", payload: { revisionId: run.runId } } },
      {
        ...start,
        payload: { ...start.payload, payload: { ...start.payload.payload, amount: "0" } },
      },
    ])
      expect(RunCommandSchema.safeParse(invalid).success).toBe(false);
    // C02c routes these strict contracts through Main/worker.
    expect(RuntimeCommandSchema.safeParse(start).success).toBe(true);
    expect(WorkerRequestSchema.safeParse({ id: run.runId, command: start }).success).toBe(true);
  });
  it("keeps control action keys separate from the stored business operation key", () => {
    for (const method of ["agent.cancel", "agent.retry"]) {
      const command = {
        ...start,
        method,
        idempotencyKey: run.runId,
        payload: { runId: run.runId },
      };
      expect(RunCommandSchema.safeParse(command).success).toBe(true);
      expect(
        RunCommandSchema.safeParse({
          ...command,
          payload: { ...command.payload, operationKey: run.runId },
        }).success,
      ).toBe(false);
      expect(
        RunCommandSchema.safeParse({
          ...command,
          payload: { ...command.payload, status: "completed" },
        }).success,
      ).toBe(false);
      const { idempotencyKey: _key, ...noKey } = command;
      expect(RunCommandSchema.safeParse(noKey).success).toBe(false);
      expect(RunCommandSchema.safeParse({ ...noKey, method: "agent.get" }).success).toBe(true);
      expect(RunCommandSchema.safeParse({ ...command, method: "agent.get" }).success).toBe(false);
    }
  });
  it("rejects incoherent persisted runs and never loses a completed commit", () => {
    for (const status of ["queued", "running", "interrupted", "cancelled"])
      expect(AgentRunSchema.safeParse({ ...run, status }).success).toBe(true);
    const error = failure("CAPABILITY_UNAVAILABLE", "合成失败").error;
    expect(AgentRunSchema.safeParse({ ...run, status: "failed", error }).success).toBe(true);
    expect(
      AgentRunSchema.safeParse({ ...run, status: "completed", committedRevisionId: run.runId })
        .success,
    ).toBe(true);
    for (const invalid of [
      { ...run, operationKey: run.runId },
      { ...run, baseRevisionId: run.runId },
      { ...run, attempt: 0 },
      { ...run, updatedAt: "2020-01-01T00:00:00.000Z" },
      { ...run, status: "completed" },
      { ...run, status: "failed" },
      { ...run, status: "cancelled", committedRevisionId: run.runId },
      { ...run, error },
      { ...run, command: { ...run.command, credentials: { key: "synthetic" } } },
    ])
      expect(AgentRunSchema.safeParse(invalid).success).toBe(false);
    const revised = {
      ...run,
      baseRevisionId: run.runId,
      command: {
        ...run.command,
        method: "agent.revise",
        payload: {
          baseId: run.runId,
          expectedVersion: 1,
          instruction: "合成修改交期",
        },
      },
    };
    expect(AgentRunSchema.safeParse(revised).success).toBe(true);
    expect(AgentRunSchema.safeParse({ ...revised, baseRevisionId: null }).success).toBe(false);
    expect(
      RunResultSchema.safeParse({ ok: true, data: run, warnings: [], evidenceIds: [] }).success,
    ).toBe(true);
    expect(RunResultSchema.safeParse(failure("IDEMPOTENCY_CONFLICT", "同键异参")).success).toBe(
      true,
    );
  });
});

it("persists clarification only while waiting and bounds discovery across executable IPC", () => {
  expect(
    AgentRunSchema.safeParse({ ...run, status: "waiting_input", clarification: "请补充数量" })
      .success,
  ).toBe(true);
  for (const invalid of [
    { ...run, status: "waiting_input" },
    { ...run, clarification: "问题" },
    { ...run, status: "waiting_input", clarification: " " },
    { ...run, status: "waiting_input", clarification: "字".repeat(2001) },
  ])
    expect(AgentRunSchema.safeParse(invalid).success).toBe(false);
  expect(RunListQuerySchema.parse({})).toEqual({ limit: 20 });
  for (const invalid of [
    { limit: 0 },
    { limit: 101 },
    { workspaceId: run.runId },
    { cursor: { createdAt: run.createdAt } },
  ])
    expect(RunListQuerySchema.safeParse(invalid).success).toBe(false);
  const list = { schemaVersion: 1, requestId: run.runId, method: "agent.list", payload: {} };
  expect(RunCommandSchema.safeParse(list).success).toBe(true);
  expect(RuntimeCommandSchema.safeParse(list).success).toBe(true);
  expect(
    RunListResultSchema.safeParse({
      ok: true,
      data: { runs: [run], nextCursor: null },
      warnings: [],
      evidenceIds: [],
    }).success,
  ).toBe(true);
});
