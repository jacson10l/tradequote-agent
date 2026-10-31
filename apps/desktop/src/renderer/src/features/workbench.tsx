import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AgentRun, CheckReport, DesktopClient, TradeResult } from "@tradequote/contracts";
import { FileText, MessageSquare } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "../shared/button";
import { Notification } from "../shared/notification";
import { AgentRuns } from "./agent-runs";
import { CustomerReply } from "./customer-reply";
import { QuoteDifference } from "./quote-agent";
import { QuoteChecks } from "./quote-checks";
import { DraftForm, SavedQuote } from "./quotes";
import { useWorkspace } from "./workspace";

export function Workbench({ client }: { client: DesktopClient }) {
  const workspace = useWorkspace(client);
  const queries = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [fresh, setFresh] = useState(params.get("new") === "1");
  const [buyer, setBuyer] = useState("");
  const [task, setTask] = useState("");
  const [readOnly, setReadOnly] = useState(params.get("read") === "1");
  const [operationBusy, setBusy] = useState(false);
  const [retryPending, setRetryPending] = useState(false);
  const busy = operationBusy || retryPending;
  const [error, setError] = useState("");
  const manualKeys = useRef(new Map<string, string>());
  const [runReports, setRunReports] = useState<Record<string, CheckReport>>({});

  const clarification = useRef("");
  const activeRunId = useRef<string | null>(null);
  const [activeRun, setActiveRun] = useState<AgentRun | null>(null);
  const keys = useRef(new Map<string, string>());
  const query = useQuery({
    queryKey: ["trade"],
    enabled: !!workspace.data,
    queryFn: async () => {
      const result = await client.getTrade();
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
  });
  const board = query.data;
  const executing = !!activeRun && ["queued", "running"].includes(activeRun.status);
  const selected = fresh
    ? undefined
    : (board?.quotes.find((quote) => quote.id === params.get("quote")) ?? board?.quotes[0]);
  const latest =
    selected &&
    board?.quotes
      .filter((q) => (q.rootId ?? q.id) === (selected.rootId ?? selected.id))
      .sort((a, b) => b.version - a.version)[0];
  const onSaved = (result: Extract<TradeResult, { ok: true }>) => {
    queries.setQueryData(["trade"], result.data);
    // Progress replays with no new version must not change the user's selected history.
    const id = result.evidenceIds.find((item) => result.data.quotes.some((q) => q.id === item));
    if (id) {
      setFresh(false);
      setParams({ quote: id });
      clarification.current = "";
    }
    void queries.invalidateQueries({ queryKey: ["trade"] });
  };
  function restoreTask(run: AgentRun) {
    if (busy || executing) return;
    bindTask(run);
  }
  function bindTask(run: AgentRun) {
    activeRunId.current = run.runId;
    setActiveRun(run);
    setReadOnly(run.command.method === "agent.read");
    if (run.command.method === "agent.understand") {
      setFresh(true);
      setBuyer(run.command.payload.buyer);
      clarification.current = run.command.payload.inquiry;
      setParams({ new: "1", run: run.runId });
    } else if (run.command.method === "agent.read") {
      setFresh(!run.command.payload.quoteRevisionIds[0]);
      clarification.current = run.command.payload.instruction;
      setParams({
        ...(run.command.payload.quoteRevisionIds[0]
          ? { quote: run.command.payload.quoteRevisionIds[0] }
          : { new: "1" }),
        run: run.runId,
        read: "1",
      });
    } else {
      setFresh(false);
      clarification.current = run.command.payload.instruction;
      setParams({ quote: run.command.payload.baseId, run: run.runId });
    }
  }
  async function submit() {
    if (busy || executing || !task.trim() || !board) return;
    setBusy(true);
    setError("");
    try {
      if (!readOnly && !board.scenario) {
        setError("请先在资料与报价保存业务场景并发布商品资料。");
        return;
      }
      if (!readOnly && !selected && !buyer.trim()) {
        setError("请填写本次询盘客户。");
        return;
      }
      const inquiry = clarification.current ? `${clarification.current}\n用户补充：${task}` : task;
      const operation = readOnly
        ? {
            method: "agent.read" as const,
            payload: {
              executionMode: "codex_harness" as const,
              instruction: task,
              quoteRevisionIds: selected ? [selected.id] : [],
            },
          }
        : selected
          ? {
              method: "agent.revise" as const,
              payload: {
                executionMode: "codex_harness" as const,
                baseId: selected.id,
                expectedVersion: selected.version,
                instruction: inquiry,
              },
            }
          : {
              method: "agent.understand" as const,
              payload: {
                executionMode: "codex_harness" as const,
                scenarioId: board.scenario!.id,
                buyer,
                inquiry,
              },
            };
      const continuing =
        activeRun?.status === "waiting_input" && activeRun.command.method === operation.method;
      const fingerprint = JSON.stringify(
        continuing ? { runId: activeRun.runId, supplement: task } : operation,
      );
      const key = keys.current.get(fingerprint) ?? crypto.randomUUID();
      keys.current.set(fingerprint, key);
      const common = {
        schemaVersion: 1 as const,
        requestId: crypto.randomUUID(),
        idempotencyKey: key,
      };
      const result = continuing
        ? await client.continueAgentRun({
            ...common,
            method: "agent.continue",
            payload: { runId: activeRun.runId, supplement: task },
          })
        : await client.startAgentRun({ ...common, method: "agent.start", payload: operation });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setParams((before) => {
        const next = new URLSearchParams(before);
        next.set("run", result.data.runId);
        return next;
      });
      activeRunId.current = result.data.runId;
      setActiveRun(result.data);
      clarification.current = inquiry;
      setTask("");
    } catch {
      setError("连接中断，结果未知；请读取下方运行记录，确认后显式重试。");
    } finally {
      setBusy(false);
    }
  }
  const failed = workspace.isError ? workspace : query.isError ? query : null;
  return (
    <>
      <h1 className="sr-only">单据工作台</h1>
      {failed && (
        <Notification
          title="工作台读取失败"
          description={failed.error?.message ?? "连接失败"}
          action={{
            label: "重新加载",
            onClick: () => void failed.refetch(),
            pending: failed.isFetching,
          }}
        />
      )}
      <div className="workbench-grid">
        <section className="panel document space-y-4" aria-label="当前报价单据">
          <div className="section-heading">
            <h2 className="flex items-center gap-2">
              <FileText size={18} />
              当前报价
            </h2>
            <Button
              variant="outline"
              disabled={busy || executing}
              onClick={() => {
                setFresh(true);
                setParams({ new: "1" });
                clarification.current = "";
                activeRunId.current = null;
                setActiveRun(null);
              }}
            >
              新建报价任务
            </Button>
          </div>
          {selected && (
            <>
              <label htmlFor="workbench-quote">选择报价与版本</label>
              <select
                id="workbench-quote"
                disabled={busy || executing}
                value={selected.id}
                onChange={(event) => {
                  activeRunId.current = null;
                  clarification.current = "";
                  setActiveRun(null);
                  setFresh(false);
                  setParams({ quote: event.target.value });
                }}
              >
                {board?.quotes.map((quote) => (
                  <option key={quote.id} value={quote.id}>
                    {quote.buyer} · V{quote.version} · {quote.createdAt}
                  </option>
                ))}
              </select>
            </>
          )}
          {activeRun?.status === "running" && activeRun.calculationPreview && (
            <section aria-label="当前核价预览">
              <h3>核价预览 · 尚未保存</h3>
              <p>
                {activeRun.calculationPreview.goodsTotal ?? "未知"}{" "}
                {activeRun.calculationPreview.currency} · 商品合计，未含运税费
              </p>
              {activeRun.calculationPreview.lines.map((line) => (
                <p key={line.product.id}>
                  {line.product.sku} · {line.quantity} {line.product.unit} · {line.amount ?? "未知"}{" "}
                  · 来源 {line.product.sourceName}
                </p>
              ))}
            </section>
          )}
          {selected ? (
            <>
              <SavedQuote quote={selected} />
              <QuoteChecks
                key={selected.id}
                quote={selected}
                client={client}
                runReport={runReports[selected.id]}
              />
              <QuoteDifference
                key={`diff-${selected.id}`}
                quote={selected}
                quotes={board?.quotes ?? []}
              />
              <details>
                <summary>本版本回复草稿 · 未审核</summary>
                <CustomerReply
                  key={selected.id}
                  quote={selected}
                  client={client}
                  runReport={runReports[selected.id]}
                />
              </details>
            </>
          ) : (
            <div className="empty-state">
              <FileText size={30} />
              <h2>从一份询盘开始</h2>
              <p>在右侧描述你的需求， 查询商品、核价并整理报价。结果与待确认事项会显示在这里。</p>
              {workspace.data ? (
                <Link to="/quotes">导入或管理商品资料</Link>
              ) : (
                <Button asChild>
                  <Link to="/workspace">创建工作区</Link>
                </Button>
              )}
            </div>
          )}
          {board && (
            <details>
              <summary>手工填写报价</summary>
              <DraftForm
                board={board}
                busy={busy || executing}
                onSave={async (payload) => {
                  const fingerprint = JSON.stringify(payload);
                  const key = manualKeys.current.get(fingerprint) ?? crypto.randomUUID();
                  manualKeys.current.set(fingerprint, key);
                  setBusy(true);
                  try {
                    const result = await client.createQuoteV1({
                      schemaVersion: 1,
                      requestId: crypto.randomUUID(),
                      idempotencyKey: key,
                      method: "quote.createV1",
                      payload,
                    });
                    if (result.ok) onSaved(result);
                    else setError(result.error.message);
                  } catch {
                    setError("保存结果未知，请刷新运行记录与报价");
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </details>
          )}
          <Link to="/quotes">查询历史报价与资料来源</Link>
        </section>
        <aside className="agent-panel space-y-4" aria-label="工作台任务对话">
          <div className="section-heading">
            <h2 className="flex items-center gap-2">
              <MessageSquare size={18} />
              任务对话
            </h2>
          </div>
          <div className="workbench-conversation">
            {workspace.data ? (
              <AgentRuns
                client={client}
                refreshToken={busy}
                focusRunId={activeRun?.runId}
                onSaved={onSaved}
                onContinue={restoreTask}
                onRetryPending={setRetryPending}
                onRetryStarted={bindTask}
                continueDisabled={busy || executing}
                onRun={(run) => {
                  if (run.status === "completed" && run.validation?.kind === "saved_revision") {
                    const report = run.validation.report;
                    setRunReports((before) =>
                      before[report.revisionId]?.reportId === report.reportId
                        ? before
                        : { ...before, [report.revisionId]: report },
                    );
                  }
                  if (!activeRunId.current && run.runId === params.get("run")) {
                    activeRunId.current = run.runId;
                    if (run.status === "waiting_input") restoreTask(run);
                  }
                  if (run.runId !== activeRunId.current) return;
                  setActiveRun(run);
                  if (run.committedRevisionId) {
                    void queries.invalidateQueries({ queryKey: ["trade"] });
                    activeRunId.current = null;
                    setFresh(false);
                    setParams({ quote: run.committedRevisionId });
                    clarification.current = "";
                  }
                }}
              />
            ) : (
              <p className="description">创建工作区后即可开始处理询盘。</p>
            )}
          </div>
          <form
            className="workbench-composer space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={readOnly}
                disabled={busy || executing}
                onChange={(event) => setReadOnly(event.target.checked)}
              />
              仅查询与试算，不保存报价
            </label>
            {!selected && !readOnly && (
              <>
                <label htmlFor="workbench-buyer">本次询盘客户</label>
                <input
                  id="workbench-buyer"
                  value={buyer}
                  maxLength={200}
                  required
                  disabled={busy}
                  onChange={(event) => setBuyer(event.target.value)}
                />
              </>
            )}
            <label htmlFor="workbench-task">业务目标或补充说明</label>
            <textarea
              id="workbench-task"
              rows={4}
              maxLength={8000}
              required
              disabled={busy || executing}
              value={task}
              onChange={(event) => setTask(event.target.value)}
              placeholder={
                selected
                  ? "数量改为500，比较变化；付款和交期仍待确认。"
                  : "根据这条询盘帮我报价：商品、数量、单位……"
              }
            />
            <Button
              className="w-full"
              disabled={
                busy ||
                executing ||
                !task.trim() ||
                !workspace.data ||
                !board ||
                (!readOnly && !!selected && latest?.id !== selected.id)
              }
            >
              发送
            </Button>
            {selected && latest?.id !== selected.id && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setParams({ quote: latest?.id ?? "" })}
              >
                打开最新版本继续处理
              </Button>
            )}
            {busy && <p role="status">{readOnly ? "正在查询与试算…" : "正在处理…"}</p>}
            {error && (
              <p role="alert" className="error-box">
                {error}
              </p>
            )}
          </form>
        </aside>
      </div>
    </>
  );
}
