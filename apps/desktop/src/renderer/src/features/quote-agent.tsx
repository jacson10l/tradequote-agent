import {
  type AgentCommand,
  type DesktopClient,
  type QuoteSnapshot,
  type TradeBoard,
  type TradeResult,
} from "@tradequote/contracts";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../shared/button";
export function QuoteAgent({
  client,
  board,
  selected,
  onSaved,
}: {
  client: DesktopClient;
  board: TradeBoard;
  selected: QuoteSnapshot | undefined;
  onSaved: (result: Extract<TradeResult, { ok: true }>) => void;
}) {
  const [buyer, setBuyer] = useState("");
  const [inquiry, setInquiry] = useState("");
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const keys = useRef(new Map<string, string>());
  const root = selected?.rootId ?? selected?.id;
  const latest = board.quotes
    .filter((q) => (q.rootId ?? q.id) === root)
    .sort((a, b) => b.version - a.version)[0];
  const turns = board.turns
    .filter((t) => t.rootId === root)
    .slice()
    .reverse();
  async function run(command: AgentCommand) {
    const fingerprint = JSON.stringify({ method: command.method, payload: command.payload });
    const key = keys.current.get(fingerprint) ?? crypto.randomUUID();
    keys.current.set(fingerprint, key);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result =
        command.method === "agent.understand"
          ? await client.understandInquiry({ ...command, idempotencyKey: key })
          : await client.reviseQuote({ ...command, idempotencyKey: key });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      onSaved(result);
      const quote = result.data.quotes.find((q) => q.id === result.evidenceIds[0]);
      setNotice(`已保存为 V${quote?.version ?? "?"} 草稿，请核对字段、金额与待确认事项。`);
      if (command.method === "agent.revise") setInstruction("");
    } catch {
      setError("连接中断，结果未知；请重新加载报价或重试同一操作。");
    } finally {
      setBusy(false);
    }
  }
  const envelope = () => ({
    schemaVersion: 1 as const,
    requestId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
  });
  return (
    <section className="panel space-y-4" aria-label="DeepSeek 询盘与对话">
      <h2>4 · DeepSeek 询盘与对话</h2>
      <p className="description">
        先到 <Link to="/model">模型设置</Link>{" "}
        保存并测试连接。运行后将发送相关业务文本，生成未经审核的草稿；金额由本地业务模块计算。
      </p>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (board.scenario)
            void run({
              ...envelope(),
              method: "agent.understand",
              payload: { scenarioId: board.scenario.id, buyer, inquiry },
            });
        }}
      >
        <label htmlFor="agent-buyer">询盘客户</label>
        <input
          id="agent-buyer"
          required
          maxLength={200}
          value={buyer}
          disabled={busy}
          onChange={(e) => setBuyer(e.target.value)}
        />
        <label htmlFor="agent-inquiry">交给模型理解的询盘</label>
        <textarea
          id="agent-inquiry"
          required
          rows={3}
          maxLength={8000}
          value={inquiry}
          disabled={busy}
          onChange={(e) => setInquiry(e.target.value)}
          placeholder="请写明商品、数量和单位；缺失条款将保留待确认。"
        />
        <Button disabled={busy || !board.scenario || !board.products.length}>
          理解询盘并保存 V1
        </Button>
      </form>
      {selected && (
        <>
          <h3>
            当前报价 V{selected.version} · {selected.buyer}
          </h3>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run({
                ...envelope(),
                method: "agent.revise",
                payload: { baseId: selected.id, expectedVersion: selected.version, instruction },
              });
            }}
          >
            <p>
              可修改现有商品数量、付款条款、交期与交货条件。每轮生成一个新版本；旧版本保留。增删商品、改价或换币需后续能力。
            </p>
            <label htmlFor="agent-revision">本轮修改要求</label>
            <textarea
              id="agent-revision"
              rows={3}
              maxLength={8000}
              required
              value={instruction}
              disabled={busy}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="第一轮：将数量改成 120；第二轮：付款改成 30% 预付、余款发货前付清。"
            />
            <Button disabled={busy || latest?.id !== selected.id}>
              理解修改并保存 V{selected.version + 1}
            </Button>
            {latest?.id !== selected.id && (
              <p>当前为历史版本，请在下方选择最新版本 V{latest?.version} 再修改。</p>
            )}
          </form>
        </>
      )}
      {busy && <p role="status">模型正在理解需求，最长约 45 秒；保存后才会显示新版本。</p>}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {turns.length > 0 && (
        <div className="space-y-4" aria-label="已保存对话记录">
          <h3>已保存的对话</h3>
          {turns.map((t) => (
            <article className="basis" key={t.id}>
              <p className="whitespace-pre-wrap">你：{t.instruction}</p>
              <p className="whitespace-pre-wrap">模型建议：{t.summary}</p>
              <small>
                {t.model} · V{board.quotes.find((q) => q.id === t.quoteId)?.version} · {t.createdAt}
              </small>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
export function QuoteDifference({
  quote,
  quotes,
}: {
  quote: QuoteSnapshot;
  quotes: QuoteSnapshot[];
}) {
  const [selected, setSelected] = useState(quote.parentId ?? "");
  const candidates = quotes.filter(
    (q) => (q.rootId ?? q.id) === (quote.rootId ?? quote.id) && q.version < quote.version,
  );
  const base = candidates.find((q) => q.id === selected) ?? candidates[0];
  if (!base) return null;
  const rows: { field: string; before: string; after: string; kind: string }[] = [];
  const add = (
    field: string,
    before: string | null,
    after: string | null,
    kind = "事实 / 条款",
  ) => {
    if (before !== after)
      rows.push({
        field,
        before: before === null ? "未知" : before || "待确认",
        after: after === null ? "未知" : after || "待确认",
        kind,
      });
  };
  add("付款条款", base.payment, quote.payment);
  add("交期与交货", base.delivery, quote.delivery);
  for (const line of quote.lines) {
    const old = base.lines.find((l) => l.product.id === line.product.id);
    if (!old) continue;
    add(`${line.product.sku} 数量（${line.product.unit}）`, old.quantity, line.quantity);
    add(`${line.product.sku} 价格档位`, old.tierMin, line.tierMin, "金额重算");
    add(`${line.product.sku} 单价（${quote.currency}）`, old.unitPrice, line.unitPrice, "金额重算");
    add(`${line.product.sku} 行金额（${quote.currency}）`, old.amount, line.amount, "金额重算");
    add(`${line.product.sku} 待确认原因`, old.reason, line.reason, "风险变化");
  }
  add(`商品合计（${quote.currency}）`, base.goodsTotal, quote.goodsTotal, "金额重算");
  add("待确认事项", base.pending.join("；"), quote.pending.join("；"), "风险变化");
  return (
    <section className="space-y-4" aria-label="报价版本差异">
      <h3>
        V{base.version} → V{quote.version} 差异
      </h3>
      <label htmlFor="compare-base">对比基准版本</label>
      <select id="compare-base" value={base.id} onChange={(e) => setSelected(e.target.value)}>
        {candidates.map((q) => (
          <option value={q.id} key={q.id}>
            V{q.version}
          </option>
        ))}
      </select>
      <div className="table-scroll">
        <table className="min-w-[900px]">
          <thead>
            <tr>
              <th className="min-w-[160px]">字段</th>
              <th>之前</th>
              <th>现在</th>
              <th className="min-w-[100px]">变化类型</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.field}>
                <td>{row.field}</td>
                <td>{row.before}</td>
                <td>{row.after}</td>
                <td>{row.kind}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="description">
        来源与计价规则沿用旧快照；每个新版本均为未审核草稿，规则与平台适配仍待接入。
      </p>
    </section>
  );
}
