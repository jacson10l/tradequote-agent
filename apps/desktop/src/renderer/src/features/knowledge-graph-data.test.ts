import type { WikiRevision, WikiSourceRevision } from "@tradequote/contracts";
import { mockWikiStageInput } from "@tradequote/contracts/mock";

const ref = mockWikiStageInput.content.sourceRefs[0]!;
const workspaceId = crypto.randomUUID(),
  createdAt = new Date().toISOString();
const mockWikiRevision: WikiRevision = {
  workspaceId,
  revisionId: crypto.randomUUID(),
  documentId: mockWikiStageInput.documentId,
  version: 1,
  parentRevisionId: null,
  content: mockWikiStageInput.content,
  artifactId: ref.artifactHash,
  contentHash: ref.artifactHash,
  sourceSetHash: ref.artifactHash,
  createdAt,
};
const mockWikiSourceRevision: WikiSourceRevision = {
  workspaceId,
  sourceId: ref.sourceId,
  sourceRevisionId: ref.sourceRevisionId,
  version: 1,
  parentRevisionId: null,
  label: "合成原文",
  sourceStatus: "synthetic",
  mediaType: "text/plain",
  sourceText: "测试原文",
  acquiredAt: createdAt,
  sourceUri: null,
  permissionNote: "仅测试",
  validity: { status: "unknown", validFrom: null, validUntil: null },
  artifactId: ref.artifactHash,
  artifactHash: ref.artifactHash,
  createdAt,
};

import { describe, expect, it } from "vitest";
import { buildEnterpriseGraph, layoutGraph } from "./knowledge-graph-data";

describe("enterprise graph", () => {
  it("uses actual enterprise titles and fixed source links, preserving candidate state", () => {
    const revision = mockWikiRevision;
    const graph = buildEnterpriseGraph(
      [mockWikiSourceRevision],
      [
        {
          revision,
          lifecycle: {
            revisionId: revision.revisionId,
            lifecycleVersion: 1,
            state: "candidate",
            review: null,
            publication: null,
          },
        },
      ],
    );
    expect(graph.nodes.find((n) => n.id === revision.revisionId)?.label).toBe(
      revision.content.title,
    );
    expect(graph.nodes.find((n) => n.id === revision.revisionId)?.detail).toContain("待审核");
    expect(graph.edges.length).toBeGreaterThan(0);
    expect(layoutGraph(graph)).toEqual(layoutGraph(graph));
    expect(
      [...layoutGraph(graph).values()].every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
    ).toBe(true);
  });
  it("does not fabricate an engineering graph for empty business storage", () => {
    expect(buildEnterpriseGraph([], [])).toEqual({ nodes: [], edges: [] });
  });
});
