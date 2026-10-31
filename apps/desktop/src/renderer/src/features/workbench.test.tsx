// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type AgentRun, type DesktopClient, failure, success } from "@tradequote/contracts";
import { readonlyMockClient } from "@tradequote/contracts/mock";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { MessageProvider } from "../shared/message";
import { checksQuote } from "./quote-checks.fixture";
import { Workbench } from "./workbench";

afterEach(cleanup);
for (const mode of ["understand", "revise", "switch"] as const) {
  it(`restores ${mode} clarification with its original business context after reload despite older quotes`, async () => {
    const id = "00000000-0000-4000-8000-000000000091";
    const run: AgentRun = {
      runId: id,
      operationKey: id,
      status: "waiting_input",
      attempt: 1,
      createdAt: checksQuote.createdAt,
      updatedAt: checksQuote.createdAt,
      baseRevisionId: mode !== "understand" ? checksQuote.id : null,
      committedRevisionId: null,
      error: null,
      clarification: "请补充付款比例",
      command:
        mode !== "understand"
          ? {
              schemaVersion: 1,
              requestId: id,
              idempotencyKey: id,
              method: "agent.revise",
              payload: {
                executionMode: "codex_harness",
                baseId: checksQuote.id,
                expectedVersion: 1,
                instruction: "修改付款为预付，比例需要确认",
              },
            }
          : {
              schemaVersion: 1,
              requestId: id,
              idempotencyKey: id,
              method: "agent.understand",
              payload: {
                executionMode: "codex_harness",
                scenarioId: checksQuote.scenario.id,
                buyer: "原任务买方",
                inquiry: "DEMO-TEE 100 piece，请确认预付比例",
              },
            },
    };
    const startAgentRun = vi
      .fn()
      .mockResolvedValue({ ok: true, data: run, warnings: [], evidenceIds: [] });
    const client = {
      ...readonlyMockClient,
      startAgentRun,
      continueAgentRun: vi
        .fn()
        .mockResolvedValue({ ok: true, data: run, warnings: [], evidenceIds: [] }),
      getWorkspace: async () =>
        success({
          id: checksQuote.workspaceId,
          name: "合成工作区",
          version: 1,
          createdAt: checksQuote.createdAt,
        }),
      getTrade: async () => ({
        ok: true as const,
        data: {
          scenario: checksQuote.scenario,
          batches: [],
          products: [checksQuote.lines[0]!.product],
          quotes: [
            checksQuote,
            {
              ...checksQuote,
              id: "00000000-0000-4000-8000-000000000092",
              rootId: "00000000-0000-4000-8000-000000000092",
              buyer: "另一个买方",
            },
          ],
          turns: [],
          approvals: [],
        },
        warnings: [],
        evidenceIds: [],
      }),
      listAgentRuns: async () => ({
        ok: true as const,
        data: { runs: [run], nextCursor: null },
        warnings: [],
        evidenceIds: [],
      }),
      getQuoteChecks: async () => failure("CAPABILITY_UNAVAILABLE", "合成未接入检查"),
    };
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={[`/?run=${id}`]}>
          <MessageProvider>
            <Workbench client={client} />
          </MessageProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByText("请补充：请补充付款比例");
    if (mode === "understand")
      expect(await screen.findByLabelText("本次询盘客户")).toHaveValue("原任务买方");
    const user = userEvent.setup();
    if (mode === "switch")
      await user.selectOptions(
        await screen.findByLabelText("选择报价与版本"),
        "00000000-0000-4000-8000-000000000092",
      );
    await user.type(screen.getByLabelText("业务目标或补充说明"), "30%预付");
    await user.click(screen.getByRole("button", { name: "发送" }));
    if (mode !== "switch") {
      expect(startAgentRun).not.toHaveBeenCalled();
      expect(client.continueAgentRun).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "agent.continue",
          payload: { runId: id, supplement: "30%预付" },
        }),
      );
    } else {
      expect(startAgentRun).toHaveBeenCalledOnce();
      expect(startAgentRun.mock.calls[0]![0].payload).toMatchObject({
        method: "agent.revise",
        payload: { instruction: "30%预付", baseId: "00000000-0000-4000-8000-000000000092" },
      });
    }
  });
}

it("locks the workbench while retry IPC is pending and binds the returned run", async () => {
  const id = "00000000-0000-4000-8000-000000000093";
  const run: AgentRun = {
    runId: id,
    operationKey: id,
    status: "failed",
    attempt: 1,
    createdAt: checksQuote.createdAt,
    updatedAt: checksQuote.createdAt,
    baseRevisionId: checksQuote.id,
    committedRevisionId: null,
    error: null,
    clarification: null,
    command: {
      schemaVersion: 1,
      requestId: id,
      idempotencyKey: id,
      method: "agent.revise",
      payload: {
        executionMode: "codex_harness",
        baseId: checksQuote.id,
        expectedVersion: 1,
        instruction: "数量改为500",
      },
    },
  };
  let persistedRun = run;
  let resolveRetry!: (result: Awaited<ReturnType<DesktopClient["retryAgentRun"]>>) => void;
  const retryAgentRun = vi.fn(
    () =>
      new Promise<Awaited<ReturnType<DesktopClient["retryAgentRun"]>>>((resolve) => {
        resolveRetry = resolve;
      }),
  );
  const client: DesktopClient = {
    ...readonlyMockClient,
    retryAgentRun,
    getWorkspace: async () =>
      success({
        id: checksQuote.workspaceId,
        name: "合成工作区",
        version: 1,
        createdAt: checksQuote.createdAt,
      }),
    getTrade: async () => ({
      ok: true,
      warnings: [],
      evidenceIds: [],
      data: {
        scenario: checksQuote.scenario,
        batches: [],
        products: [checksQuote.lines[0]!.product],
        quotes: [checksQuote],
        turns: [],
        approvals: [],
      },
    }),
    listAgentRuns: async () => ({
      ok: true,
      warnings: [],
      evidenceIds: [],
      data: { runs: [persistedRun], nextCursor: null },
    }),
    getQuoteChecks: async () => failure("CAPABILITY_UNAVAILABLE", "合成未接入检查"),
  };
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <MessageProvider>
          <Workbench client={client} />
        </MessageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "重试" }));
  expect(retryAgentRun).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "新建报价任务" })).toBeDisabled();
  expect(screen.getByLabelText("选择报价与版本")).toBeDisabled();
  expect(screen.getByLabelText("业务目标或补充说明")).toBeDisabled();
  persistedRun = { ...run, status: "running", attempt: 2 };
  resolveRetry({ ok: true, data: persistedRun, warnings: [], evidenceIds: [] });
  await screen.findByText("正在处理你的需求…");
  expect(screen.getByRole("button", { name: "新建报价任务" })).toBeDisabled();
});

it("starts read-only work as a durable task and presents business chat without runtime labels", async () => {
  const client = {
    ...readonlyMockClient,
    getWorkspace: async () =>
      success({
        id: checksQuote.workspaceId,
        name: "业务工作区",
        version: 1,
        createdAt: checksQuote.createdAt,
      }),
    getTrade: async () => ({
      ok: true as const,
      data: {
        scenario: checksQuote.scenario,
        batches: [],
        products: [],
        quotes: [checksQuote],
        turns: [],
        approvals: [],
      },
      warnings: [],
      evidenceIds: [],
    }),
    listAgentRuns: async () => ({
      ok: true as const,
      data: { runs: [], nextCursor: null },
      warnings: [],
      evidenceIds: [],
    }),
    startAgentRun: vi.fn(readonlyMockClient.startAgentRun),
    readAgent: vi.fn(readonlyMockClient.readAgent),
  };
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <MessageProvider>
          <Workbench client={client} />
        </MessageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByLabelText("仅查询与试算，不保存报价"));
  await user.type(screen.getByLabelText("业务目标或补充说明"), "查询板材价格");
  await user.click(screen.getByRole("button", { name: "发送" }));
  expect(client.startAgentRun).toHaveBeenCalledWith(
    expect.objectContaining({
      method: "agent.start",
      payload: expect.objectContaining({ method: "agent.read" }),
    }),
  );
  expect(client.readAgent).not.toHaveBeenCalled();
  expect(screen.queryByText(/Codex|harness|本机.*连接|兼容入口/)).not.toBeInTheDocument();
});
it("refreshes the actual quotation when the focused run is beyond the history page", async () => {
  const id = crypto.randomUUID();
  const next = { ...checksQuote, id: crypto.randomUUID(), version: 2, goodsTotal: "1080.00" };
  const run: AgentRun = {
    runId: id,
    operationKey: id,
    status: "completed",
    attempt: 1,
    createdAt: checksQuote.createdAt,
    updatedAt: checksQuote.createdAt,
    baseRevisionId: checksQuote.id,
    committedRevisionId: next.id,
    error: null,
    clarification: null,
    command: {
      schemaVersion: 1,
      requestId: id,
      idempotencyKey: id,
      method: "agent.revise",
      payload: {
        executionMode: "codex_harness",
        baseId: checksQuote.id,
        expectedVersion: 1,
        instruction: "120件",
      },
    },
  };
  let saved = false;
  const board = () => ({
    ok: true as const,
    warnings: [],
    evidenceIds: [],
    data: {
      scenario: checksQuote.scenario,
      batches: [],
      products: [],
      quotes: saved ? [next, checksQuote] : [checksQuote],
      turns: [],
      approvals: [],
    },
  });
  const client = {
    ...readonlyMockClient,
    getWorkspace: async () =>
      success({
        id: checksQuote.workspaceId,
        name: "工作区",
        version: 1,
        createdAt: checksQuote.createdAt,
      }),
    getTrade: vi.fn(async () => board()),
    listAgentRuns: async () => ({
      ok: true as const,
      data: { runs: [], nextCursor: null },
      warnings: [],
      evidenceIds: [],
    }),
    getAgentRun: async () => ({ ok: true as const, data: run, warnings: [], evidenceIds: [] }),
    startAgentRun: vi.fn(async () => {
      saved = true;
      return {
        ok: true as const,
        data: { ...run, status: "queued" as const, committedRevisionId: null },
        warnings: [],
        evidenceIds: [],
      };
    }),
  };
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <MessageProvider>
          <Workbench client={client} />
        </MessageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("业务目标或补充说明"), "120件");
  await user.click(screen.getByRole("button", { name: "发送" }));
  await waitFor(() => expect(screen.getByTestId("goods-total")).toHaveTextContent("1080.00 USD"));
});
