import { useQuery } from "@tanstack/react-query";
import type { DesktopClient } from "@tradequote/contracts";
import { useMemo, useRef, useState } from "react";
import { Button } from "../shared/button";
import {
  buildBusinessGraph,
  buildWikiGraph,
  type KnowledgeGraph,
  layoutGraph,
} from "./knowledge-graph-data";
import "./knowledge-graph.css";

const documents = import.meta.glob<string>("../../../../../../wiki-project/wiki/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});
const engineering = buildWikiGraph(documents);
const empty: KnowledgeGraph = { nodes: [], edges: [] };
export function KnowledgeGraphPage({ client }: { client: DesktopClient }) {
  const [scope, setScope] = useState("engineering");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const query = useQuery({
    queryKey: ["knowledge-graph"],
    enabled: scope === "business",
    retry: false,
    queryFn: async () => {
      const board = await client.getTrade();
      if (!board.ok) throw new Error(board.error.message);
      const quotes = board.data.quotes.slice(0, 30);
      const results = await Promise.all(
        quotes.map((q) =>
          client.getQuoteChecks({
            schemaVersion: 1,
            requestId: crypto.randomUUID(),
            method: "quote.getChecks",
            payload: { revisionId: q.id },
          }),
        ),
      );
      const reports = results.flatMap((r) => {
        if (!r.ok) throw new Error(r.error.message);
        return r.data;
      });
      return { ...buildBusinessGraph(quotes, reports), limited: board.data.quotes.length > 30 };
    },
  });
  const graph = scope === "engineering" ? engineering : (query.data ?? empty);
  const positions = useMemo(() => layoutGraph(graph), [graph]);
  const degree = useMemo(() => {
    const result = new Map<string, number>();
    for (const e of graph.edges) {
      result.set(e.source, (result.get(e.source) ?? 0) + 1);
      result.set(e.target, (result.get(e.target) ?? 0) + 1);
    }
    return result;
  }, [graph]);
  const current = graph.nodes.find((n) => n.id === selected);
  const neighbors = new Set(
    graph.edges.flatMap((e) =>
      e.source === selected ? [e.target] : e.target === selected ? [e.source] : [],
    ),
  );
  const matches = graph.nodes.filter((n) =>
    n.label.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const active = (id: string) =>
    selected
      ? selected === id || neighbors.has(id)
      : search
        ? matches.some((n) => n.id === id)
        : true;
  const reset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  const select = (id: string) => {
    setSelected(id);
    reset();
  };
  return (
    <section className="knowledge-graph-page" aria-label="知识关系图谱">
      <h1 className="sr-only">知识关系图谱</h1>
      <div className="kg-toolbar">
        <label>
          图谱范围{" "}
          <select
            aria-label="图谱范围"
            value={scope}
            onChange={(e) => {
              setScope(e.target.value);
              setSelected("");
              reset();
            }}
          >
            <option value="engineering">工程 Wiki · 实际文档</option>
            <option value="business">企业知识 · 报价引用</option>
          </select>
        </label>
        <input
          aria-label="搜索知识节点"
          placeholder="搜索节点名称…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setSelected("");
          }}
        />
        <span>
          {graph.nodes.length} 个节点 · {graph.edges.length} 条关联
        </span>
        <Button
          variant="outline"
          onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
          aria-label="放大图谱"
        >
          ＋
        </Button>
        <Button
          variant="outline"
          onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}
          aria-label="缩小图谱"
        >
          −
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            reset();
            setSelected("");
            setSearch("");
          }}
        >
          重置视图
        </Button>
        {scope === "business" && (
          <Button
            variant="outline"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            刷新引用
          </Button>
        )}
      </div>
      <p className="description">
        {scope === "engineering"
          ? "来自当前版本工程 Wiki 的真实文档与双向链接；用于展示项目知识结构，不代表企业业务知识已被采用。"
          : "显示最近 30 个报价版本中已保存的 Wiki 引用和来源关系；尚未被报价引用的知识候选暂不包含。"}{" "}
        拖动画布平移，点击节点查看邻居与依据。
      </p>
      {query.isError && scope === "business" && <p role="alert">{query.error.message}</p>}
      {query.isFetching && scope === "business" && <p role="status">正在读取实际报价引用…</p>}
      <div className="kg-body">
        <div className="kg-canvas">
          <svg
            viewBox="0 0 1100 700"
            role="img"
            aria-label="可交互知识关系网络"
            onPointerDown={(e) => {
              drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              const scale = 1100 / e.currentTarget.getBoundingClientRect().width;
              setPan({
                x: drag.current.px + (e.clientX - drag.current.x) * scale,
                y: drag.current.py + (e.clientY - drag.current.y) * scale,
              });
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          >
            <title>知识关系网络，可通过右侧节点列表使用键盘选择</title>
            <g
              transform={`translate(${550 + pan.x} ${350 + pan.y}) scale(${zoom}) translate(-550 -350)`}
            >
              {graph.edges.map((e) => {
                const a = positions.get(e.source)!;
                const b = positions.get(e.target)!;
                const lit = selected && (e.source === selected || e.target === selected);
                return (
                  <line
                    key={`${e.source}:${e.target}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={lit ? "var(--action)" : "var(--text-muted)"}
                    strokeWidth={lit ? 1.7 : 0.65}
                    opacity={lit ? 0.95 : selected ? 0.12 : 0.3}
                  />
                );
              })}
              {graph.nodes.map((n) => {
                const p = positions.get(n.id)!;
                const lit = active(n.id);
                const label = !!selected
                  ? lit
                  : !!search
                    ? lit
                    : (degree.get(n.id) ?? 0) >= 10 || graph.nodes.length < 35;
                return (
                  <g
                    key={n.id}
                    className="kg-node"
                    opacity={lit ? 1 : 0.18}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => select(n.id)}
                  >
                    <title>{n.label}</title>
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={4 + Math.min(10, Math.sqrt(degree.get(n.id) ?? 0) * 1.3)}
                      fill={
                        selected === n.id
                          ? "var(--action)"
                          : n.kind === "source"
                            ? "var(--success)"
                            : n.kind === "quote"
                              ? "var(--action)"
                              : "var(--text-muted)"
                      }
                    />
                    <text
                      x={p.x + 12}
                      y={p.y + 4}
                      className={label ? "kg-label-visible" : "kg-label-hover"}
                    >
                      {n.label.length > 28 ? `${n.label.slice(0, 28)}…` : n.label}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
          {graph.nodes.length === 0 && !query.isFetching && !query.isError && (
            <div className="kg-empty">
              暂无可展示的报价知识引用
              <br />
              <small>知识审核发布并被报价采用后，这里会出现关系。</small>
            </div>
          )}
          <div className="kg-legend">
            <span>● 知识</span>
            <span style={{ color: "var(--success)" }}>● 来源</span>
            <span style={{ color: "var(--action)" }}>● 报价</span>
            <span>{Math.round(zoom * 100)}%</span>
          </div>
        </div>
        <aside className="kg-details" aria-label="节点与关联详情">
          <h2>{current?.label ?? "浏览知识节点"}</h2>
          {current ? (
            <>
              <p className="description">
                {current.kind === "wiki"
                  ? "知识文档"
                  : current.kind === "source"
                    ? "固定来源"
                    : "报价版本"}{" "}
                · {neighbors.size} 个关联节点
              </p>
              <Button variant="outline" onClick={() => setSelected("")}>
                返回全部节点
              </Button>
              <pre>{current.detail}</pre>
              <h3>关联节点</h3>
              {graph.nodes
                .filter((n) => neighbors.has(n.id))
                .map((n) => (
                  <button
                    type="button"
                    className="kg-list-item"
                    key={n.id}
                    onClick={() => select(n.id)}
                  >
                    {n.label}
                  </button>
                ))}
            </>
          ) : (
            <>
              <p className="description">
                点击节点可突出相邻关系。搜索仅高亮匹配项，不会创建虚构关联。
              </p>
              {matches.map((n) => (
                <button
                  type="button"
                  className="kg-list-item"
                  key={n.id}
                  onClick={() => select(n.id)}
                >
                  {n.label}
                  <small>{degree.get(n.id) ?? 0} 条关联</small>
                </button>
              ))}
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
