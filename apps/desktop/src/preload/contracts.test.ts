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

const electron = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}));
vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: {
    invoke: electron.invoke,
    on: electron.on,
    removeListener: electron.removeListener,
  },
}));
const read = { schemaVersion: 1 as const, requestId: mockAgentRun.runId };
const write = { ...read, idempotencyKey: mockAgentRun.operationKey };
describe("B00 read-only mock and formal preload capability gate", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });
  it("keeps knowledge/check services unavailable; mock run methods stay unavailable", async () => {
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
      RunCommandSchema.parse({ ...read, method: "agent.list", payload: { limit: 20 } }),
      RunCommandSchema.parse({
        ...write,
        method: "agent.retry",
        payload: { runId: mockAgentRun.runId },
      }),
    ];
    for (const client of [readonlyMockClient, desktop]) {
      for (const command of commands) {
        if (client === desktop && command.method.startsWith("agent.")) continue;
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
  it("validates and forwards durable run methods and rejects malformed replies", async () => {
    await import("./index");
    const desktop: DesktopClient = electron.exposeInMainWorld.mock.calls[0]?.[1];
    electron.invoke.mockResolvedValue({
      ok: true,
      data: mockAgentRun,
      warnings: [],
      evidenceIds: [],
    });
    const command = RunCommandSchema.parse({
      ...write,
      method: "agent.start",
      payload: { method: mockAgentRun.command.method, payload: mockAgentRun.command.payload },
    });
    if (command.method !== "agent.start") throw new Error("fixture");
    expect(await desktop.startAgentRun(command)).toMatchObject({ ok: true });
    expect(electron.invoke).toHaveBeenCalledWith("agent.start", command);
    electron.invoke.mockResolvedValue({
      ok: true,
      data: { runs: [mockAgentRun], nextCursor: null },
      warnings: [],
      evidenceIds: [],
    });
    expect(
      await desktop.listAgentRuns({ ...read, method: "agent.list", payload: { limit: 20 } }),
    ).toMatchObject({ ok: true });
    electron.invoke.mockResolvedValue({ ok: true, data: { approved: true } });
    expect(
      await desktop.getAgentRun({
        ...read,
        method: "agent.get",
        payload: { runId: mockAgentRun.runId },
      }),
    ).toMatchObject({ ok: false });
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

describe("C04 exact desktop evaluation gate", () => {
  it("validates the full command locally and does not send credentials, endpoints or unconfirmed paid starts", async () => {
    vi.resetModules();
    vi.clearAllMocks();
    await import("./index");
    const desktop: DesktopClient = electron.exposeInMainWorld.mock.calls[0]?.[1];
    const command = {
      schemaVersion: 1 as const,
      requestId: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
      method: "modelEvaluation.start" as const,
      payload: {
        mode: "deepseek" as const,
        model: "synthetic-model",
        confirmedPaid: true as const,
      },
    };
    for (const bad of [
      Object.assign({}, command, { credentials: { key: "injected" } }),
      Object.assign({}, command, { endpoint: "https://invalid.example" }),
      { ...command, payload: { ...command.payload, confirmedPaid: false } },
      Object.assign({}, command, { method: "modelEvaluation.fake" }),
    ])
      expect(await desktop.modelEvaluation(bad as never)).toMatchObject({
        ok: false,
        error: { code: "VALIDATION_ERROR" },
      });
    expect(electron.invoke).not.toHaveBeenCalled();
    electron.invoke.mockResolvedValue({
      ok: true,
      data: { kind: "runs", canStart: true, runs: [] },
      warnings: [],
      evidenceIds: [],
    });
    expect(await desktop.modelEvaluation(command)).toMatchObject({
      ok: true,
      data: { kind: "runs" },
    });
    expect(electron.invoke).toHaveBeenCalledWith("modelEvaluation.start", command);
    electron.invoke.mockResolvedValue({
      ok: true,
      data: { kind: "runs", canStart: true, runs: [], key: "injected" },
      warnings: [],
      evidenceIds: [],
    });
    expect(await desktop.modelEvaluation(command)).toMatchObject({
      ok: false,
      error: { code: "CAPABILITY_UNAVAILABLE" },
    });
  });
});

it("validates event scope, rejects credential injection, and releases notification listeners", async () => {
  vi.stubGlobal("window", new EventTarget());
  try {
    vi.resetModules();
    vi.clearAllMocks();
    await import("./index");
    const desktop: DesktopClient = electron.exposeInMainWorld.mock.calls[0]?.[1];
    const command = {
      schemaVersion: 1 as const,
      requestId: crypto.randomUUID(),
      method: "agent.events" as const,
      payload: { runId: mockAgentRun.runId, afterSeq: 0, limit: 20 },
    };
    const data = {
      run: mockAgentRun,
      events: [],
      afterSeq: 0,
      nextSeq: 0,
      headSeq: 0,
      hasMore: false,
    };
    electron.invoke.mockResolvedValue({ ok: true, data, warnings: [], evidenceIds: [] });
    expect(await desktop.getAgentRunEvents(command)).toMatchObject({ ok: true });
    electron.invoke.mockResolvedValue({
      ok: true,
      data: { ...data, run: { ...mockAgentRun, runId: crypto.randomUUID() } },
      warnings: [],
      evidenceIds: [],
    });
    expect(await desktop.getAgentRunEvents(command)).toMatchObject({
      ok: false,
      error: { code: "STORAGE_ERROR" },
    });
    const calls = electron.invoke.mock.calls.length;
    const invalid = await Reflect.apply(desktop.getAgentRunEvents, undefined, [
      { ...command, payload: { ...command.payload, key: "synthetic" } },
    ]);
    expect(invalid).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(electron.invoke).toHaveBeenCalledTimes(calls);
    const receive = vi.fn(),
      dispose = desktop.onAgentRunEvents(receive);
    const callback = electron.on.mock.calls[0]?.[1];
    callback({}, { type: "events.available", runId: mockAgentRun.runId, seq: 1, raw: "synthetic" });
    expect(receive).not.toHaveBeenCalled();
    callback({}, { type: "events.available", runId: mockAgentRun.runId, seq: 1 });
    expect(receive).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("unload"));
    dispose();
    expect(electron.removeListener).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllGlobals();
  }
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
