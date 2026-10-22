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
  it("implements all public methods without exposing new IPC or returning fake successful writes", async () => {
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
                            : await client.retryAgentRun(command);
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
});

describe("B00a strict Wiki capability gate", () => {
  it("rejects all 12 valid Wiki methods locally in formal preload and readonly mock", async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const { mockWikiCommands } = await import("@tradequote/contracts/mock");
    await import("./index");
    const desktop: DesktopClient = electron.exposeInMainWorld.mock.calls[0]?.[1];
    for (const client of [readonlyMockClient, desktop]) {
      for (const command of mockWikiCommands) {
        expect(await client.executeWiki(command), command.method).toMatchObject({
          ok: false,
          error: { code: "CAPABILITY_UNAVAILABLE", retryable: false },
        });
        expect(await client.executeWiki(Object.assign({}, command, { payload: {} }))).toMatchObject(
          {
            ok: false,
            error: { code: "VALIDATION_ERROR", retryable: false },
          },
        );
        expect(
          await client.executeWiki(
            Object.assign({}, command, { workspaceId: mockAgentRun.runId, origin: "human_ui" }),
          ),
        ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
      }
      expect(
        await client.executeWiki(Object.assign({}, mockWikiCommands[0], { method: "wiki.fake" })),
      ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    }
    expect(electron.invoke).not.toHaveBeenCalled();
  });
});
