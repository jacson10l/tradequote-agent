import type { RunStatusSchema } from "@tradequote/contracts";
import { TradeFault } from "./trade";

type RunStatus = ReturnType<typeof RunStatusSchema.parse>;
export type AgentRunAction =
  | "begin"
  | "commit"
  | "fail"
  | "wait_for_input"
  | "cancel"
  | "interrupt"
  | "retry";

const transitions: Record<RunStatus, Partial<Record<AgentRunAction, RunStatus>>> = {
  queued: { begin: "running", cancel: "cancelled", interrupt: "interrupted" },
  running: {
    commit: "completed",
    fail: "failed",
    wait_for_input: "waiting_input",
    cancel: "cancelled",
    interrupt: "interrupted",
  },
  waiting_input: { cancel: "cancelled" },
  completed: { cancel: "completed", retry: "completed" },
  failed: { retry: "queued" },
  cancelled: { cancel: "cancelled", retry: "queued" },
  interrupted: { retry: "queued" },
};

// The caller must apply commit and its revision reference in the same transaction.
// This pure transition does not execute, persist, increment attempts or retry a model.
export function transitionAgentRun(status: RunStatus, action: AgentRunAction): RunStatus {
  const next = transitions[status][action];
  if (!next) throw new TradeFault("ACTION_NOT_ALLOWED", `运行状态 ${status} 不允许 ${action}`);
  return next;
}
