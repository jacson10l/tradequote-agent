// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import {
  type AgentRun,
  failure,
  type RunEventsCommand,
  type RunEventsPage,
} from "@tradequote/contracts";
import { mockAgentRun, readonlyMockClient } from "@tradequote/contracts/mock";
import { afterEach, expect, it, vi } from "vitest";
import { RunEvents } from "./run-events";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("reconnects from accepted seq after a lost page, only reads, and releases timers on unmount", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  const first = {
    schemaVersion: 1 as const,
    eventId: crypto.randomUUID(),
    runId: mockAgentRun.runId,
    seq: 1,
    timestamp: mockAgentRun.createdAt,
    type: "run.updated" as const,
    payload: { status: "queued" as const, attempt: 1, committedRevisionId: null, errorCode: null },
  };
  const run: AgentRun = { ...mockAgentRun, status: "interrupted" };
  const second = {
    ...first,
    eventId: crypto.randomUUID(),
    seq: 2,
    payload: { ...first.payload, status: "interrupted" as const },
  };
  let lost = false;
  const getAgentRunEvents = vi.fn(async (command: RunEventsCommand) => {
    const afterSeq = command.payload.afterSeq;
    if (afterSeq === 1 && !lost) {
      lost = true;
      return failure("CAPABILITY_UNAVAILABLE", "Synthetic lost page");
    }
    const events = afterSeq === 0 ? [first] : afterSeq === 1 ? [second] : [];
    const data: RunEventsPage = {
      run,
      events,
      afterSeq,
      nextSeq: afterSeq + events.length,
      headSeq: 2,
      hasMore: afterSeq + events.length < 2,
    };
    return { ok: true as const, data, warnings: [], evidenceIds: [] };
  });
  const start = vi.fn(readonlyMockClient.startAgentRun),
    retry = vi.fn(readonlyMockClient.retryAgentRun);
  const client = {
    ...readonlyMockClient,
    getAgentRunEvents,
    startAgentRun: start,
    retryAgentRun: retry,
  };
  const rendered = render(
    <RunEvents client={client} runId={run.runId} refreshToken="initial" onRun={vi.fn()} />,
  );
  await screen.findByText(/进度连接中断/);
  expect(screen.getByRole("region", { name: "运行事件" })).toHaveAttribute("data-event-seq", "1");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  await screen.findByText("处理进度已同步");
  expect(getAgentRunEvents.mock.calls.map((c) => c[0].payload.afterSeq)).toEqual([0, 1, 1]);
  expect(screen.getByRole("region", { name: "运行事件" })).toHaveAttribute("data-event-seq", "2");
  const calls = getAgentRunEvents.mock.calls.length;
  rendered.unmount();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6000);
  });
  await waitFor(() => expect(getAgentRunEvents).toHaveBeenCalledTimes(calls));
  expect(start).not.toHaveBeenCalled();
  expect(retry).not.toHaveBeenCalled();
});
