import {
  type AgentRun,
  type AgentToolStep,
  type DesktopClient,
  type RunListQuery,
  type TradeResult,
} from "@tradequote/contracts";
import { useEffect, useRef, useState } from "react";
import { Button } from "../shared/button";

const labels: Record<AgentRun["status"], string> = {
  queued: "排队中",
  running: "运行中",
  waiting_input: "待补充",
  completed: "草稿已保存",
  failed: "失败",
  cancelled: "已取消",
  interrupted: "已中断",
};

const toolLabels: Record<AgentToolStep["tool"], string> = {
  search_catalog: "检索商品",
  get_product_revisions: "读取商品资料",
  get_quote: "读取报价",
  search_knowledge: "读取适用知识",
  calculate_quote: "核价",
  validate_quote: "规则校验",
  create_draft: "保存草稿",
  apply_patch: "保存修订",
};
export function AgentRuns({
  client,
  onSaved,
  refreshToken,
}: {
  client: DesktopClient;
  refreshToken: boolean;
  onSaved: (result: Extract<TradeResult, { ok: true }>) => void;
}) {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [cursor, setCursor] = useState<RunListQuery["cursor"]>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const visiblePages = useRef(1);
  const keys = useRef(new Map<string, string>());
  const saved = useRef(new Set<string>());
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
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
    setRuns((previous) => (next ? [...previous, ...loaded] : loaded));
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
    if (locked.current) return;
    locked.current = true;
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
      await load();
    } catch {
      setError("连接中断，请刷新运行记录后确认当前状态");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4" aria-label="模型运行记录">
      <div className="flex items-center justify-between gap-4">
        <h3>模型运行记录</h3>
        <Button
          type="button"
          disabled={busy}
          onClick={() => {
            void load();
          }}
        >
          刷新运行记录
        </Button>
      </div>
      <p className="description">
        按创建顺序显示，可加载后续记录。重开只读取记录，不会自动调用模型。显式重试会再次发送业务文本，可能产生模型费用；待补充任务请修改输入后新建。
      </p>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {!runs.length && <p>暂无运行记录。</p>}
      {runs.map((run) => (
        <article className="inset space-y-2" key={run.runId} aria-label={`运行 ${run.runId}`}>
          <p>
            {labels[run.status]} · 第 {run.attempt} 次尝试 ·{" "}
            {run.command.method === "agent.understand" ? "询盘理解" : "报价修订"}
          </p>
          <p className="whitespace-pre-wrap">
            {run.command.method === "agent.understand"
              ? run.command.payload.inquiry
              : run.command.payload.instruction}
          </p>
          {run.clarification && <p>请补充：{run.clarification}</p>}
          {run.error && <p>{run.error.message}</p>}
          {run.committedRevisionId && <p>已保存草稿版本：{run.committedRevisionId}</p>}
          {run.toolSteps && run.toolSteps.length > 0 && (
            <details>
              <summary>实际工具步骤（{run.toolSteps.length}）</summary>
              <ol>
                {run.toolSteps.map((step) => (
                  <li key={step.toolCallId}>
                    {step.ordinal} · {toolLabels[step.tool]} ·{" "}
                    {step.ok ? "成功" : `失败：${step.errorCode}`}
                  </li>
                ))}
              </ol>
            </details>
          )}
          {run.validation && (
            <details open>
              <summary>
                {run.validation.kind === "saved_revision"
                  ? "已保存草稿检查（非审批）"
                  : "核价预览检查（未保存）"}
              </summary>
              {run.validation.report.coverage.map((coverage) => (
                <p key={coverage.category}>
                  {coverage.category === "commercial_terms" ? "商业条款" : "平台指引"}：
                  {coverage.status === "pending"
                    ? "缺少适用规则，待确认"
                    : `已执行${coverage.appliedRuleIds.length}条适用规则`}
                </p>
              ))}
              {run.validation.report.issues.map((issue) => (
                <article
                  className="inset space-y-2"
                  key={issue.checkId}
                  aria-label={`规则问题 ${issue.checkId}`}
                >
                  <p>
                    {issue.severity === "block"
                      ? "阻断"
                      : issue.severity === "warning"
                        ? "提醒"
                        : "待确认"}{" "}
                    ·{" "}
                    {issue.fieldPath === "payment"
                      ? "付款"
                      : issue.fieldPath === "delivery"
                        ? "交货"
                        : "平台"}
                    ：{issue.message}
                  </p>
                  <p>{issue.suggestedAction}</p>
                  {issue.evidence.map((source) => (
                    <small
                      className="block break-all"
                      key={`${source.revisionId}:${source.ruleId}`}
                    >
                      {source.sourceStatus === "synthetic" ? "合成来源" : "用户资料"} ·{" "}
                      {source.sourceLabel} · 版本 {source.revisionId} · 原文位置{" "}
                      {source.location.start}–{source.location.end} · SHA-256 {source.sourceHash}
                    </small>
                  ))}
                </article>
              ))}
            </details>
          )}
          {["queued", "running", "waiting_input"].includes(run.status) && (
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                void control(run, "agent.cancel");
              }}
            >
              取消此运行
            </Button>
          )}
          {["failed", "interrupted", "cancelled"].includes(run.status) && (
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                void control(run, "agent.retry");
              }}
            >
              重试此运行（会再次调用模型）
            </Button>
          )}
        </article>
      ))}
      {cursor && (
        <Button
          type="button"
          disabled={busy}
          onClick={() => {
            void load(cursor);
          }}
        >
          加载更多运行
        </Button>
      )}
    </section>
  );
}
