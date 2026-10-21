// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
  const button = await screen.findByRole("button", { name: "重试此运行（会再次调用模型）" });
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
  await user.click(await screen.findByRole("button", { name: "加载更多运行" }));
  expect(await screen.findByRole("article", { name: `运行 ${active.runId}` })).toHaveTextContent(
    "运行中",
  );
  await user.click(screen.getByRole("button", { name: "刷新运行记录" }));
  await waitFor(() => expect(listAgentRuns).toHaveBeenCalledTimes(4));
  expect(screen.getAllByRole("article")).toHaveLength(21);
  expect(screen.getByRole("button", { name: "取消此运行" })).toBeEnabled();
});
