import { useQuery } from "@tanstack/react-query";
import {
  type AgentReadData,
  type DesktopClient,
  type Product,
  type ReadToolObservation,
} from "@tradequote/contracts";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../shared/button";
import { useMessage } from "../shared/message";
import { Notification } from "../shared/notification";
import { useWorkspace } from "./workspace";

const toolLabels = {
  search_catalog: "商品检索",
  get_product_revisions: "商品快照",
  get_quote: "报价读取",
  calculate_quote: "核价预览",
};
const amount = (value: string | null) => (value === null ? "未知" : value);

export function ReadAssistantPage({ client }: { client: DesktopClient }) {
  const workspace = useWorkspace(client);
  const query = useQuery({
    queryKey: ["trade"],
    enabled: !!workspace.data,
    queryFn: async () => {
      const result = await client.getTrade();
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
  });
  const message = useMessage();
  const [instruction, setInstruction] = useState("");
  const [revisionId, setRevisionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AgentReadData | null>(null);
  const [failed, setFailed] = useState(false);
  async function run() {
    setBusy(true);
    setResult(null);
    setFailed(false);
    try {
      const response = await client.readAgent({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        method: "agent.read",
        payload: { instruction, quoteRevisionIds: revisionId ? [revisionId] : [] },
      });
      if (!response.ok) {
        setFailed(true);
        message.error(response.error.message);
      } else setResult(response.data);
    } catch {
      setFailed(true);
      message.error("只读连接中断，未保存报价；重新运行会再次调用模型");
    } finally {
      setBusy(false);
    }
  }
  if (workspace.isPending) return <p role="status">正在读取工作区…</p>;
  if (workspace.isError)
    return (
      <Notification
        title="工作区读取失败"
        description={workspace.error.message}
        action={{
          label: "重新加载",
          onClick: () => void workspace.refetch(),
          pending: workspace.isFetching,
        }}
      />
    );
  if (!workspace.data)
    return (
      <section className="panel">
        <h1 className="sr-only">只读助手</h1>
        <h2>先建立本地工作区</h2>
        <Link to="/workspace">创建工作区</Link>
      </section>
    );
  if (query.isPending) return <p role="status">正在读取资料与报价…</p>;
  if (query.isError)
    return (
      <Notification
        title="资料与报价读取失败"
        description={query.error.message}
        action={{
          label: "重新加载",
          onClick: () => void query.refetch(),
          pending: query.isFetching,
        }}
      />
    );
  const board = query.data;
  return (
    <div className="space-y-4">
      <h1 className="sr-only">只读助手</h1>
      <section className="panel space-y-4" aria-label="只读助手任务">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2>只读助手</h2>
          <Button
            type="button"
            variant="outline"
            disabled={busy || query.isFetching}
            onClick={() => void query.refetch()}
          >
            刷新可读资料
          </Button>
        </div>
        <p className="description">
          可检索商品、读取商品快照与所选报价、核算未保存预览。知识检索和规则检查尚未开放。
        </p>
        <p className="description">
          运行会将任务、查询到的商品和所选报价发给已配置模型。结果仅本次查看；本页不会发布资料、保存报价或审批。先到{" "}
          <Link to="/model">模型设置</Link> 配置连接。
        </p>
        {!board.scenario && <p>核价预览需先在“资料与报价”保存场景。</p>}
        {!board.products.length && (
          <p>
            暂无已发布商品，请到 <Link to="/quotes">资料与报价</Link> 导入并确认发布。
          </p>
        )}
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void run();
          }}
        >
          <label htmlFor="read-quote">允许读取的报价版本</label>
          <select
            id="read-quote"
            value={revisionId}
            disabled={busy}
            onChange={(event) => {
              setRevisionId(event.target.value);
              setResult(null);
            }}
          >
            <option value="">不读取报价，仅使用商品资料</option>
            {board.quotes.map((quote) => (
              <option key={quote.id} value={quote.id}>
                {quote.number} · {quote.buyer} · V{quote.version}
              </option>
            ))}
          </select>
          <label htmlFor="read-instruction">只读任务</label>
          <textarea
            id="read-instruction"
            required
            maxLength={8000}
            rows={4}
            value={instruction}
            disabled={busy}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder="例如：查询 DEMO-TEE 并读取其价格来源，核算 120 件；如已选择报价，请对照原报价金额。"
          />
          <Button disabled={busy || (!board.products.length && !revisionId) || !instruction.trim()}>
            运行只读任务
          </Button>
        </form>
        {busy && <p role="status">只读任务运行中，最长约两分钟；不会保存新报价。</p>}
        {failed && <p role="status">本次未取得结果，未保存报价。重新运行会再次调用模型。</p>}
      </section>
      {result && (
        <section className="panel space-y-4" aria-label="只读任务结果">
          <h2>{result.outcome === "completed" ? "只读任务已结束" : "需要补充需求"} · 未保存报价</h2>
          <p className="description">
            核价日期 {result.asOf} · 实际调用 {result.toolCalls}{" "}
            次工具；事实请核对下方工具结果，模型说明未经审核。
          </p>
          <h3>
            {result.outcome === "completed" ? "模型说明（未审核）" : "模型澄清问题（未审核）"}
          </h3>
          <p className="whitespace-pre-wrap">
            {result.outcome === "completed" ? result.summary : result.clarification}
          </p>
          {!result.observations.length && <p>本次未调用业务工具，尚无商品或报价查询依据。</p>}
          {result.observations.map((observation, index) => (
            <article
              className="space-y-4 border-t border-border pt-4"
              key={`${index}-${observation.tool}`}
              aria-label={`工具结果 ${index + 1} ${toolLabels[observation.tool]}`}
            >
              <h3>
                {index + 1} · {toolLabels[observation.tool]}
              </h3>
              <Observation observation={observation} />
              {observation.result.ok && (
                <details>
                  <summary>依据标识</summary>
                  <p className="break-all">
                    {observation.result.evidenceIds.join(" · ") || "本次未命中资料"}
                  </p>
                </details>
              )}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

function ProductSources({ products }: { products: Product[] }) {
  return (
    <div className="space-y-4">
      {products.map((product) => (
        <details key={product.id}>
          <summary>{product.sku} · 价格档位与来源</summary>
          <p>
            {product.sourceName} · {product.sourceStatus === "synthetic" ? "合成资料" : "用户提供"}{" "}
            · 有效至 {product.validUntil}
          </p>
          <p className="break-all">来源 SHA-256：{product.sourceHash}</p>
          <ul>
            {product.tiers.map((tier) => (
              <li key={tier.sourceRow}>
                起订 {tier.minQuantity} {product.unit} · 单价 {amount(tier.unitPrice)}{" "}
                {product.currency} · 原文第 {tier.sourceRow} 行
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
function Products({ products }: { products: Product[] }) {
  if (!products.length) return <p>未找到符合条件的已发布商品。</p>;
  return (
    <>
      <div className="overflow-x-auto">
        <table aria-label="只读商品结果">
          <thead>
            <tr>
              <th>SKU</th>
              <th>商品</th>
              <th>品类</th>
              <th>单位</th>
              <th>有效期</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>{p.sku}</td>
                <td>{p.name}</td>
                <td>{p.category}</td>
                <td>{p.unit}</td>
                <td>{p.validUntil}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ProductSources products={products} />
    </>
  );
}
function Observation({ observation }: { observation: ReadToolObservation }) {
  if (!observation.result.ok)
    return (
      <p role="alert" className="error-box">
        {observation.result.error.message}（{observation.result.error.code}）
      </p>
    );
  switch (observation.tool) {
    case "search_catalog":
      return (
        <>
          <Products products={observation.result.data.items} />
          {observation.result.data.nextAfterId && (
            <p>还有后续商品，模型可继续分页读取；本页不代表全部结果。</p>
          )}
        </>
      );
    case "get_product_revisions":
      return <Products products={observation.result.data.products} />;
    case "get_quote": {
      const quote = observation.result.data.quote;
      return (
        <>
          <p>
            {quote.number} · V{quote.version} ·{" "}
            {observation.result.data.isLatest ? "读取时最新版本" : "历史版本"} · 未审核草稿
          </p>
          <p>客户：{quote.buyer}</p>
          <p>
            原报价商品合计：{amount(quote.goodsTotal)} {quote.currency}
          </p>
          <p>
            付款：{quote.payment || "待确认"} · 交期：{quote.delivery || "待确认"}
          </p>
          <Lines lines={quote.lines} currency={quote.currency} />
          <ProductSources products={quote.lines.map((l) => l.product)} />
        </>
      );
    }
    case "calculate_quote": {
      const calculation = observation.result.data.calculation;
      return (
        <>
          <p>仅核算预览 · 未保存报价</p>
          <p>
            预览商品合计：{amount(calculation.goodsTotal)} {calculation.currency}
          </p>
          <Lines lines={calculation.lines} currency={calculation.currency} />
          <ul>
            {calculation.pending.map((text, index) => (
              <li key={`${index}-${text}`}>{text}</li>
            ))}
          </ul>
          <ProductSources products={calculation.lines.map((l) => l.product)} />
        </>
      );
    }
  }
}
function Lines({ lines, currency }: { lines: ProductLine[]; currency: string }) {
  return (
    <div className="overflow-x-auto">
      <table aria-label="只读金额依据">
        <thead>
          <tr>
            <th>SKU</th>
            <th className="numeric">数量</th>
            <th className="numeric">单价（{currency}）</th>
            <th className="numeric">行金额（{currency}）</th>
            <th>待确认原因</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.product.id}>
              <td>{line.product.sku}</td>
              <td className="numeric">
                {line.quantity} {line.product.unit}
              </td>
              <td className="numeric">{amount(line.unitPrice)}</td>
              <td className="numeric">{amount(line.amount)}</td>
              <td>{line.reason ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
type ProductLine = import("@tradequote/contracts").QuoteSnapshot["lines"][number];
