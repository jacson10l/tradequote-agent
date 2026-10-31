import {
  type AgentRun,
  type DesktopClient,
  type RunListQuery,
  type TradeResult,
} from "@tradequote/contracts";
import { useEffect, useRef, useState } from "react";
import { Button } from "../shared/button";
import { ReadObservation, ReadSummary } from "./read-assistant";
import { RunEvents } from "./run-events";
import { toolLabels } from "./run-tool-labels";

const labels: Record<AgentRun["status"], string> = {
  resolved: "已解决",
  queued: "排队中",
  running: "运行中",
  waiting_input: "待补充",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
  interrupted: "已中断",
};

export function AgentRuns({
  client,
  onSaved,
  refreshToken,
  onRun,
  onContinue,
  onRetryPending,
  onRetryStarted,
  continueDisabled = false,
  focusRunId,
}: {
  client: DesktopClient;
  onRun?: (run: AgentRun) => void;
  onContinue?: (run: AgentRun) => void;
  onRetryPending?: (pending: boolean) => void;
  onRetryStarted?: (run: AgentRun) => void;
  continueDisabled?: boolean;
  focusRunId?: string | undefined;
  refreshToken: boolean;
  onSaved: (result: Extract<TradeResult, { ok: true }>) => void;
}) {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [cursor, setCursor] = useState<RunListQuery["cursor"]>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [signals, setSignals] = useState<Record<string, number>>({});
  const [connection, setConnection] = useState(0);
  const locked = useRef(false);
  const visiblePages = useRef(1);
  const end = useRef<HTMLDivElement>(null);
  const latest = runs.at(-1);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "nearest" });
  }, [runs.length, latest?.status, latest?.attempt]);
  const keys = useRef(new Map<string, string>());
  const saved = useRef(new Set<string>());
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;
  const known = useRef(new Map<string, AgentRun>());
  function accept(incoming: AgentRun[]) {
    for (const run of incoming) {
      const prior = known.current.get(run.runId);
      if (
        prior &&
        (prior.attempt > run.attempt ||
          Date.parse(prior.updatedAt) > Date.parse(run.updatedAt) ||
          (prior.attempt === run.attempt &&
            !["queued", "running"].includes(prior.status) &&
            ["queued", "running"].includes(run.status)) ||
          (prior.status === "resolved" && run.status !== "resolved"))
      )
        continue;
      known.current.set(run.runId, run);
      onRunRef.current?.(run);
    }
    setRuns(
      [...known.current.values()].sort(
        (a, b) => a.createdAt.localeCompare(b.createdAt) || a.runId.localeCompare(b.runId),
      ),
    );
  }
  async function follow(runId: string) {
    const result = await client.getAgentRun({
      ...envelope(),
      method: "agent.get",
      payload: { runId },
    });
    if (result.ok && result.data.runId === runId) accept([result.data]);
  }
  useEffect(() => {
    if (focusRunId) void follow(focusRunId);
  }, [client, focusRunId]);
  const envelope = () => ({ schemaVersion: 1 as const, requestId: crypto.randomUUID() });
  async function load(next?: RunListQuery["cursor"]) {
    const pages = next ? 1 : visiblePages.current;
    const loaded: AgentRun[] = [];
    let position = next;
    for (let page = 0; page < pages; page++) {
      const result = await client.listAgentRuns({
        ...envelope(),
        method: "agent.list",
        payload: { limit: 20, ...(position ? { cursor: position } : {}) },
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      loaded.push(...result.data.runs);
      position = result.data.nextCursor ?? undefined;
      if (!position) break;
    }
    if (next) visiblePages.current++;
    setError("");
    accept(loaded);
    setCursor(position);
    const completed = loaded.filter(
      (run) => run.committedRevisionId && !saved.current.has(run.committedRevisionId),
    );
    if (completed.length) {
      const board = await client.getTrade();
      if (board.ok) {
        for (const run of completed)
          if (run.committedRevisionId) saved.current.add(run.committedRevisionId);
        onSavedRef.current(board);
      }
    }
  }
  useEffect(() => {
    let reading = false,
      dirty = false,
      closed = false;
    const refresh = async () => {
      if (reading) {
        dirty = true;
        return;
      }
      reading = true;
      try {
        do {
          dirty = false;
          await load();
        } while (dirty && !closed);
      } catch {
        if (!closed) setError("进度连接中断，将只读恢复运行记录");
      } finally {
        reading = false;
      }
    };
    const dispose = client.onAgentRunEvents((signal) => {
      if (closed) return;
      if (signal.type === "events.connection") setConnection((n) => n + 1);
      else {
        setSignals((before) => ({ ...before, [signal.runId]: signal.seq }));
        void follow(signal.runId);
      }
      void refresh();
    });
    return () => {
      closed = true;
      dispose();
    };
  }, [client]);
  // Mount discovers persisted facts. Poll only the visible active page; no start/retry.
  useEffect(() => {
    void load();
  }, [client, refreshToken]);
  useEffect(() => {
    if (!runs.some((run) => run.status === "queued" || run.status === "running")) return;
    const timer = setInterval(() => {
      void load();
    }, 1500);
    return () => clearInterval(timer);
  }, [client, runs]);
  async function control(run: AgentRun, method: "agent.cancel" | "agent.retry") {
    if (locked.current || (method === "agent.retry" && continueDisabled)) return;
    locked.current = true;
    if (method === "agent.retry") onRetryPending?.(true);
    setBusy(true);
    setError("");
    const identity = `${run.runId}:${run.attempt}:${method}`;
    const key = keys.current.get(identity) ?? crypto.randomUUID();
    keys.current.set(identity, key);
    try {
      const command = { ...envelope(), idempotencyKey: key, method, payload: { runId: run.runId } };
      const result =
        method === "agent.cancel"
          ? await client.cancelAgentRun({ ...command, method })
          : await client.retryAgentRun({ ...command, method });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      if (method === "agent.retry") (onRetryStarted ?? onContinue)?.(result.data);
      await load();
    } catch {
      setError("连接中断，请刷新运行记录后确认当前状态");
    } finally {
      locked.current = false;
      if (method === "agent.retry") onRetryPending?.(false);
      setBusy(false);
    }
  }
  return (
    <section className="conversation-feed" aria-label="任务记录">
      <div className="conversation-toolbar">
        <span>最近对话</span>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => {
            void load();
          }}
        >
          刷新记录
        </Button>
      </div>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {!runs.length && (
        <div className="conversation-empty">
          <h3>今天要处理哪份询盘？</h3>
          <p>描述需求，或粘贴客户询盘。</p>
        </div>
      )}
      {runs.map((run) => (
        <section className="conversation-turn" key={run.runId} aria-label={`运行 ${run.runId}`}>
          <article className="chat-message chat-user" aria-label="用户消息">
            <span className="chat-role">你</span>
            <p>
              {run.continuationMessage ??
                (run.command.method === "agent.understand"
                  ? run.command.payload.inquiry
                  : run.command.payload.instruction)}
            </p>
          </article>
          <article className="chat-message chat-assistant" aria-label="助手回复">
            <div className="chat-message-heading">
              <span className="chat-role">报价助手</span>
              <span className="chat-status">{labels[run.status]}</span>
            </div>
            {run.clarification && <p>请补充：{run.clarification}</p>}
            {run.status === "resolved" && <p className="description">已根据补充内容处理此问题。</p>}
            {run.status === "running" && (
              <p role="status">
                {run.toolSteps?.at(-1)
                  ? `${toolLabels[run.toolSteps.at(-1)!.tool]}已完成，正在继续处理…`
                  : "正在处理你的需求…"}
              </p>
            )}
            {run.status === "queued" && <p role="status">正在准备…</p>}
            {run.error && <p>{run.error.message}</p>}
            {run.status === "cancelled" && <p>已停止，当前报价保持不变。</p>}
            {run.status === "completed" && run.command.method !== "agent.read" && (
              <p>
                已保存
                {run.validation?.kind === "saved_revision"
                  ? `为 V${run.validation.report.quoteVersion}`
                  : "报价草稿"}
                ，请在左侧核对报价和待确认事项。
              </p>
            )}
            {run.status === "completed" && run.readResult?.outcome === "completed" && (
              <ReadSummary result={run.readResult} />
            )}
            {run.readResult && (
              <details className="chat-evidence">
                <summary>查询结果与金额依据</summary>
                <p>本次查询未修改报价。</p>
                {run.readResult.observations.map((observation, index) => (
                  <ReadObservation key={`${index}-${observation.tool}`} observation={observation} />
                ))}
              </details>
            )}
            {run.status === "waiting_input" && onContinue && (
              <Button
                type="button"
                variant="outline"
                disabled={continueDisabled}
                onClick={() => onContinue(run)}
              >
                补充说明
              </Button>
            )}
            <div className="chat-actions">
              {["queued", "running", "waiting_input"].includes(run.status) && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    void control(run, "agent.cancel");
                  }}
                >
                  停止
                </Button>
              )}
              {["failed", "interrupted", "cancelled"].includes(run.status) && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || continueDisabled}
                  onClick={() => {
                    void control(run, "agent.retry");
                  }}
                >
                  重试
                </Button>
              )}
            </div>
            <details className="chat-evidence">
              <summary>
                处理记录{run.toolSteps?.length ? ` · ${run.toolSteps.length} 项` : ""}
              </summary>
              <p>第 {run.attempt} 次处理</p>
              {run.toolSteps && (
                <ol>
                  {run.toolSteps.map((step) => (
                    <li key={step.toolCallId}>
                      {toolLabels[step.tool]} · {step.ok ? "完成" : "未完成"}
                    </li>
                  ))}
                </ol>
              )}
              {run.status !== "completed" &&
                run.readObservations?.map((observation, index) => (
                  <ReadObservation key={`${index}-${observation.tool}`} observation={observation} />
                ))}
              {run.validation && (
                <section aria-label="报价检查依据">
                  <p>
                    {run.validation.kind === "saved_revision"
                      ? "已保存报价检查"
                      : "核价检查 · 未保存"}
                  </p>
                  {run.validation.report.issues.map((issue) => (
                    <div key={issue.checkId}>
                      <p>{issue.message}</p>
                      <p>{issue.suggestedAction}</p>
                      {issue.evidence.map((source) => (
                        <p key={`${source.ruleId}:${source.revisionId}`}>
                          来源 {source.sourceLabel} · {source.revisionId} · {source.sourceHash}
                        </p>
                      ))}
                    </div>
                  ))}
                </section>
              )}
              <RunEvents
                client={client}
                runId={run.runId}
                refreshToken={`${run.updatedAt}:${signals[run.runId] ?? 0}:${connection}`}
                onRun={(next) => {
                  accept([next]);
                  if (next.committedRevisionId && !saved.current.has(next.committedRevisionId))
                    void load();
                }}
              />
            </details>
          </article>
        </section>
      ))}
      <div ref={end} />
      {cursor && (
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => {
            void load(cursor);
          }}
        >
          更早的对话
        </Button>
      )}
    </section>
  );
}
