import {
  CheckCommandSchema,
  type DesktopClient,
  KnowledgeCommandSchema,
  RunCommandSchema,
} from "@tradequote/contracts";
import {
  mockAgentRun,
  mockKnowledgeRevision,
  readonlyMockClient,
} from "@tradequote/contracts/mock";
import { beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => ({ exposeInMainWorld: vi.fn(), invoke: vi.fn() }));
vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: { invoke: electron.invoke },
}));
const read = { schemaVersion: 1 as const, requestId: mockAgentRun.runId };
const write = { ...read, idempotencyKey: mockAgentRun.operationKey };
describe("B00 read-only mock and formal preload capability gate", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });
  it("keeps the ten B00 methods unavailable without sending their IPC or returning fake writes", async () => {
    await import("./index");
    const desktop: DesktopClient = electron.exposeInMainWorld.mock.calls[0]?.[1];
    expect(desktop).toBeDefined();
    const revisionId = mockKnowledgeRevision.revisionId;
    const commands = [
      KnowledgeCommandSchema.parse({
        ...write,
        method: "knowledge.stage",
        payload: {
          ...mockKnowledgeRevision.content,
          documentId: mockKnowledgeRevision.documentId,
          expectedVersion: 0,
        },
      }),
      KnowledgeCommandSchema.parse({
        ...write,
        method: "knowledge.publish",
        payload: { revisionId, sourceHash: mockKnowledgeRevision.sourceHash },
      }),
      KnowledgeCommandSchema.parse({
        ...read,
        method: "knowledge.query",
        payload: {
          scope: { platform: "RFQ", market: "Brazil", category: "板材" },
          at: mockAgentRun.createdAt,
        },
      }),
      KnowledgeCommandSchema.parse({
        ...read,
        method: "knowledge.getRevision",
        payload: { revisionId },
      }),
      CheckCommandSchema.parse({ ...write, method: "quote.check", payload: { revisionId } }),
      CheckCommandSchema.parse({ ...read, method: "quote.getChecks", payload: { revisionId } }),
      RunCommandSchema.parse({
        ...write,
        method: "agent.start",
        payload: { method: mockAgentRun.command.method, payload: mockAgentRun.command.payload },
      }),
      RunCommandSchema.parse({
        ...read,
        method: "agent.get",
        payload: { runId: mockAgentRun.runId },
      }),
      RunCommandSchema.parse({
        ...write,
        method: "agent.cancel",
        payload: { runId: mockAgentRun.runId },
      }),
      RunCommandSchema.parse({ ...read, method: "agent.list", payload: {} }),
      RunCommandSchema.parse({
        ...write,
        method: "agent.retry",
        payload: { runId: mockAgentRun.runId },
      }),
    ];
    for (const client of [readonlyMockClient, desktop]) {
      for (const command of commands) {
        const result =
          command.method === "knowledge.stage"
            ? await client.stageKnowledge(command)
            : command.method === "knowledge.publish"
              ? await client.publishKnowledge(command)
              : command.method === "knowledge.query"
                ? await client.queryKnowledge(command)
                : command.method === "knowledge.getRevision"
                  ? await client.getKnowledgeRevision(command)
                  : command.method === "quote.check"
                    ? await client.checkQuote(command)
                    : command.method === "quote.getChecks"
                      ? await client.getQuoteChecks(command)
                      : command.method === "agent.start"
                        ? await client.startAgentRun(command)
                        : command.method === "agent.get"
                          ? await client.getAgentRun(command)
                          : command.method === "agent.cancel"
                            ? await client.cancelAgentRun(command)
                            : command.method === "agent.retry"
                              ? await client.retryAgentRun(command)
                              : await client.listAgentRuns(command);
        expect(result).toMatchObject({
          ok: false,
          error: { code: "CAPABILITY_UNAVAILABLE", retryable: false },
        });
      }
      expect(
        await client.getAgentRun({ ...read, method: "agent.get", payload: { runId: "bad" } }),
      ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    }
    expect(electron.invoke).not.toHaveBeenCalled();
  });
  it("exposes only the strict agent.read command and validates its reply", async () => {
    await import("./index");
    const desktop: DesktopClient = electron.exposeInMainWorld.mock.calls[0]?.[1];
    const command = {
      ...read,
      method: "agent.read" as const,
      payload: { instruction: "只读查询", quoteRevisionIds: [] },
    };
    electron.invoke.mockResolvedValue({
      ok: true,
      data: {
        workspaceId: mockAgentRun.runId,
        asOf: mockAgentRun.createdAt,
        outcome: "completed",
        summary: "未保存报价",
        toolCalls: 0,
        observations: [],
      },
      warnings: [],
      evidenceIds: [],
    });
    expect(await desktop.readAgent(command)).toMatchObject({ ok: true });
    expect(electron.invoke).toHaveBeenCalledWith("agent.read", command);
    const invalid = {
      ...command,
      payload: { ...command.payload, workspaceId: mockAgentRun.runId },
    };
    expect(await desktop.readAgent(invalid)).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
    expect(electron.invoke).toHaveBeenCalledTimes(1);
    electron.invoke.mockResolvedValue({ ok: true, data: { approved: true } });
    expect(await desktop.readAgent(command)).toMatchObject({
      ok: false,
      error: { code: "CAPABILITY_UNAVAILABLE" },
    });
    expect(await readonlyMockClient.readAgent(command)).toMatchObject({
      ok: false,
      error: { code: "CAPABILITY_UNAVAILABLE" },
    });
  });
});
