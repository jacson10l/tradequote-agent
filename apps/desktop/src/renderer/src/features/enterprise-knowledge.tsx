import type {
  DesktopClient,
  KnowledgeLintReport,
  WikiCommand,
  WikiRevisionRecord,
  WikiSourceRevision,
} from "@tradequote/contracts";
import { useState } from "react";
import { Button } from "../shared/button";

const common = () => ({
  schemaVersion: 1 as const,
  requestId: crypto.randomUUID(),
  idempotencyKey: crypto.randomUUID(),
});
const builtin = () => import("../../../../../../wiki-project/demo_data/catalog_converted.csv?raw");
const stateLabels = {
  candidate: "待审核",
  approved: "已批准",
  published: "已发布",
  rejected: "已拒绝",
  withdrawn: "已撤回",
};
export function EnterpriseKnowledgePanel({
  client,
  sources,
  records,
  onRefresh,
}: {
  client: DesktopClient;
  sources: WikiSourceRevision[];
  records: WikiRevisionRecord[];
  onRefresh: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [label, setLabel] = useState(""),
    [text, setText] = useState(""),
    [synthetic, setSynthetic] = useState(false),
    [sourceId, setSourceId] = useState(""),
    [recordId, setRecordId] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [lint, setLint] = useState<KnowledgeLintReport | null>(null);
  const [kind, setKind] = useState<"sop" | "term" | "rule">("sop"),
    [locale, setLocale] = useState("en"),
    [category, setCategory] = useState(""),
    [market, setMarket] = useState(""),
    [platform, setPlatform] = useState("");
  const record = records.find((r) => r.revision.revisionId === recordId),
    source = sources.find((s) => s.sourceRevisionId === sourceId);
  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setMessage("");
    try {
      setMessage(await action());
      await onRefresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "操作未完成，请刷新核对后重试");
    } finally {
      setBusy(false);
    }
  };
  const wiki = async (command: WikiCommand) => {
    const result = await client.executeWiki(command);
    if (!result.ok) throw new Error(result.error.message);
    return result.data;
  };
  const binding = record
    ? {
        revisionId: record.revision.revisionId,
        contentHash: record.revision.contentHash,
        sourceSetHash: record.revision.sourceSetHash,
      }
    : null;
  const importCsv = (csv: string, name: string) =>
    run(async () => {
      const r = await client.executeKnowledgeDesktop({
        ...common(),
        method: "knowledge.importCatalog",
        payload: { label: name, csv },
      });
      if (!r.ok) throw new Error(r.error.message);
      return r.data.kind === "imported"
        ? `${r.data.reused ? "该内容已导入" : "已导入"}：${r.data.records}个商品知识候选；原始声明待核实，未发布。`
        : "已导入";
    });
  return (
    <details className="panel enterprise-editor">
      <summary>企业资料录入、LLM 整理与人工审核</summary>
      <fieldset disabled={busy}>
        <p className="description">
          CSV导入仅建立来源与知识候选；不会自动发布价格或确认认证。合成资料始终保留演示标识。
        </p>
        <div className="kg-toolbar">
          <Button
            variant="outline"
            onClick={() =>
              void run(async () => {
                const r = await client.executeKnowledgeDesktop({
                  ...common(),
                  method: "knowledge.seedDemo",
                  payload: {},
                });
                if (!r.ok) throw new Error(r.error.message);
                return "合成演示企业资料已加入，待审核；重复点击不新增副本。";
              })
            }
          >
            添加合成演示企业资料
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              void builtin()
                .then((m) => importCsv(m.default, "catalog_converted.csv"))
                .catch(() => setMessage("项目CSV无法读取"))
            }
          >
            导入项目商品 CSV
          </Button>
          <label>
            选择本地 CSV
            <input
              aria-label="导入本地CSV"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void f.text().then((t) => importCsv(t, f.name));
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <div className="enterprise-columns">
          <section>
            <h2>录入企业原文</h2>
            <label>
              资料名称
              <input value={label} onChange={(e) => setLabel(e.target.value)} />
            </label>
            <label>
              原文
              <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} />
            </label>
            <label>
              <input
                type="checkbox"
                checked={synthetic}
                onChange={(e) => setSynthetic(e.target.checked)}
              />
              这是合成演示资料
            </label>
            <Button
              disabled={!label.trim() || !text.trim()}
              onClick={() =>
                void run(async () => {
                  const r = await wiki({
                    ...common(),
                    method: "source.stage",
                    payload: {
                      sourceId: crypto.randomUUID(),
                      expectedVersion: 0,
                      label,
                      mediaType: "text/plain",
                      sourceText: text,
                      sourceStatus: synthetic ? "synthetic" : "user_provided",
                      sourceUri: null,
                      acquiredAt: new Date().toISOString(),
                      permissionNote: synthetic
                        ? "用户录入合成演示资料"
                        : "用户通过本地入口主动录入，供本工作区整理；真实性待审核",
                      validity: { status: "unknown", validFrom: null, validUntil: null },
                    },
                  });
                  if (r.kind === "sourceRevision") setSourceId(r.revision.sourceRevisionId);
                  return "原文已保存，尚未发布。";
                })
              }
            >
              保存来源
            </Button>
          </section>
          <section>
            <h2>使用已配置模型整理</h2>
            <label>
              整理来源
              <select
                aria-label="整理来源"
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
              >
                <option value="">选择原始资料</option>
                {sources.map((s) => (
                  <option key={s.sourceRevisionId} value={s.sourceRevisionId}>
                    {s.label} · V{s.version}
                  </option>
                ))}
              </select>
            </label>
            <label>
              知识类型
              <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                <option value="sop">业务说明 / SOP</option>
                <option value="term">术语</option>
                <option value="rule">付款 / 交期检查规则</option>
              </select>
            </label>
            <label>
              语言代码
              <input value={locale} onChange={(e) => setLocale(e.target.value)} />
            </label>
            <label>
              品类（空表示通用）
              <input value={category} onChange={(e) => setCategory(e.target.value)} />
            </label>
            <label>
              市场（空表示通用）
              <input value={market} onChange={(e) => setMarket(e.target.value)} />
            </label>
            <label>
              平台（空表示通用）
              <input value={platform} onChange={(e) => setPlatform(e.target.value)} />
            </label>
            <Button
              disabled={!source}
              onClick={() =>
                void run(async () => {
                  if (!source) return "请选择来源";
                  const r = await client.executeKnowledgeDesktop({
                    ...common(),
                    method: "knowledge.organize",
                    payload: {
                      source: {
                        sourceRevisionId: source.sourceRevisionId,
                        artifactHash: source.artifactHash,
                      },
                      target: {
                        kind,
                        locale,
                        scope: {
                          categories: category.trim() ? [category.trim()] : [],
                          markets: market.trim() ? [market.trim()] : [],
                          platforms: platform.trim() ? [platform.trim()] : [],
                        },
                      },
                      instructions:
                        "依据原文整理企业知识，保留未知项与合成标识。不要推测价格、认证、付款或交期。",
                    },
                  });
                  if (!r.ok) throw new Error(r.error.message);
                  if (r.data.kind === "organized") {
                    setRecordId(r.data.record.revision.revisionId);
                    setConfirmed(false);
                    setLint(null);
                  }
                  return "模型候选已保存，待人工核对；未自动发布。";
                })
              }
            >
              LLM 整理为候选
            </Button>
            <p className="description">
              将所选原文发送至已配置模型；单次调用，失败需明确重新发起。
            </p>
          </section>
          <section>
            <h2>人工审核与发布</h2>
            <label>
              知识版本
              <select
                aria-label="知识版本"
                value={recordId}
                onChange={(e) => {
                  setRecordId(e.target.value);
                  setConfirmed(false);
                  setLint(null);
                }}
              >
                <option value="">选择知识候选</option>
                {records.map((r) => (
                  <option key={r.revision.revisionId} value={r.revision.revisionId}>
                    {r.revision.content.title} · V{r.revision.version} ·{" "}
                    {stateLabels[r.lifecycle.state]}
                  </option>
                ))}
              </select>
            </label>
            {record && (
              <>
                <pre className="enterprise-preview">{record.revision.content.markdown}</pre>
                <details>
                  <summary>核对引用原文</summary>
                  {record.revision.content.sourceRefs.map((ref) => (
                    <pre className="enterprise-preview" key={ref.referenceId}>
                      {sources.find((s) => s.sourceRevisionId === ref.sourceRevisionId)
                        ?.sourceText ?? "历史来源不在当前列表，请刷新核对"}
                    </pre>
                  ))}
                </details>
                <label>
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  我已核对原文、知识内容与适用范围；合成资料仅用于演示
                </label>
                <Button
                  variant="outline"
                  disabled={
                    !confirmed ||
                    record.lifecycle.state !== "candidate" ||
                    record.revision.content.validity.status === "confirmed"
                  }
                  onClick={() =>
                    void run(async () => {
                      const refs = [];
                      for (const ref of record.revision.content.sourceRefs) {
                        const original = sources.find(
                          (s) => s.sourceRevisionId === ref.sourceRevisionId,
                        );
                        if (!original) throw new Error("引用来源不在列表，请刷新后重试");
                        let fresh = original;
                        if (original.validity.status !== "confirmed") {
                          const staged = await wiki({
                            ...common(),
                            method: "source.stage",
                            payload: {
                              sourceId: original.sourceId,
                              expectedVersion: original.version,
                              label: original.label,
                              sourceStatus: original.sourceStatus,
                              mediaType: original.mediaType,
                              sourceText: original.sourceText,
                              acquiredAt: original.acquiredAt,
                              sourceUri: original.sourceUri,
                              permissionNote: original.permissionNote,
                              validity: { ...original.validity, status: "confirmed" },
                            },
                          });
                          if (staged.kind !== "sourceRevision") throw new Error("来源确认返回异常");
                          fresh = staged.revision;
                        }
                        refs.push({
                          ...ref,
                          sourceRevisionId: fresh.sourceRevisionId,
                          sourceVersion: fresh.version,
                          artifactHash: fresh.artifactHash,
                        });
                      }
                      const r = await wiki({
                        ...common(),
                        method: "wiki.stage",
                        payload: {
                          documentId: record.revision.documentId,
                          expectedVersion: record.revision.version,
                          parentRevisionId: record.revision.revisionId,
                          content: {
                            ...record.revision.content,
                            sourceRefs: refs,
                            validity: { ...record.revision.content.validity, status: "confirmed" },
                          },
                        },
                      });
                      if (r.kind === "wikiRevision") setRecordId(r.record.revision.revisionId);
                      setLint(null);
                      return "已创建人工确认版本，原候选保留。请检查后审核发布。";
                    })
                  }
                >
                  确认内容并创建审核版本
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    void run(async () => {
                      const r = await client.executeWikiMaintenance({
                        ...common(),
                        method: "wiki.lint",
                        payload: {
                          revisionId: record.revision.revisionId,
                          contentHash: record.revision.contentHash,
                          sourceSetHash: record.revision.sourceSetHash,
                          expectedLifecycleVersion: record.lifecycle.lifecycleVersion,
                        },
                      });
                      if (!r.ok) throw new Error(r.error.message);
                      if (r.data.kind !== "lintReport") throw new Error("检查返回异常");
                      setLint(r.data.report);
                      return `检查：${r.data.report.receipt.outcome}`;
                    })
                  }
                >
                  检查知识
                </Button>
                {lint && <p>{lint.issues.map((i) => i.message).join("；") || "检查通过"}</p>}
                <Button
                  disabled={
                    !confirmed ||
                    lint?.receipt.outcome !== "passed" ||
                    record.lifecycle.state !== "candidate"
                  }
                  onClick={() =>
                    void run(async () => {
                      if (!binding || !lint) return "请先检查";
                      await wiki({
                        ...common(),
                        method: "wiki.review",
                        payload: {
                          ...binding,
                          expectedLifecycleVersion: record.lifecycle.lifecycleVersion,
                          decision: "approve",
                          note: "人工入口已核对原文、候选与适用范围；合成资料限演示",
                          lintReceiptId: lint.receipt.receiptId,
                        },
                      });
                      return "审核批准，尚未发布。";
                    })
                  }
                >
                  批准此版本
                </Button>
                <Button
                  disabled={!confirmed || record.lifecycle.state !== "approved"}
                  onClick={() =>
                    void run(async () => {
                      if (!binding || !record.lifecycle.review) return "请先批准";
                      await wiki({
                        ...common(),
                        method: "wiki.publish",
                        payload: {
                          ...binding,
                          expectedLifecycleVersion: record.lifecycle.lifecycleVersion,
                          reviewId: record.lifecycle.review.reviewId,
                        },
                      });
                      return "知识已发布，可供适用业务查询。";
                    })
                  }
                >
                  发布知识
                </Button>
                <Button
                  variant="outline"
                  disabled={record.lifecycle.state !== "published"}
                  onClick={() =>
                    void run(async () => {
                      await wiki({
                        ...common(),
                        method: "wiki.withdraw",
                        payload: {
                          revisionId: record.revision.revisionId,
                          expectedLifecycleVersion: record.lifecycle.lifecycleVersion,
                          note: "用户通过知识管理入口撤回",
                        },
                      });
                      return "已撤回；历史引用保留。";
                    })
                  }
                >
                  撤回发布
                </Button>
              </>
            )}
          </section>
        </div>
      </fieldset>
      {busy && <p role="status">正在处理，请勿重复提交…</p>}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
