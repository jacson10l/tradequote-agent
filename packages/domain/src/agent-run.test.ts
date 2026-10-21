import { expect, it } from "vitest";
import { transitionAgentRun } from "./index";

it("cancelling before commit prevents completion; completed runs keep their fact on cancel/retry", () => {
  const running = transitionAgentRun("queued", "begin");
  const cancelled = transitionAgentRun(running, "cancel");
  expect(cancelled).toBe("cancelled");
  expect(() => transitionAgentRun(cancelled, "commit")).toThrow("不允许 commit");
  expect(transitionAgentRun(cancelled, "cancel")).toBe("cancelled");
  const completed = transitionAgentRun(running, "commit");
  expect(transitionAgentRun(completed, "cancel")).toBe("completed");
  expect(transitionAgentRun(completed, "retry")).toBe("completed");
  expect(() => transitionAgentRun(completed, "begin")).toThrow("不允许 begin");
});

it("interrupts only unfinished work and requires explicit retry before execution", () => {
  for (const active of ["queued", "running"] as const) {
    const interrupted = transitionAgentRun(active, "interrupt");
    expect(interrupted).toBe("interrupted");
    expect(() => transitionAgentRun(interrupted, "begin")).toThrow("不允许 begin");
    expect(transitionAgentRun(transitionAgentRun(interrupted, "retry"), "begin")).toBe("running");
  }
  for (const action of ["fail", "cancel"] as const) {
    const terminal = transitionAgentRun("running", action);
    expect(transitionAgentRun(terminal, "retry")).toBe("queued");
  }
  expect(() => transitionAgentRun("running", "retry")).toThrow("不允许 retry");
  expect(() => transitionAgentRun("queued", "commit")).toThrow("不允许 commit");
});

it("requires a new operation for changed input instead of retrying a clarification", () => {
  const waiting = transitionAgentRun("running", "wait_for_input");
  expect(waiting).toBe("waiting_input");
  expect(() => transitionAgentRun(waiting, "retry")).toThrow("不允许 retry");
  expect(() => transitionAgentRun(waiting, "commit")).toThrow("不允许 commit");
  expect(transitionAgentRun(waiting, "cancel")).toBe("cancelled");
});
