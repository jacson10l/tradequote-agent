import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type DesktopClient,
  QuoteInputSchema,
  type QuoteSnapshot,
  type Scenario,
  type ScenarioInput,
  ScenarioInputSchema,
  type TradeBoard,
  type TradeWrite,
} from "@tradequote/contracts";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { Button } from "../shared/button";
import { useMessage } from "../shared/message";
import { Notification } from "../shared/notification";

import { useWorkspace } from "./workspace";

export function QuotesPage({ client }: { client: DesktopClient }) {
  const workspace = useWorkspace(client);
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
        <h1>先建立本地工作区</h1>
        <Button asChild>
          <Link to="/workspace">创建工作区</Link>
        </Button>
      </section>
    );
  return <QuoteWorkspace client={client} />;
}
function QuoteWorkspace({ client }: { client: DesktopClient }) {
  const queries = useQueryClient();
  const operations = useRef(new Map<string, string>());
  const [selectedBatch, setSelectedBatch] = useState("");
  const message = useMessage();
  const [selectedQuote, setSelectedQuote] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["trade"],
    queryFn: async () => {
      const result = await client.getTrade();
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    },
  });
  const mutation = useMutation({
    mutationFn: async (input: TradeWrite) => {
      const fingerprint = JSON.stringify({ method: input.method, payload: input.payload });
      const key = operations.current.get(fingerprint) ?? crypto.randomUUID();
      operations.current.set(fingerprint, key);
      const command = { ...input, idempotencyKey: key };
      switch (command.method) {
        case "scenario.save":
          return client.saveScenario(command);
        case "catalog.stage":
          return client.stageCatalog(command);
        case "catalog.publish":
          return client.publishCatalog(command);
        case "quote.createV1":
          return client.createQuoteV1(command);
      }
    },
    onSuccess: async (result, command) => {
      if (!result.ok) {
        message.error(result.error.message);
        return;
      }
      queries.setQueryData(["trade"], result.data);
      if (command.method === "quote.createV1") setSelectedQuote(result.evidenceIds[0] ?? null);
      if (command.method === "catalog.stage" || command.method === "catalog.publish")
        setSelectedBatch(result.evidenceIds[0] ?? "");
      message.success(
        command.method === "quote.createV1"
          ? "报价草稿 V1 已保存至本机"
          : command.method === "catalog.publish"
            ? "已确认发布商品资料"
            : command.method === "catalog.stage"
              ? "预览已保存，请核对后确认发布"
              : "业务场景已保存",
      );
      await queries.invalidateQueries({ queryKey: ["trade"] });
    },
    onError: () => message.error("连接中断，结果未知。请重试同一操作或重新加载。"),
  });
  const common = () => ({
    schemaVersion: 1 as const,
    requestId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
  });
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
  const saved = board.quotes.find((quote) => quote.id === selectedQuote) ?? board.quotes[0];
  return (
    <div className="grid gap-4">
      <h1 className="sr-only">资料与报价</h1>
      <ScenarioForm
        key={board.scenario?.id ?? "new"}
        scenario={board.scenario}
        busy={mutation.isPending}
        reloading={query.isFetching}
        onReload={() => void query.refetch()}
        onSave={(scenario) =>
          mutation.mutate({
            ...common(),
            method: "scenario.save",
            payload: { scenario, expectedVersion: board.scenario?.version ?? 0 },
          })
        }
      />
      <CatalogPanel
        client={client}
        selectedBatch={selectedBatch}
        onSelectBatch={setSelectedBatch}
        board={board}
        busy={mutation.isPending}
        onStage={(payload) => mutation.mutate({ ...common(), method: "catalog.stage", payload })}
        onPublish={(batchId, sourceHash) =>
          mutation.mutate({
            ...common(),
            method: "catalog.publish",
            payload: { batchId, sourceHash },
          })
        }
      />
      <Button asChild>
        <Link to="/">进入工作台处理业务</Link>
      </Button>
      <section className="panel space-y-4">
        <h2>历史报价查询</h2>
        {board.quotes.length === 0 ? (
          <p className="description">保存后可在这里查看冻结的商品、价格依据和待确认事项。</p>
        ) : (
          <>
            <label htmlFor="saved-quote">选择报价与版本</label>
            <select
              id="saved-quote"
              value={saved?.id ?? ""}
              onChange={(event) => setSelectedQuote(event.target.value)}
            >
              {board.quotes.map((quote) => (
                <option key={quote.id} value={quote.id}>
                  {quote.buyer} · V{quote.version} · {quote.createdAt} · {quote.number.slice(0, 10)}
                </option>
              ))}
            </select>
            {saved && (
              <>
                <SavedQuote quote={saved} />
                <Button asChild>
                  <Link to={`/?quote=${saved.id}`}>在工作台继续处理此报价</Link>
                </Button>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
function ScenarioForm({
  scenario,
  busy,
  reloading,
  onReload,
  onSave,
}: {
  scenario: Scenario | null;
  busy: boolean;
  reloading: boolean;
  onReload: () => void;
  onSave: (input: ScenarioInput) => void;
}) {
  const form = useForm<ScenarioInput>({
    resolver: zodResolver(ScenarioInputSchema),
    defaultValues: scenario
      ? {
          name: scenario.name,
          targetUser: scenario.targetUser,
          platform: scenario.platform,
          market: scenario.market,
          category: scenario.category,
          locales: scenario.locales,
          sourceStatus: scenario.sourceStatus,
        }
      : {
          name: "",
          targetUser: "",
          platform: "",
          market: "",
          category: "",
          locales: [],
          sourceStatus: "user_provided",
        },
  });
  // Stored metadata is deliberately not submitted as editable scenario input.
  const submit = form.handleSubmit((data) => onSave(data));
  return (
    <section className="panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2>1 · 业务场景</h2>
        <Button variant="outline" disabled={busy || reloading} onClick={onReload}>
          重新加载资料与报价
        </Button>
      </div>
      <p className="description">
        配置适用的平台、市场、品类和语言。日常询盘、报价与变更在单据工作台处理；资料发布和规则覆盖仍需人工核对。
      </p>
      <form onSubmit={submit} className="space-y-4 mt-4">
        <div className="grid gap-4 md:grid-cols-2">
          {(
            [
              ["name", "场景名称"],
              ["targetUser", "目标用户与岗位"],
              ["platform", "目标平台 / 场景"],
              ["market", "目标市场"],
              ["category", "商品品类"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <label htmlFor={`scenario-${key}`}>{label}</label>
              <input id={`scenario-${key}`} {...form.register(key)} />
              <p className="field-error">{form.formState.errors[key]?.message}</p>
            </div>
          ))}
          <div>
            <label htmlFor="scenario-locales">目标语言（逗号分隔 BCP 47）</label>
            <input
              id="scenario-locales"
              value={form.watch("locales").join(", ")}
              onChange={(event) =>
                form.setValue(
                  "locales",
                  event.target.value.split(",").map((v) => v.trim()),
                  { shouldValidate: true },
                )
              }
            />
            <p className="field-error">{form.formState.errors.locales?.message}</p>
          </div>
          <div>
            <label htmlFor="scenario-source">场景来源</label>
            <select id="scenario-source" {...form.register("sourceStatus")}>
              <option value="synthetic">未核实配置（不可用于交易）</option>
              <option value="user_provided">用户提供（规则仍待验证）</option>
            </select>
          </div>
        </div>
        <Button type="submit" disabled={busy}>
          保存业务场景
        </Button>
        {scenario && <span className="status-badge ml-3">场景版本 {scenario.version}</span>}
      </form>
    </section>
  );
}
function CatalogPanel({
  selectedBatch,
  onSelectBatch,
  client,
  board,
  busy,
  onStage,
  onPublish,
}: {
  client: DesktopClient;
  selectedBatch: string;
  onSelectBatch: (id: string) => void;
  board: TradeBoard;
  busy: boolean;
  onStage: (payload: Extract<TradeWrite, { method: "catalog.stage" }>["payload"]) => void;
  onPublish: (id: string, hash: string) => void;
}) {
  const [csv, setCsv] = useState("");
  const [sourceName, setSourceName] = useState("商品资料.csv");
  const [sourceStatus, setSourceStatus] = useState<"synthetic" | "user_provided">("user_provided");
  const message = useMessage();
  const [picking, setPicking] = useState(false);
  const batch = board.batches.find((entry) => entry.id === selectedBatch) ?? board.batches[0];
  return (
    <section className="panel space-y-4">
      <h2>2 · 商品与价目表</h2>
      <p className="description">
        UTF-8 CSV，最多 256 KiB / 500 行。列名固定，顺序可变；同 SKU
        多行表示数量档位。空价格保留未知。原文和行位置会随预览保存。
      </p>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          disabled={busy || picking}
          onClick={async () => {
            setPicking(true);
            try {
              const result = await client.pickCatalogCsv();
              if (result.status === "selected") {
                setCsv(result.csv);
                setSourceName(result.name);
                setSourceStatus("user_provided");
              } else if (result.status === "error") message.error(result.message);
            } catch {
              message.error("文件选择失败，请重试");
            } finally {
              setPicking(false);
            }
          }}
        >
          选择 CSV 文件
        </Button>
      </div>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          onStage({ csv, sourceName, sourceStatus });
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="source-name">资料名称</label>
            <input
              id="source-name"
              value={sourceName}
              maxLength={200}
              required
              onChange={(event) => setSourceName(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="source-status">资料性质</label>
            <select
              id="source-status"
              value={sourceStatus}
              onChange={(event) =>
                setSourceStatus(event.target.value === "synthetic" ? "synthetic" : "user_provided")
              }
            >
              <option value="synthetic">未核实资料（不可用于交易）</option>
              <option value="user_provided">用户提供资料（人工核对）</option>
            </select>
          </div>
        </div>
        <label htmlFor="catalog-csv">CSV 原文</label>
        <textarea
          id="catalog-csv"
          rows={6}
          maxLength={262144}
          required
          value={csv}
          onChange={(event) => setCsv(event.target.value)}
          placeholder="sku,name,category,unit,currency,min_quantity,unit_price,valid_until,description"
        />
        <Button disabled={busy || !csv.trim()} type="submit">
          解析并预览
        </Button>
      </form>
      {batch && (
        <div className="space-y-4">
          <label htmlFor="batch">导入预览 / 历史批次</label>
          <select
            id="batch"
            value={batch.id}
            onChange={(event) => onSelectBatch(event.target.value)}
          >
            {board.batches.map((item) => (
              <option key={item.id} value={item.id}>
                {item.sourceName} · {item.status === "published" ? "已发布" : "待确认"} ·{" "}
                {item.createdAt}
              </option>
            ))}
          </select>
          <p className="sample-note">
            {batch.sourceStatus === "synthetic" ? "未核实资料（不可用于交易）" : "用户提供资料"} ·{" "}
            {batch.status === "published" ? "已人工确认发布" : "尚未发布，不用于报价"} · 来源
            SHA-256：<span className="break-all">{batch.sourceHash}</span>
          </p>
          {batch.issues.length > 0 && (
            <div role="alert" className="error-box">
              {batch.issues.map((issue, i) => (
                <p key={`${issue.row}-${issue.field}-${i}`}>
                  第 {issue.row} 行 / {issue.field}：{issue.message}
                </p>
              ))}
              <p>修正原文后重新预览；错误批次不能发布。</p>
            </div>
          )}
          <div className="table-scroll">
            <table>
              <caption className="sr-only">CSV 导入预览</caption>
              <thead>
                <tr>
                  <th>原文行</th>
                  <th>SKU / 商品</th>
                  <th>单位 / 币种</th>
                  <th>起订数量</th>
                  <th>单价</th>
                  <th>有效至</th>
                </tr>
              </thead>
              <tbody>
                {batch.rows.map((row) => (
                  <tr key={row.row}>
                    <td>{row.row}</td>
                    <td>
                      {row.sku}
                      <br />
                      {row.name}
                    </td>
                    <td>
                      {row.unit} / {row.currency}
                    </td>
                    <td className="numeric">{row.minQuantity}</td>
                    <td className="numeric">{row.unitPrice ?? "未知"}</td>
                    <td>{row.validUntil}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button
            disabled={
              busy || batch.status === "published" || batch.issues.length > 0 || !batch.rows.length
            }
            onClick={() => onPublish(batch.id, batch.sourceHash)}
          >
            确认发布此批次
          </Button>
        </div>
      )}
    </section>
  );
}
export function DraftForm({
  board,
  busy,
  onSave,
}: {
  board: TradeBoard;
  busy: boolean;
  onSave: (payload: Extract<TradeWrite, { method: "quote.createV1" }>["payload"]) => void;
}) {
  const [buyer, setBuyer] = useState("");
  const [inquiry, setInquiry] = useState("");
  const [payment, setPayment] = useState("");
  const [delivery, setDelivery] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const message = useMessage();
  return (
    <section className="panel space-y-4">
      <h2>3 · 建立报价草稿 V1</h2>
      <p className="description">
        仅使用已发布资料。按商品数量档位核价，每行 HALF_UP
        舍入后求和；仅计算商品金额，未含运税费。来源、场景和计算依据随草稿冻结。
      </p>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const result = QuoteInputSchema.safeParse({
            scenarioId: board.scenario?.id,
            buyer,
            inquiry,
            payment,
            delivery,
            lines: board.products
              .filter((p) => quantities[p.id] !== undefined)
              .map((p) => ({ productId: p.id, quantity: quantities[p.id], unit: p.unit })),
          });
          if (!result.success) {
            message.error(
              "请保存场景，填写客户与询盘，选择至少一行商品并输入大于零的数量（最多9位整数4位小数）。",
            );
            return;
          }
          onSave(result.data);
        }}
      >
        <label htmlFor="buyer">客户名称</label>
        <input
          id="buyer"
          required
          maxLength={200}
          value={buyer}
          onChange={(event) => setBuyer(event.target.value)}
        />
        <label htmlFor="inquiry">原始询盘</label>
        <textarea
          id="inquiry"
          required
          rows={3}
          maxLength={8000}
          value={inquiry}
          onChange={(event) => setInquiry(event.target.value)}
        />
        {board.products.length === 0 ? (
          <p>请先预览并确认发布商品资料。</p>
        ) : (
          <div className="table-scroll">
            <table>
              <caption className="sr-only">已发布商品选价</caption>
              <thead>
                <tr>
                  <th>选择商品</th>
                  <th>数量</th>
                  <th>单位 / 币种</th>
                  <th>档位起点 → 单价</th>
                </tr>
              </thead>
              <tbody>
                {board.products.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="w-auto"
                          checked={quantities[product.id] !== undefined}
                          onChange={(event) =>
                            setQuantities((prior) => {
                              const next = { ...prior };
                              if (event.target.checked) next[product.id] = "1";
                              else delete next[product.id];
                              return next;
                            })
                          }
                          aria-label={`选择 ${product.sku}`}
                        />
                        {product.sku} · {product.name}
                      </label>
                    </td>
                    <td>
                      <input
                        aria-label={`${product.sku} 数量`}
                        inputMode="decimal"
                        disabled={quantities[product.id] === undefined}
                        value={quantities[product.id] ?? ""}
                        onChange={(event) =>
                          setQuantities({ ...quantities, [product.id]: event.target.value })
                        }
                      />
                    </td>
                    <td>
                      {product.unit} / {product.currency}
                    </td>
                    <td>
                      {product.tiers
                        .map((tier) => `${tier.minQuantity} → ${tier.unitPrice ?? "未知"}`)
                        .join("；")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="payment">付款条款（留空为待确认）</label>
            <input
              id="payment"
              value={payment}
              maxLength={1000}
              onChange={(event) => setPayment(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="delivery">交期与交货条件（留空为待确认）</label>
            <input
              id="delivery"
              value={delivery}
              maxLength={1000}
              onChange={(event) => setDelivery(event.target.value)}
            />
          </div>
        </div>
        <Button disabled={busy || !board.scenario || !board.products.length} type="submit">
          计算并保存报价 V1
        </Button>
      </form>
    </section>
  );
}
export function SavedQuote({ quote }: { quote: QuoteSnapshot }) {
  return (
    <article className="space-y-4" aria-label="已保存报价详情">
      <div className="section-heading">
        <h3>
          {quote.buyer} · 草稿 V{quote.version}
        </h3>
        <span className="status-badge">已保存 · 未审核</span>
      </div>
      <p className="break-all">
        {quote.number} · {quote.createdAt}
      </p>
      <p>
        场景版本 {quote.scenario.version} · {quote.scenario.platform} · {quote.scenario.market} ·{" "}
        {quote.scenario.locales.join(" / ")}
      </p>
      <p className="whitespace-pre-wrap">询盘：{quote.inquiry}</p>
      <div className="table-scroll">
        <table>
          <caption className="sr-only">报价版本明细</caption>
          <thead>
            <tr>
              <th>商品 / 来源</th>
              <th>数量 / 单位</th>
              <th>档位 / 单价</th>
              <th>行金额</th>
            </tr>
          </thead>
          <tbody>
            {quote.lines.map((line) => (
              <tr key={line.product.id}>
                <td>
                  {line.product.sku} · {line.product.name}
                  <br />
                  <small>
                    {line.product.sourceName} · 原文行{" "}
                    {line.product.tiers.find((tier) => tier.minQuantity === line.tierMin)
                      ?.sourceRow ?? "未命中"}{" "}
                    · {line.product.sourceStatus === "synthetic" ? "合成" : "用户资料"}
                  </small>
                </td>
                <td className="numeric">
                  {line.quantity} {line.product.unit}
                </td>
                <td className="numeric">
                  {line.tierMin ?? "未命中"} / {line.unitPrice ?? "未知"}
                </td>
                <td className="numeric">
                  {line.amount ?? "未知"} {quote.currency}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="basis">
        <span>商品合计（未含运税费）</span>
        <strong data-testid="goods-total">
          {quote.goodsTotal ?? "未知"} {quote.currency}
        </strong>
        <small>未含运费、税费及其他费用</small>
      </div>
      <p>
        付款条款：{quote.payment || "待确认"} · 交期与交货条件：{quote.delivery || "待确认"}
      </p>
      <div className="sample-note">
        <h3>待确认事项</h3>
        <ul>
          {quote.pending.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <details>
        <summary>冻结的来源与计算依据</summary>
        {quote.lines.map((line) => (
          <p className="break-all" key={line.product.id}>
            {line.product.sku} · 来源 {line.product.sourceHash} · 有效至 {line.product.validUntil} ·{" "}
            {line.reason ??
              `数量 ${line.quantity} × 单价 ${line.unitPrice} = ${line.amount} ${quote.currency}`}
          </p>
        ))}
        <p>{quote.calculationPolicy}</p>
      </details>
      <Button disabled title="当前报价暂不可提交审核">
        提交人工审核
      </Button>
    </article>
  );
}
