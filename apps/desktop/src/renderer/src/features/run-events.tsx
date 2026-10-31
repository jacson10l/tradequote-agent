import { type AgentRun, type DesktopClient, type RunEvent } from "@tradequote/contracts";
import { useEffect, useRef, useState } from "react";
import { RunEventFeed } from "./run-event-feed";
import { toolLabels } from "./run-tool-labels";

const stateLabels: Record<AgentRun["status"], string> = {
  queued: "任务已排队",
  running: "正在处理",
  waiting_input: "等待补充事实",
  completed: "草稿已保存",
  failed: "任务失败",
  cancelled: "已取消",
  interrupted: "运行中断，等待显式重试",
};
function label(event: RunEvent) {
  if (event.type === "run.updated")
    return `${stateLabels[event.payload.status]} · 第${event.payload.attempt}次尝试`;
  if (event.type === "tool.completed")
    return `${Object.entries(toolLabels).find(([name]) => name === event.payload.toolName)?.[1] ?? "业务工具"} · ${event.payload.ok ? "完成" : "失败"}`;
  return event.type;
}
export function RunEvents({
  client,
  runId,
  refreshToken,
  onRun,
}: {
  client: DesktopClient;
  runId: string;
  refreshToken: string;
  onRun: (run: AgentRun) => void;
}) {
  const [view, setView] = useState({ events: [] as RunEvent[], seq: 0, ready: false, error: "" });
  const pump = useRef<() => void>(() => {});
  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;
  useEffect(() => {
    const feed = new RunEventFeed(runId);
    let closed = false,
      inFlight = false,
      dirty = false;
    const sync = async () => {
      if (closed) return;
      if (inFlight) {
        dirty = true;
        return;
      }
      inFlight = true;
      try {
        // Yield after bounded pages. A later signal/timer resumes from accepted seq.
        for (let pages = 0; pages < 20 && !closed; pages++) {
          dirty = false;
          const result = await client.getAgentRunEvents({
            schemaVersion: 1,
            requestId: crypto.randomUUID(),
            method: "agent.events",
            payload: { runId, afterSeq: feed.seq, limit: 5 },
          });
          if (closed) return;
          if (!result.ok) throw Error("EVENT_READ_FAILED");
          if (feed.accept(result.data)) onRunRef.current(result.data.run);
          setView({ events: [...feed.events], seq: feed.seq, ready: true, error: "" });
          if (!result.data.hasMore && !dirty) break;
        }
      } catch {
        if (!closed)
          setView((previous) => ({
            ...previous,
            error: "进度连接中断，正在只读补齐记录；不会重新运行模型。",
          }));
      } finally {
        inFlight = false;
      }
    };
    pump.current = () => {
      void sync();
    };
    void sync();
    const timer = setInterval(() => {
      void sync();
    }, 2000);
    const resume = () => {
      if (document.visibilityState !== "hidden") void sync();
    };
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      closed = true;
      clearInterval(timer);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
      pump.current = () => {};
    };
  }, [client, runId]);
  useEffect(() => {
    pump.current();
  }, [refreshToken]);
  return (
    <section aria-label="运行事件" data-event-seq={view.seq} className="space-y-2">
      {view.error ? (
        <p role="status">{view.error}</p>
      ) : (
        <p className="description">
          {view.ready
            ? view.seq
              ? "运行进度已同步"
              : "该历史运行没有事件记录，当前状态已回读。"
            : "正在回读运行进度"}
        </p>
      )}
      {view.events.length > 0 && (
        <details>
          <summary>持久运行记录（最近{view.events.length}条）</summary>
          <ol>
            {view.events.map((event) => (
              <li key={event.eventId} data-event-id={event.eventId} data-event-seq={event.seq}>
                {label(event)}
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
