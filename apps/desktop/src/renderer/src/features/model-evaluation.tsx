import {
  type DesktopClient,
  type EvaluationRow,
  type ModelEvaluationCommand,
  type ModelEvaluationRun,
} from "@tradequote/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../shared/button";

const labels = {
  running: "运行中",
  completed: "评估结束",
  cancelled: "已取消",
  interrupted: "已中断",
  failed: "执行失败",
};
const results = { passed: "通过", failed: "不通过", not_run: "未运行", cancelled: "已取消" };
const reasons = {
  observed: "已观测",
  credentials_not_provided: "未配置凭据",
  fixture_only: "仅在合成模式验证",
  prior_step_failed: "前置样本未通过",
  evaluation_error: "评估执行异常",
  cancelled: "本轮已取消",
  provider_unavailable: "模型连接不可用，后续未运行",
};
const checks: Record<string, string> = {
  outcome: "结果",
  revision_count: "版本数",
  draft_only: "草稿",
  quantity: "数量",
  unit: "单位",
  product: "商品",
  terms: "条款",
  amount: "金额",
  sources: "来源",
  validation: "校验",
  immutable_history: "历史不变",
  single_dispatch: "请求次数",
  no_late_write: "无迟到写入",
};
function rowLabel(row: EvaluationRow) {
  if (row.kind === "semantic")
    return `${row.category === "apparel" ? "服装" : row.category === "panel" ? "板材" : "紧固件"} · ${row.language} · ${row.id.split("-").at(-1)?.toUpperCase()}`;
  if (row.kind === "clarification") return `缺事实澄清 · ${row.language}`;
  if (row.kind === "rule_block") return "规则阻断";
  return row.id;
}
export function ModelEvaluationPanel({
  client,
  hasKey,
  savedModel,
  configDirty,
}: {
  client: DesktopClient;
  hasKey: boolean;
  savedModel: string;
  configDirty: boolean;
}) {
  const [runs, setRuns] = useState<ModelEvaluationRun[]>([]);
  const [canStart, setCanStart] = useState(true);
  const [selected, setSelected] = useState("");
  const [mode, setMode] = useState<"fixture" | "deepseek">("fixture");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const mounted = useRef(true);
  const pending = useRef<Extract<
    ModelEvaluationCommand,
    { method: "modelEvaluation.start" }
  > | null>(null);
  const refresh = useCallback(async () => {
    try {
      const result = await client.modelEvaluation({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        method: "modelEvaluation.list",
        payload: {},
      });
      if (!mounted.current) return;
      if (result.ok && result.data.kind === "runs") {
        setRuns(result.data.runs);
        setCanStart(result.data.canStart);
      } else if (!result.ok) setError(result.error.message);
    } catch {
      if (mounted.current) setError("无法读取评估历史；不会自动重新调用模型。");
    }
  }, [client]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);
  const running = runs.some((r) => r.status === "running");
  useEffect(() => {
    if (!running && canStart) return;
    const timer = setInterval(() => void refresh(), 1000);
    return () => clearInterval(timer);
  }, [running, canStart, refresh]);
  useEffect(() => {
    setConsent(false);
    pending.current = null;
  }, [mode, savedModel, configDirty]);
  const run = runs.find((r) => r.runId === selected) ?? runs[0];
  async function execute(command: ModelEvaluationCommand) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await client.modelEvaluation(command);
      if (!mounted.current) return;
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      if (result.data.kind === "runs") {
        setRuns(result.data.runs);
        setCanStart(result.data.canStart);
        if (command.method === "modelEvaluation.start") {
          setSelected(result.data.runs[0]?.runId ?? "");
          pending.current = null;
          setConsent(false);
        }
      } else if (result.data.kind === "saved") {
        setNotice(result.data.saved ? "脱敏报告已保存。" : "已取消保存脱敏报告。");
      } else {
        setError("请使用正式桌面报告保存入口");
      }
    } catch {
      if (mounted.current) setError("评估连接中断，请刷新历史核对；不会自动重新调用模型。");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  function start() {
    const command = pending.current ?? {
      schemaVersion: 1 as const,
      requestId: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
      method: "modelEvaluation.start" as const,
      payload:
        mode === "fixture"
          ? { mode: "fixture" as const }
          : { mode: "deepseek" as const, model: savedModel, confirmedPaid: true as const },
    };
    pending.current = command;
    void execute(command);
  }
  return (
    <section className="panel space-y-4" aria-label="C04 模型评估">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2>模型评估与脱敏报告</h2>
        <Button variant="outline" disabled={busy} onClick={() => void refresh()}>
          刷新评估历史
        </Button>
      </div>
      <p className="description">
        仅使用合成商品、询盘和规则，隔离临时报价。报告不含
        Key、询盘原文、模型回答或完整错误。不会修改当前工作区。
      </p>
      <label htmlFor="evaluation-mode">评估模式</label>
      <select
        id="evaluation-mode"
        value={mode}
        disabled={busy || running}
        onChange={(e) => setMode(e.target.value as "fixture" | "deepseek")}
      >
        <option value="fixture">合成 fixture（不请求 DeepSeek）</option>
        <option value="deepseek">真实 DeepSeek（使用已保存配置）</option>
      </select>
      {mode === "deepseek" ? (
        <>
          <p className="sample-note">
            已保存模型：{savedModel || "未配置"}。31 个业务检查点，最多 372 次模型请求，整轮最长 10
            分钟。会产生费用；token 和费用暂未知。鉴权、限流或网络故障会停止本轮，不自动重试。
          </p>
          {(!hasKey || configDirty) && <p>请先保存 API Key 和当前模型设置。</p>}
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={consent}
              disabled={busy || running}
              onChange={(e) => setConsent(e.target.checked)}
            />
            我确认使用已保存模型发起真实评估，并知悉可能计费
          </label>
        </>
      ) : (
        <p className="sample-note">48 个合成检查点；fixture 通过不能证明真实模型语义通过。</p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={
            busy ||
            running ||
            !canStart ||
            (mode === "deepseek" && (!hasKey || configDirty || !consent))
          }
          onClick={start}
        >
          {mode === "fixture" ? "运行合成评估" : "开始真实 DeepSeek 评估（可能计费）"}
        </Button>
        {run?.status === "running" && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void execute({
                schemaVersion: 1,
                requestId: crypto.randomUUID(),
                method: "modelEvaluation.cancel",
                idempotencyKey: crypto.randomUUID(),
                payload: { runId: run.runId },
              })
            }
          >
            取消本次评估
          </Button>
        )}
      </div>
      <p className="description">
        启动后使用当时的凭据快照；更改或清除设置不会代替取消。退出应用会停止进程，重开仅回读历史，不会重新计费。
      </p>
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {runs.length === 0 ? (
        <p>尚无评估记录，请显式选择模式后启动。</p>
      ) : (
        <>
          <label htmlFor="evaluation-history">评估历史（最近20次）</label>
          <select
            id="evaluation-history"
            value={run?.runId ?? ""}
            onChange={(e) => setSelected(e.target.value)}
          >
            {runs.map((r) => (
              <option key={r.runId} value={r.runId}>
                {new Date(r.startedAt).toLocaleString("zh-CN", { hour12: false })} ·{" "}
                {r.mode === "fixture" ? "fixture 合成" : "真实 DeepSeek"} · {labels[r.status]}
              </option>
            ))}
          </select>
          {run && (
            <article className="space-y-3" aria-label="评估结果">
              <p role="status">
                {run.mode === "fixture" ? "fixture 合成结果" : "真实 DeepSeek 结果"} ·{" "}
                {labels[run.status]}
                {run.report
                  ? ` · 检查${results[run.report.status]}`
                  : ` · 已记录 ${run.observedRows} / 48 项`}
              </p>
              {run.transport === "http_fixture" && (
                <p className="sample-note">
                  当前为隔离 HTTP 测试传输，结果标记 fixture，不代表真实 DeepSeek 验收。
                </p>
              )}
              {run.errorCode && (
                <p>执行状态：{run.errorCode}。需要再次验证时，请显式启动新评估。</p>
              )}
              {run.report && (
                <>
                  <p>
                    模型：{run.report.model ?? "未配置"} · 请求 {run.report.modelCalls} 次 ·
                    真实请求 {run.report.realRequests} 次 · token / 费用：未知
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {(["json", "markdown"] as const).map((format) => (
                      <Button
                        key={format}
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          void execute({
                            schemaVersion: 1,
                            requestId: crypto.randomUUID(),
                            method: "modelEvaluation.export",
                            payload: { runId: run.runId, format },
                          })
                        }
                      >
                        下载脱敏 {format === "json" ? "JSON" : "Markdown"}
                      </Button>
                    ))}
                  </div>
                  <details>
                    <summary>查看检查明细（{run.report.rows.length}项）</summary>
                    <div className="overflow-x-auto">
                      <table aria-label="模型评估检查明细">
                        <thead>
                          <tr>
                            <th>样本</th>
                            <th>结果</th>
                            <th>公开错误码 / 未运行原因</th>
                            <th>不符合项</th>
                          </tr>
                        </thead>
                        <tbody>
                          {run.report.rows.map((row) => (
                            <tr key={row.id}>
                              <td>{rowLabel(row)}</td>
                              <td>{results[row.status]}</td>
                              <td>
                                {row.errorCode ??
                                  (row.status === "not_run" ? reasons[row.reason] : "—")}
                              </td>
                              <td>
                                {row.checks
                                  .filter((c) => !c.passed)
                                  .map((c) => checks[c.id])
                                  .join("、") || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </>
              )}
            </article>
          )}
        </>
      )}
    </section>
  );
}
