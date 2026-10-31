import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type CheckClient,
  type CheckIssue,
  CheckListResultSchema,
  type CheckReport,
  CheckReportSchema,
  CheckResultSchema,
  type QuoteSnapshot,
} from "@tradequote/contracts";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "../shared/button";
import { useMessage } from "../shared/message";

type Field = CheckIssue["fieldPath"];
const fields: Field[] = ["payment", "delivery", "scenario.platform"];
const fieldLabels: Record<Field, string> = {
  payment: "付款条款",
  delivery: "交期与交货条件",
  "scenario.platform": "业务平台与规则覆盖",
};
const severityLabels = { block: "阻断", warning: "提醒", pending: "待核实" };
const severityStyles = {
  block: "text-[var(--danger)]",
  warning: "text-[var(--action)]",
  pending: "text-[var(--text-secondary)]",
};

export const checkQueryKey = (quote: QuoteSnapshot) =>
  ["quote-checks", quote.workspaceId, quote.rootId ?? quote.id, quote.id, quote.version] as const;
const matchesQuote = (report: CheckReport, quote: QuoteSnapshot) =>
  report.revisionId === quote.id &&
  report.quoteId === (quote.rootId ?? quote.id) &&
  report.quoteVersion === quote.version;

export async function loadQuoteChecks(client: CheckClient, quote: QuoteSnapshot) {
  let response: unknown;
  try {
    response = await client.getQuoteChecks({
      schemaVersion: 1,
      requestId: crypto.randomUUID(),
      method: "quote.getChecks",
      payload: { revisionId: quote.id },
    });
  } catch {
    throw new Error("读取检查报告失败，请重试；当前条款仍待核实。");
  }
  const parsed = CheckListResultSchema.safeParse(response);
  if (!parsed.success) throw new Error("检查报告内容无法校验，当前版本仍待核实。");
  const result = parsed.data;
  if (!result.ok)
    throw new Error(
      result.error.code === "CAPABILITY_UNAVAILABLE"
        ? "检查报告暂时无法读取，当前版本的条款仍待核实；请重新读取报告。"
        : result.error.message,
    );
  if (result.data.some((report) => !matchesQuote(report, quote))) {
    throw new Error("检查报告与当前报价版本不一致，已停止展示。");
  }
  if (new Set(result.data.map((item) => item.reportId)).size !== result.data.length) {
    throw new Error("报告列表包含重复标识，请重新读取。");
  }
  return [...result.data].sort(
    (a, b) =>
      Date.parse(b.checkedAt) - Date.parse(a.checkedAt) ||
      (a.reportId < b.reportId ? -1 : a.reportId > b.reportId ? 1 : 0),
  );
}

/** The host persists these reports in AgentRun; validate the same frozen quote identity. */
export function matchingRunReport(quote: QuoteSnapshot, input: unknown): CheckReport | undefined {
  const parsed = CheckReportSchema.safeParse(input);
  return parsed.success && matchesQuote(parsed.data, quote) ? parsed.data : undefined;
}

/** Only the human button writes; rule evaluation and the complete transaction live in the Worker. */
export function QuoteChecks({
  quote,
  client,
  runReport,
}: {
  quote: QuoteSnapshot;
  client: CheckClient;
  runReport?: CheckReport | undefined;
}) {
  const prefix = useId();
  const fieldRefs = useRef<Partial<Record<Field, HTMLElement | null>>>({});
  const [activeIssue, setActiveIssue] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const queries = useQueryClient();
  const message = useMessage();
  const operations = useRef(new Map<string, string>());
  const queryKey = checkQueryKey(quote);
  const identity = JSON.stringify(queryKey);
  const currentIdentity = useRef(identity);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  currentIdentity.current = identity;
  const mutation = useMutation({
    retry: false,
    mutationFn: async ({
      target,
      operationKey,
    }: {
      target: QuoteSnapshot;
      operationKey: string;
    }) => {
      let response: unknown;
      try {
        response = await client.checkQuote({
          schemaVersion: 1,
          requestId: crypto.randomUUID(),
          idempotencyKey: operationKey,
          method: "quote.check",
          payload: { revisionId: target.id },
        });
      } catch {
        throw new Error("检查连接中断，保存结果未知；请重试本次检查或重新读取报告。");
      }
      const parsed = CheckResultSchema.safeParse(response);
      if (!parsed.success) throw new Error("检查结果无法校验，保存结果未知；请重试本次检查。");
      if (!parsed.data.ok) throw new Error(parsed.data.error.message);
      if (!matchesQuote(parsed.data.data, target))
        throw new Error("检查报告与当前报价版本不一致；请重试本次检查。");
      return parsed.data.data;
    },
    onSuccess: async (report, { target }) => {
      const key = checkQueryKey(target);
      const completedIdentity = JSON.stringify(key);
      operations.current.delete(completedIdentity);
      queries.setQueryData<CheckReport[]>(key, (prior) => [
        ...(prior ?? []).filter((r) => r.reportId !== report.reportId),
        report,
      ]);
      if (mounted.current && currentIdentity.current === completedIdentity) {
        setSelectedReport(report.reportId);
        setActiveIssue(null);
        message.success(`V${target.version} 检查报告已保存；报价仍为未审核草稿`);
      }
      await queries.invalidateQueries({ queryKey: key, exact: true });
    },
    onError: (error, { target }) => {
      if (mounted.current && currentIdentity.current === JSON.stringify(checkQueryKey(target)))
        message.error(error.message);
    },
  });
  const checking = mutation.isPending;
  const pendingKey = operations.current.get(identity);
  const query = useQuery({
    queryKey,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      return loadQuoteChecks(client, quote);
    },
  });
  const fromRun = matchingRunReport(quote, runReport);
  const reports = query.isSuccess
    ? query.data.length
      ? query.data
      : fromRun
        ? [fromRun]
        : []
    : [];
  const report = reports.find((item) => item.reportId === selectedReport) ?? reports[0];
  return (
    <section
      className="space-y-4 min-w-0 rounded-lg border border-border bg-card p-4 [overflow-wrap:anywhere]"
      aria-label={`报价 V${quote.version} 规则检查`}
    >
      <div className="section-heading gap-3 flex-wrap">
        <h3>规则检查 · V{quote.version}</h3>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={checking || query.isFetching}
            onClick={() => {
              const operationKey = operations.current.get(identity) ?? crypto.randomUUID();
              operations.current.set(identity, operationKey);
              mutation.mutate({ target: quote, operationKey });
            }}
          >
            {checking ? "正在检查并保存…" : pendingKey ? "重试本次检查" : "检查并保存报告"}
          </Button>
          <Button
            variant="outline"
            disabled={checking || query.isFetching}
            onClick={() => void query.refetch()}
          >
            {query.isFetching ? "正在读取报告…" : "重新读取报告"}
          </Button>
        </div>
      </div>
      <p className="description">
        {fromRun && report?.reportId === fromRun.reportId
          ? "本版本检查已保存，可按需复查。修改报价后需重新检查；检查不代表审批通过。"
          : "人工触发后保存本版本的检查报告；检查不修改报价，也不代表审批通过。"}
      </p>
      {query.isPending && <p role="status">正在读取当前版本的检查报告…</p>}
      {query.isError && (
        <p role="alert" className="error-box">
          {query.error.message}
        </p>
      )}
      {query.isSuccess && !report && <p role="status">当前版本尚无检查报告，条款仍待核实。</p>}
      {report && (
        <>
          <div>
            <label htmlFor={`${prefix}-reports`}>本版本检查报告</label>
            <select
              id={`${prefix}-reports`}
              value={report.reportId}
              onChange={(event) => {
                setSelectedReport(event.target.value);
                setActiveIssue(null);
              }}
            >
              {reports.map((item, index) => (
                <option key={item.reportId} value={item.reportId}>
                  V{item.quoteVersion} · {item.checkedAt}
                  {index === 0 ? " · 最近一次" : " · 历史报告"}
                </option>
              ))}
            </select>
          </div>
          <p className="description">
            检查保存于 · {report.checkedAt} · 仅对应 V{report.quoteVersion}。
            修改条款后需重新检查，旧报告保留原记录。
          </p>
          {report.issues.some((issue) =>
            issue.evidence.some((item) => item.sourceStatus === "synthetic"),
          ) && <p className="sample-note">规则来源未经业务确认，请核实后使用。</p>}
          <div className="flex flex-wrap gap-3 text-sm" aria-label="规则覆盖">
            {report.coverage.map((entry) => (
              <span key={entry.category}>
                {entry.category === "commercial_terms" ? "商务条款" : "平台指引"}：
                {entry.status === "pending" ? "待核实" : `已检查 ${entry.appliedRuleIds.length} 条`}
              </span>
            ))}
          </div>
          {report.wikiCitations && report.wikiCitations.length > 0 && (
            <details>
              <summary>本报告采用的知识与来源 · {report.wikiCitations.length} 个知识段落</summary>
              <p className="description mt-2">
                保留全部已应用规则的来源，包括本次未发现问题的规则；历史引用不代表当前仍有效。
              </p>
              {report.wikiCitations.map((citation) => (
                <div
                  key={`${citation.revisionId}:${citation.sectionId}`}
                  className="mt-3 space-y-1 text-sm"
                >
                  <p>
                    知识版本：<code>{citation.revisionId}</code> · V{citation.version}
                  </p>
                  {citation.sourceRefs.map((ref) => (
                    <p key={ref.referenceId}>
                      来源版本：<code>{ref.sourceRevisionId}</code> · V{ref.sourceVersion} · UTF-16
                      [{ref.location.start}, {ref.location.end}) · SHA-256 {ref.artifactHash}
                    </p>
                  ))}
                </div>
              ))}
            </details>
          )}
          <p role="status">
            {report.issues.filter((issue) => issue.severity === "block").length} 项阻断 ·{" "}
            {report.issues.filter((issue) => issue.severity === "warning").length} 项提醒 ·{" "}
            {report.issues.filter((issue) => issue.severity === "pending").length} 项待核实
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="风险标记">
            {report.issues.map((issue) => (
              <Button
                key={issue.checkId}
                variant="outline"
                className={`h-auto min-h-10 min-w-0 max-w-full justify-start text-left whitespace-normal [overflow-wrap:anywhere] ${severityStyles[issue.severity]} ${activeIssue === issue.checkId ? "bg-[var(--surface-warm)]" : ""}`}
                aria-label={`${severityLabels[issue.severity]} · ${fieldLabels[issue.fieldPath]} · ${issue.message}`}
                aria-pressed={activeIssue === issue.checkId}
                aria-controls={`${prefix}-${issue.fieldPath}`}
                onClick={() => {
                  setActiveIssue(issue.checkId);
                  const target = fieldRefs.current[issue.fieldPath];
                  target?.focus();
                  target?.scrollIntoView?.({ block: "nearest" });
                }}
              >
                {severityLabels[issue.severity]} · {fieldLabels[issue.fieldPath]} · {issue.message}
              </Button>
            ))}
          </div>
          {report.issues.length === 0 && (
            <p role="status">本报告未发现规则问题；仅覆盖已应用规则，仍需人工复核资料与审批。</p>
          )}
        </>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {fields.map((field) => (
          <section
            key={field}
            id={`${prefix}-${field}`}
            tabIndex={-1}
            ref={(element) => {
              fieldRefs.current[field] = element;
            }}
            aria-labelledby={`${prefix}-${field}-label`}
            className={`min-w-0 rounded-lg border border-border p-4 ${field === "scenario.platform" ? "md:col-span-2" : ""}`}
          >
            <h3 id={`${prefix}-${field}-label`}>{fieldLabels[field]}</h3>
            <p className="whitespace-pre-wrap break-words mt-2">
              {field === "scenario.platform"
                ? `${quote.scenario.platform} · ${quote.scenario.market} · ${quote.scenario.category}`
                : quote[field] || "待确认"}
            </p>
            {report?.issues
              .filter((issue) => issue.fieldPath === field)
              .map((issue) => (
                <article
                  key={issue.checkId}
                  aria-label={`${severityLabels[issue.severity]}批注：${issue.message}`}
                  className={`mt-3 min-w-0 border-l-2 pl-3 ${activeIssue === issue.checkId ? "border-[var(--action)]" : "border-border"}`}
                >
                  <p className={severityStyles[issue.severity]}>
                    {severityLabels[issue.severity]} · <span>{issue.message}</span>
                  </p>
                  <p className="mt-1 text-sm">{issue.suggestedAction}</p>
                  <details className="mt-2 text-sm">
                    <summary>{issue.evidence.length ? "查看固定来源" : "查看待核实原因"}</summary>
                    <p className="mt-2">
                      问题标识：<code className="break-all">{issue.checkId}</code>
                    </p>
                    {!issue.evidence.length && <p>尚无适用规则来源，请补齐依据后重新检查。</p>}
                    {issue.evidence.map((evidence, index) => (
                      <div
                        className="mt-3 space-y-1"
                        key={`${evidence.revisionId}:${evidence.ruleId}:${index}`}
                      >
                        <p>
                          {evidence.sourceStatus === "synthetic" ? "合成来源" : "用户提供来源"} ·{" "}
                          {evidence.sourceLabel}
                        </p>
                        <p>
                          知识版本：<code className="break-all">{evidence.revisionId}</code>
                        </p>
                        <p>
                          来源 SHA-256：<code className="break-all">{evidence.sourceHash}</code>
                        </p>
                        <p>
                          原文位置：UTF-16 [{evidence.location.start}, {evidence.location.end})
                        </p>
                        <p className="description">
                          此处为报告保存的来源定位；原文片段与当前有效性需从知识服务核实。
                        </p>
                      </div>
                    ))}
                  </details>
                </article>
              ))}
          </section>
        ))}
      </div>
    </section>
  );
}
