import { describe, expect, it } from "vitest";
import {
  failure,
  KnowledgeCommandSchema,
  KnowledgeDraftInputSchema,
  KnowledgeEvidenceSchema,
  KnowledgeListResultSchema,
  KnowledgeResultSchema,
  KnowledgeRevisionSchema,
  KnowledgeScopeSchema,
  RuleDefinitionSchema,
} from "./index";
import { mockWorkspace, mockKnowledgeRevision as revision } from "./mock";

const draft = { ...revision.content, documentId: revision.documentId, expectedVersion: 0 };
const read = { schemaVersion: 1, requestId: mockWorkspace.id };
const write = { ...read, idempotencyKey: revision.documentId };
describe("B00 knowledge publication boundary", () => {
  it("accepts universal dimensions and bounded explicit scopes without locking category or market", () => {
    for (const scope of [
      { platforms: [], markets: [], categories: [] },
      { platforms: ["RFQ", "Email"], markets: ["Brazil"], categories: ["板材", "紧固件"] },
    ])
      expect(KnowledgeScopeSchema.parse(scope)).toEqual(scope);
    for (const scope of [
      { platforms: ["RFQ", " RFQ "], markets: [], categories: [] },
      { platforms: [" "], markets: [], categories: [] },
      { platforms: Array.from({ length: 21 }, (_, n) => `${n}`), markets: [], categories: [] },
      { platforms: [], markets: [], categories: ["x".repeat(201)] },
      { platforms: [], markets: [], categories: [], wildcard: true },
    ])
      expect(KnowledgeScopeSchema.safeParse(scope).success).toBe(false);
  });
  it("rejects source, version, authority and rule execution injection before persistence", () => {
    expect(KnowledgeDraftInputSchema.parse(draft)).toEqual(draft);
    for (const value of [
      { ...draft, expectedVersion: -1 },
      { ...draft, expectedVersion: 0.5 },
      { ...draft, sourceHash: revision.sourceHash },
      { ...draft, status: "published" },
      { ...draft, publishedAt: revision.createdAt },
      { ...draft, actorId: "admin" },
      { ...draft, rules: [] },
      { ...draft, rules: [...draft.rules, ...draft.rules] },
      { ...draft, sourceText: "x".repeat(32001) },
      { ...draft, location: { kind: "pdf", page: 1, textSpanId: "1" } },
      { ...draft, location: { kind: "text", start: 0, end: 9999 } },
    ])
      expect(KnowledgeDraftInputSchema.safeParse(value).success).toBe(false);
    const rule = draft.rules[0];
    expect(
      RuleDefinitionSchema.safeParse({
        ...rule,
        condition: { kind: "forbidden_literal", literal: ".*" },
      }).success,
    ).toBe(true);
    for (const condition of [
      { kind: "required", literal: "x" },
      { kind: "regex", pattern: ".*" },
      { kind: "forbidden_literal", literal: "" },
      { kind: "required", script: "return true" },
    ])
      expect(RuleDefinitionSchema.safeParse({ ...rule, condition }).success).toBe(false);
    expect(RuleDefinitionSchema.safeParse({ ...rule, field: "goodsTotal" }).success).toBe(false);
  });
  it("preserves source whitespace and UTF-16 positions; rejects split surrogate pairs", () => {
    const input = {
      ...draft,
      sourceText: " 😀条款 ",
      location: { kind: "text", start: 1, end: 3 },
    };
    expect(KnowledgeDraftInputSchema.parse(input).sourceText).toBe(input.sourceText);
    for (const [start, end] of [
      [1, 2],
      [2, 3],
      [3, 3],
      [4, 3],
      [-1, 1],
    ])
      expect(
        KnowledgeDraftInputSchema.safeParse({ ...input, location: { kind: "text", start, end } })
          .success,
      ).toBe(false);
  });
  it("distinguishes staged and published state and refuses staged query results", () => {
    const staged = { ...revision, status: "staged", publishedAt: null };
    expect(KnowledgeRevisionSchema.safeParse(staged).success).toBe(true);
    expect(KnowledgeRevisionSchema.parse(revision)).toEqual(revision);
    for (const invalid of [
      { ...revision, publishedAt: null },
      { ...staged, publishedAt: revision.createdAt },
      { ...revision, publishedAt: "2020-01-01T00:00:00.000Z" },
      { ...revision, content: { ...revision.content, expectedVersion: 0 } },
    ])
      expect(KnowledgeRevisionSchema.safeParse(invalid).success).toBe(false);
    const result = {
      ok: true,
      data: { kind: "list", revisions: [revision] },
      warnings: [],
      evidenceIds: [],
    };
    expect(KnowledgeListResultSchema.safeParse(result).success).toBe(true);
    expect(
      KnowledgeListResultSchema.safeParse({
        ...result,
        data: { kind: "list", revisions: [staged] },
      }).success,
    ).toBe(false);
    expect(KnowledgeResultSchema.parse(failure("NOT_FOUND", "未找到资料"))).toMatchObject({
      ok: false,
    });
    expect(
      KnowledgeResultSchema.safeParse({ ...result, data: { kind: "revision", revision: null } })
        .success,
    ).toBe(false);
  });
  it("separates read/write envelopes and keeps exact source evidence", () => {
    const commands = [
      { ...write, method: "knowledge.stage", payload: draft },
      {
        ...write,
        method: "knowledge.publish",
        payload: { revisionId: revision.revisionId, sourceHash: revision.sourceHash },
      },
      {
        ...read,
        method: "knowledge.query",
        payload: {
          scope: { platform: "RFQ", market: "Brazil", category: "板材" },
          at: revision.createdAt,
        },
      },
      { ...read, method: "knowledge.getRevision", payload: { revisionId: revision.revisionId } },
    ];
    for (const command of commands) {
      expect(KnowledgeCommandSchema.safeParse(command).success).toBe(true);
      expect(KnowledgeCommandSchema.safeParse({ ...command, origin: "human_ui" }).success).toBe(
        false,
      );
      const { idempotencyKey: _key, ...noKey } = { idempotencyKey: undefined, ...command };
      if (command.method === "knowledge.stage" || command.method === "knowledge.publish")
        expect(KnowledgeCommandSchema.safeParse(noKey).success).toBe(false);
      else
        expect(
          KnowledgeCommandSchema.safeParse({ ...command, idempotencyKey: revision.documentId })
            .success,
        ).toBe(false);
    }
    expect(
      KnowledgeEvidenceSchema.parse({
        revisionId: revision.revisionId,
        ruleId: draft.rules[0]?.ruleId,
        sourceHash: revision.sourceHash,
        sourceLabel: draft.sourceLabel,
        sourceStatus: "synthetic",
        location: draft.location,
      }).sourceStatus,
    ).toBe("synthetic");
  });
});
