import { useQuery } from "@tanstack/react-query";
import type { DesktopClient } from "@tradequote/contracts";
import { useMemo, useRef, useState } from "react";
import { Button } from "../shared/button";
import { buildEnterpriseGraph, type KnowledgeGraph, layoutGraph } from "./knowledge-graph-data";
import "./knowledge-graph.css";
import { Link } from "react-router-dom";
import { EnterpriseKnowledgePanel } from "./enterprise-knowledge";

const empty: KnowledgeGraph = { nodes: [], edges: [] };
export function KnowledgeGraphPage({ client }: { client: DesktopClient }) {
  const [scope, setScope] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const query = useQuery({
    queryKey: ["enterprise-knowledge"],
    retry: false,
    queryFn: async () => {
      const result = await client.executeKnowledgeDesktop({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        method: "knowledge.overview",
        payload: {},
      });
      if (!result.ok) throw new Error(result.error.message);
      if (result.data.kind !== "knowledgeOverview") throw new Error("知识列表返回格式异常");
      const board = await client.getTrade();
      if (!board.ok) throw new Error(board.error.message);
      const quotes = board.data.quotes.slice(0, 30);
      const checks = await Promise.all(
        quotes.map((q) =>
          client.getQuoteChecks({
            schemaVersion: 1,
            requestId: crypto.randomUUID(),
            method: "quote.getChecks",
            payload: { revisionId: q.id },
          }),
        ),
      );
      const reports = checks.flatMap((r) => {
        if (!r.ok) throw new Error(r.error.message);
        return r.data;
      });
      return { ...result.data, quotes, reports };
    },
  });
  const graph = useMemo(() => {
    if (!query.data) return empty;
    const records =
      scope === "published"
        ? query.data.records.filter((r) => r.lifecycle.state === "published")
        : query.data.records;
    const sources =
      scope === "published"
        ? query.data.sources.filter((s) =>
            records.some((r) =>
              r.revision.content.sourceRefs.some(
                (ref) => ref.sourceRevisionId === s.sourceRevisionId,
              ),
            ),
          )
        : query.data.sources;
    return buildEnterpriseGraph(sources, records, query.data.quotes, query.data.reports);
  }, [scope, query.data]);
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
            <option value="all">企业知识 · 全部资料与候选</option>
            <option value="published">企业知识 · 已发布</option>
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
        {
          <Button
            variant="outline"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            刷新知识
          </Button>
        }
      </div>
      <p className="description">
        当前工作区的企业资料、Wiki
        候选与固定来源。待审核内容可以浏览，只有人工发布的适用知识可被报价采用。拖动画布平移，点击节点查看原文与关联。
      </p>
      {query.isError && (
        <p role="alert">
          {query.error.message} <Link to="/workspace">打开工作区设置</Link>
        </p>
      )}
      {query.isFetching && <p role="status">正在读取企业知识…</p>}
      {query.data?.hasMore && (
        <p role="status">当前显示最近300个来源和400个知识版本，较早版本暂未展示。</p>
      )}
      {query.data && (
        <EnterpriseKnowledgePanel
          client={client}
          sources={query.data.sources}
          records={query.data.records}
          onRefresh={() => query.refetch()}
        />
      )}

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
              暂无企业知识资料
              <br />
              <small>请录入资料、导入CSV或添加合成演示资料。</small>
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
                    : current.kind === "scope"
                      ? "适用范围"
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
