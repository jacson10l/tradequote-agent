// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type AgentRun, failure, type RunCommand } from "@tradequote/contracts";
import { mockAgentRun, readonlyMockClient } from "@tradequote/contracts/mock";
import { afterEach, expect, it, vi } from "vitest";
import { AgentRuns } from "./agent-runs";

afterEach(cleanup);
const ok = <T,>(data: T) => ({ ok: true as const, data, warnings: [], evidenceIds: [] });
it("discovers interrupted facts without starting work and retains the control key after a lost retry reply", async () => {
  const user = userEvent.setup();
  let current: AgentRun = {
    ...mockAgentRun,
    status: "interrupted",
    error: failure("CAPABILITY_UNAVAILABLE", "已中断").error,
  };
  const startAgentRun = vi.fn(readonlyMockClient.startAgentRun);
  const retryAgentRun = vi.fn(async (_command: Extract<RunCommand, { method: "agent.retry" }>) => {
    if (retryAgentRun.mock.calls.length === 1) return failure("CAPABILITY_UNAVAILABLE", "连接中断");
    current = {
      ...current,
      status: "completed",
      attempt: 2,
      committedRevisionId: crypto.randomUUID(),
      error: null,
    };
    return ok(current);
  });
  const client = {
    ...readonlyMockClient,
    startAgentRun,
    retryAgentRun,
    listAgentRuns: async () => ok({ runs: [current], nextCursor: null }),
  };
  const onSaved = vi.fn();
  render(<AgentRuns client={client} onSaved={onSaved} refreshToken={false} />);
  const button = await screen.findByRole("button", { name: "重试" });
  expect(startAgentRun).not.toHaveBeenCalled();
  expect(retryAgentRun).not.toHaveBeenCalled();
  await user.click(button);
  expect(await screen.findByRole("alert")).toHaveTextContent("连接中断");
  await user.click(button);
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(retryAgentRun.mock.calls[0]?.[0].idempotencyKey).toBe(
    retryAgentRun.mock.calls[1]?.[0].idempotencyKey,
  );
  expect(retryAgentRun.mock.calls[0]?.[0].requestId).not.toBe(
    retryAgentRun.mock.calls[1]?.[0].requestId,
  );
  expect(startAgentRun).not.toHaveBeenCalled();
});
it("keeps the active second page visible after refreshing loaded history", async () => {
  const user = userEvent.setup();
  const older: AgentRun[] = Array.from({ length: 20 }, () => ({
    ...mockAgentRun,
    runId: crypto.randomUUID(),
    status: "cancelled",
  }));
  const active: AgentRun = { ...mockAgentRun, runId: crypto.randomUUID(), status: "running" };
  const cursor = { createdAt: older[19]!.createdAt, runId: older[19]!.runId };
  const listAgentRuns = vi.fn(async (command: Extract<RunCommand, { method: "agent.list" }>) =>
    ok(
      command.payload.cursor
        ? { runs: [active], nextCursor: null }
        : { runs: older, nextCursor: cursor },
    ),
  );
  const client = { ...readonlyMockClient, listAgentRuns };
  render(<AgentRuns client={client} onSaved={vi.fn()} refreshToken={false} />);
  await user.click(await screen.findByRole("button", { name: "更早的对话" }));
  expect(await screen.findByRole("region", { name: `运行 ${active.runId}` })).toHaveTextContent(
    "运行中",
  );
  await user.click(screen.getByRole("button", { name: "刷新记录" }));
  await waitFor(() => expect(listAgentRuns).toHaveBeenCalledTimes(4));
  expect(screen.getAllByRole("article", { name: "用户消息" })).toHaveLength(21);
  expect(screen.getByRole("button", { name: "停止" })).toBeEnabled();
});

it("does not lose a new-run hint arriving during an in-flight history read", async () => {
  let notify: (s: import("@tradequote/contracts").RunEventsSignal) => void = () => {};
  let release = () => {};
  const run: AgentRun = {
    ...mockAgentRun,
    status: "failed",
    error: failure("MODEL_AUTH_FAILED", "合成失败").error,
  };
  const listAgentRuns = vi.fn(async () => {
    const index = listAgentRuns.mock.calls.length;
    if (index === 2)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    return ok({ runs: index >= 3 ? [run] : [], nextCursor: null });
  });
  const client = {
    ...readonlyMockClient,
    listAgentRuns,
    onAgentRunEvents: (listener: typeof notify) => {
      notify = listener;
      return () => {};
    },
  };
  render(<AgentRuns client={client} onSaved={vi.fn()} refreshToken={false} />);
  await waitFor(() => expect(listAgentRuns).toHaveBeenCalledTimes(1));
  await act(async () => {
    notify({ type: "events.available", runId: run.runId, seq: 1 });
  });
  await waitFor(() => expect(listAgentRuns).toHaveBeenCalledTimes(2));
  await act(async () => {
    notify({ type: "events.available", runId: run.runId, seq: 3 });
    release();
  });
  await waitFor(() => expect(listAgentRuns).toHaveBeenCalledTimes(3));
  expect(await screen.findByRole("region", { name: `运行 ${run.runId}` })).toHaveTextContent(
    "失败",
  );
});

it("separates persisted user messages from assistant replies and closes resolved clarification controls", async () => {
  const parent: AgentRun = {
    ...mockAgentRun,
    status: "resolved",
    clarification: "请确认数量",
    resolvedByRunId: crypto.randomUUID(),
  };
  render(
    <AgentRuns
      client={{
        ...readonlyMockClient,
        listAgentRuns: async () => ok({ runs: [parent], nextCursor: null }),
      }}
      onSaved={vi.fn()}
      refreshToken={false}
      onContinue={vi.fn()}
    />,
  );
  expect(await screen.findByRole("article", { name: "用户消息" })).toHaveTextContent(
    "仅供契约测试，未调用模型",
  );
  expect(screen.getByRole("article", { name: "助手回复" })).toHaveTextContent("已解决");
  expect(screen.queryByRole("button", { name: "补充说明" })).not.toBeInTheDocument();
});
it("follows a focused task beyond the first history page without needing load-more", async () => {
  const target: AgentRun = { ...mockAgentRun, runId: crypto.randomUUID(), status: "running" };
  const client = {
    ...readonlyMockClient,
    listAgentRuns: async () =>
      ok({ runs: [], nextCursor: { createdAt: target.createdAt, runId: crypto.randomUUID() } }),
    getAgentRun: vi.fn(async () => ok(target)),
  };
  const onRun = vi.fn();
  render(
    <AgentRuns
      client={client}
      onSaved={vi.fn()}
      refreshToken={false}
      onRun={onRun}
      focusRunId={target.runId}
    />,
  );
  expect(await screen.findByRole("region", { name: `运行 ${target.runId}` })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "停止" })).toBeEnabled();
  expect(onRun).toHaveBeenCalledWith(target);
});
it("shows verified read facts rather than raw model text containing implementation details", async () => {
  const id = crypto.randomUUID();
  const run: AgentRun = {
    ...mockAgentRun,
    runId: id,
    command: {
      schemaVersion: 1,
      requestId: id,
      idempotencyKey: mockAgentRun.operationKey,
      method: "agent.read",
      payload: { executionMode: "codex_harness", instruction: "查询板材", quoteRevisionIds: [] },
    },
    status: "completed",
    readResult: {
      outcome: "completed",
      workspaceId: id,
      asOf: mockAgentRun.createdAt,
      toolCalls: 0,
      observations: [],
      summary: "sourceStatus synthetic sales-tiers-v1 internal debug output",
    },
  };
  render(
    <AgentRuns
      client={{
        ...readonlyMockClient,
        listAgentRuns: async () => ok({ runs: [run], nextCursor: null }),
      }}
      onSaved={vi.fn()}
      refreshToken={false}
    />,
  );
  expect(await screen.findByRole("article", { name: "助手回复" })).toHaveTextContent(
    "本次未取得查询依据",
  );
  expect(screen.queryByText(/sales-tiers-v1|sourceStatus/)).not.toBeInTheDocument();
});
