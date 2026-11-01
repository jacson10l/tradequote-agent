import { describe, expect, it } from "vitest";
import { buildWikiGraph, layoutGraph } from "./knowledge-graph-data";

describe("real wiki graph", () => {
  it("creates only resolvable links, removes self/duplicate edges, and keeps isolated documents", () => {
    const graph = buildWikiGraph({
      "/wiki/A.md": "---\ntitle: Alpha\n---\n# A\n[[B]] [[B]] [[A]] [[Missing]]",
      "/wiki/B.md": "# B\n[[A]]",
      "/wiki/C.md": "# C",
    });
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toMatchObject({ source: "/wiki/A.md", target: "/wiki/B.md" });
    expect(graph.nodes[0]?.label).toBe("Alpha");
    const positions = layoutGraph(graph);
    expect(positions.size).toBe(3);
    expect([...positions.values()].every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(
      true,
    );
    expect(layoutGraph(graph)).toEqual(positions);
  });
});
