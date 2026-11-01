import type { CheckReport, QuoteSnapshot } from "@tradequote/contracts";
export type GraphNode = {
  id: string;
  label: string;
  kind: "wiki" | "source" | "quote";
  detail: string;
};
export type KnowledgeGraph = { nodes: GraphNode[]; edges: { source: string; target: string }[] };
export function buildWikiGraph(files: Record<string, string>): KnowledgeGraph {
  const nodes = Object.entries(files)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, text]) => ({
      id,
      label:
        /^title:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? id.split("/").at(-1)!.replace(/\.md$/, ""),
      kind: "wiki" as const,
      detail: text.replace(/^---\n[\s\S]*?\n---\s*/, "").slice(0, 6000),
    }));
  const byName = new Map(
    nodes.flatMap((n) => [
      [n.label, n.id],
      [n.id.split("/").at(-1)!.replace(/\.md$/, ""), n.id],
    ]),
  );
  const edges: KnowledgeGraph["edges"] = [];
  const seen = new Set<string>();
  for (const [id, text] of Object.entries(files))
    for (const match of text.matchAll(/\[\[([^\]|#]+)(?:[^\]]*)\]\]/g)) {
      const target = byName.get(match[1]!);
      if (!target || target === id) continue;
      const pair = [id, target].sort();
      const key = JSON.stringify(pair);
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ source: pair[0]!, target: pair[1]! });
    }
  return { nodes, edges };
}
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
