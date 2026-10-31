import type {
  AgentReadData,
  DesktopClient,
  Product,
  ReadToolObservation,
} from "@tradequote/contracts";
import { Navigate } from "react-router-dom";

const amount = (value: string | null) => (value === null ? "未知" : value);
export function ReadAssistantPage({ client: _client }: { client: DesktopClient }) {
  return <Navigate to="/?read=1" replace />;
}

/** Business facts come from validated tool results; free-form model diagnostics stay out of the chat. */
export function ReadSummary({ result }: { result: AgentReadData }) {
  const calculation = result.observations
    .flatMap((o) =>
      o.tool === "calculate_quote" && o.result.ok ? [o.result.data.calculation] : [],
    )
    .at(-1);
  const quote = result.observations
    .flatMap((o) => (o.tool === "get_quote" && o.result.ok ? [o.result.data.quote] : []))
    .at(-1);
  const products = [
    ...new Map(
      result.observations
        .flatMap((o) =>
          o.tool === "search_catalog" && o.result.ok
            ? o.result.data.items
            : o.tool === "get_product_revisions" && o.result.ok
              ? o.result.data.products
              : [],
        )
        .map((p) => [p.id, p]),
    ).values(),
  ];
  return (
    <div className="space-y-2">
      {calculation ? (
        <>
          <p>
            本次试算商品合计：{amount(calculation.goodsTotal)} {calculation.currency}
          </p>
          {calculation.lines.map((line) => (
            <p key={line.product.id}>
              {line.product.name} · {line.quantity} {line.product.unit}
            </p>
          ))}
        </>
      ) : products.length ? (
        <>
          <p>已查到 {products.length} 项商品资料。</p>
          {products.map((p) => (
            <p key={p.id}>
              {p.name} · {p.sku} · {p.unit}
            </p>
          ))}
        </>
      ) : !quote ? (
        <p>本次未取得查询依据，请核对商品名称或补充查询条件。</p>
      ) : null}
      {quote && (
        <p>
          当前报价 V{quote.version}：{amount(quote.goodsTotal)} {quote.currency}。
        </p>
      )}
      <p className="description">
        本次查询未修改报价。{calculation ? "商品合计未含运费和税费。" : ""}
      </p>
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
export function ReadObservation({ observation }: { observation: ReadToolObservation }) {
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
