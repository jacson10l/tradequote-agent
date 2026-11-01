import type {
  CheckReport,
  QuoteSnapshot,
  WikiRevisionRecord,
  WikiSourceRevision,
} from "@tradequote/contracts";
export type GraphNode = {
  id: string;
  label: string;
  kind: "wiki" | "source" | "quote" | "scope";
  detail: string;
};
export type KnowledgeGraph = { nodes: GraphNode[]; edges: { source: string; target: string }[] };
export function buildBusinessGraph(
  quotes: QuoteSnapshot[],
  reports: CheckReport[],
): KnowledgeGraph {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, KnowledgeGraph["edges"][number]>();
  const link = (source: string, target: string) =>
    edges.set(`${source}:${target}`, { source, target });
  for (const q of quotes)
    nodes.set(q.id, {
      id: q.id,
      label: `${q.buyer} · V${q.version}`,
      kind: "quote",
      detail: `未审核报价 V${q.version}\n商品合计：${q.goodsTotal ?? "未知"} ${q.currency}\n报价版本：${q.id}`,
    });
  for (const report of reports) {
    if (!nodes.has(report.revisionId)) continue;
    for (const c of report.wikiCitations ?? []) {
      const evidence = report.issues
        .flatMap((i) => i.evidence)
        .find((e) => e.revisionId === c.revisionId);
      nodes.set(c.revisionId, {
        id: c.revisionId,
        label: `知识 V${c.version} · ${c.documentId.slice(0, 8)}`,
        kind: "wiki",
        detail: `已被报价引用的知识版本\n${c.revisionId}\n正文哈希：${c.contentHash}\n${evidence?.sourceLabel ?? "通过的规则也会保留引用"}`,
      });
      link(report.revisionId, c.revisionId);
      for (const ref of c.sourceRefs) {
        nodes.set(ref.sourceRevisionId, {
          id: ref.sourceRevisionId,
          label:
            report.issues.flatMap((i) => i.evidence).find((e) => e.sourceHash === ref.artifactHash)
              ?.sourceLabel ?? `来源 V${ref.sourceVersion} · ${ref.sourceId.slice(0, 8)}`,
          kind: "source",
          detail: `固定来源版本：${ref.sourceRevisionId}\nSHA-256：${ref.artifactHash}\n摘录位置：${ref.location.start}–${ref.location.end}\n摘录哈希：${ref.excerptHash}`,
        });
        link(c.revisionId, ref.sourceRevisionId);
      }
    }
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}
/** Deterministic bounded force layout; no dependency, timer or random animation. */
export function layoutGraph(graph: KnowledgeGraph) {
  const positions = new Map<string, { x: number; y: number }>();
  const count = graph.nodes.length;
  graph.nodes.forEach((n, i) => {
    const a = i * 2.399963229728653;
    const r = 35 + 250 * Math.sqrt((i + 1) / Math.max(count, 1));
    positions.set(n.id, { x: 550 + Math.cos(a) * r * 1.45, y: 350 + Math.sin(a) * r });
  });
  for (let iteration = 0; iteration < 90; iteration++) {
    const deltas = new Map(graph.nodes.map((n) => [n.id, { x: 0, y: 0 }]));
    for (let i = 0; i < count; i++)
      for (let j = i + 1; j < count; j++) {
        const a = positions.get(graph.nodes[i]!.id)!;
        const b = positions.get(graph.nodes[j]!.id)!;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distance = Math.max(dx * dx + dy * dy, 25);
        const force = Math.min(9, 1800 / distance) / Math.sqrt(distance);
        const da = deltas.get(graph.nodes[i]!.id)!;
        const db = deltas.get(graph.nodes[j]!.id)!;
        da.x += dx * force;
        da.y += dy * force;
        db.x -= dx * force;
        db.y -= dy * force;
      }
    for (const edge of graph.edges) {
      const a = positions.get(edge.source);
      const b = positions.get(edge.target);
      if (!a || !b) continue;
      const dx = (b.x - a.x) * 0.012;
      const dy = (b.y - a.y) * 0.012;
      deltas.get(edge.source)!.x += dx;
      deltas.get(edge.source)!.y += dy;
      deltas.get(edge.target)!.x -= dx;
      deltas.get(edge.target)!.y -= dy;
    }
    for (const [id, p] of positions) {
      const d = deltas.get(id)!;
      const rate = 0.08 * (1 - iteration / 110);
      p.x = Math.max(45, Math.min(1055, p.x + (d.x + (550 - p.x) * 0.12) * rate));
      p.y = Math.max(45, Math.min(655, p.y + (d.y + (350 - p.y) * 0.12) * rate));
    }
  }
  if (count > 1) {
    const points = [...positions.values()];
    const extentX = Math.max(...points.map((p) => Math.abs(p.x - 550)), 1);
    const extentY = Math.max(...points.map((p) => Math.abs(p.y - 350)), 1);
    const fit = Math.min(450 / extentX, 280 / extentY);
    for (const p of points) {
      p.x = 550 + (p.x - 550) * fit;
      p.y = 350 + (p.y - 350) * fit;
    }
  }
  return positions;
}

export function buildEnterpriseGraph(
  sources: WikiSourceRevision[],
  records: WikiRevisionRecord[],
  quotes: QuoteSnapshot[] = [],
  reports: CheckReport[] = [],
): KnowledgeGraph {
  const graph = buildBusinessGraph(quotes, reports);
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const edges = new Map(graph.edges.map((e) => [`${e.source}:${e.target}`, e]));
  const link = (source: string, target: string) =>
    edges.set(`${source}:${target}`, { source, target });
  const states = {
    candidate: "待审核",
    approved: "已批准待发布",
    published: "已发布",
    rejected: "已拒绝",
    withdrawn: "已撤回",
  };
  for (const source of sources)
    nodes.set(source.sourceRevisionId, {
      id: source.sourceRevisionId,
      label: `来源 · ${source.label}`,
      kind: "source",
      detail: `${source.sourceStatus === "synthetic" ? "合成演示" : "用户提供"} · V${source.version} · ${source.validity.status === "confirmed" ? "已确认有效性" : "有效性待核实"}\n${source.permissionNote}\n\n${source.sourceText}`,
    });
  for (const { revision: r, lifecycle } of records) {
    const labels = r.content.sourceRefs.map(
      (ref) => sources.find((s) => s.sourceRevisionId === ref.sourceRevisionId)?.sourceStatus,
    );
    nodes.set(r.revisionId, {
      id: r.revisionId,
      label: r.content.title,
      kind: "wiki",
      detail: `${states[lifecycle.state]} · V${r.version} · ${labels.includes("synthetic") ? "含合成演示来源" : "用户来源/历史引用"}\n适用范围：${JSON.stringify(r.content.scope)}\n\n${r.content.markdown}`,
    });
  }
  for (const { revision: r } of records) {
    for (const [dimension, values] of Object.entries(r.content.scope))
      for (const value of values) {
        const id = `scope:${dimension}:${value}`;
        const label =
          dimension === "categories" ? "品类" : dimension === "markets" ? "市场" : "平台";
        nodes.set(id, {
          id,
          label: `${label} · ${value}`,
          kind: "scope",
          detail: `来自知识版本明确登记的${label}字段：${value}。范围关联不代表资料已经审核，也不代表推断出的商品关系。`,
        });
        link(r.revisionId, id);
      }

    for (const ref of r.content.sourceRefs)
      if (nodes.has(ref.sourceRevisionId)) link(r.revisionId, ref.sourceRevisionId);
    for (const rel of r.content.relations)
      if (nodes.has(rel.revisionId)) link(r.revisionId, rel.revisionId);
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}
