import {
  type AgentRun,
  type CheckReport,
  type DesktopClient,
  failure,
  type KnowledgeRevision,
  ModelEvaluationCommandSchema,
  success,
  unavailableFirstBatchClient,
  type Workspace,
} from "./index";
export const mockWorkspace: Workspace = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "合成演示工作区",
  version: 1,
  createdAt: "2026-10-21T00:00:00.000Z",
};
/** Read-only UI fixture. No persistence or successful fake writes. */
export const readonlyMockClient: DesktopClient = {
  modelEvaluation: async (command) => ({
    ok: false,
    error: {
      code: ModelEvaluationCommandSchema.safeParse(command).success
        ? "CAPABILITY_UNAVAILABLE"
        : "VALIDATION_ERROR",
      message: "请在正式桌面模型设置中运行评估",
      retryable: false,
      issues: [],
    },
  }),
  ...unavailableFirstBatchClient,
  readAgent: async () =>
    failure("CAPABILITY_UNAVAILABLE", "只读样例不能调用模型，请在桌面应用使用只读助手"),
  understandInquiry: async () => failure("CAPABILITY_UNAVAILABLE", "只读样例不能调用模型"),
  reviseQuote: async () => failure("CAPABILITY_UNAVAILABLE", "只读样例不能调用模型"),
  modelSettings: async () => failure("CAPABILITY_UNAVAILABLE", "请在桌面应用中配置模型"),
  getWorkspace: async () => success(mockWorkspace),
  getTrade: async () => ({
    ok: true,
    data: { scenario: null, batches: [], products: [], quotes: [], turns: [] },
    warnings: [],
    evidenceIds: [],
  }),
  saveScenario: async () => failure("CAPABILITY_UNAVAILABLE", "只读样例不能保存"),
  stageCatalog: async () => failure("CAPABILITY_UNAVAILABLE", "只读样例不能保存"),
  publishCatalog: async () => failure("CAPABILITY_UNAVAILABLE", "只读样例不能保存"),
  createQuoteV1: async () => failure("CAPABILITY_UNAVAILABLE", "只读样例不能保存"),
  pickCatalogCsv: async () => ({ status: "cancelled" }),
  createWorkspace: async () => failure("CAPABILITY_UNAVAILABLE", "只读样例不能保存"),
  renameWorkspace: async () => failure("CAPABILITY_UNAVAILABLE", "只读样例不能保存"),
};

/** Contract fixtures for review and later adapters; never claim a saved quote/run. */
export const mockRevisionInput = {
  quoteId: mockWorkspace.id,
  baseRevisionId: "00000000-0000-4000-8000-000000000002",
  expectedAggregateVersion: 1,
  typedPatch: [
    {
      op: "setQuantity",
      lineId: "00000000-0000-4000-8000-000000000003",
      quantity: { value: "120", unitId: "piece" },
    },
  ],
  reason: "合成契约样例",
} satisfies import("./index").QuoteRevisionInput;
export const mockRunEvent = {
  schemaVersion: 1,
  eventId: mockWorkspace.id,
  runId: mockWorkspace.id,
  seq: 1,
  timestamp: mockWorkspace.createdAt,
  type: "run.started",
  payload: { baseRevisionId: null },
} satisfies import("./index").RunEvent;

/** Synthetic DTO examples only; never returned as successful writes by a client. */
export const mockKnowledgeRevision = {
  revisionId: "00000000-0000-4000-8000-000000000010",
  documentId: "00000000-0000-4000-8000-000000000011",
  version: 1,
  status: "published",
  sourceHash: "bd08d6691118ae8011bf44a4fa27e54032d429ef9c8046c8549453216ee68dd9",
  createdAt: mockWorkspace.createdAt,
  publishedAt: mockWorkspace.createdAt,
  content: {
    title: "合成付款规则",
    scope: { platforms: [], markets: [], categories: [] },
    sourceStatus: "synthetic",
    sourceLabel: "B00 合成文本，非真实平台政策",
    sourceText: "合成规则：请填写付款条款。",
    location: { kind: "text", start: 0, end: 13 },
    rules: [
      {
        ruleId: "00000000-0000-4000-8000-000000000012",
        category: "commercial_terms",
        title: "填写付款条款",
        message: "合成检查：付款条款为空",
        suggestedAction: "补充付款条件后重新检查",
        field: "payment",
        condition: { kind: "required" },
        failureSeverity: "warning",
      },
    ],
  },
} satisfies KnowledgeRevision;
export const mockCheckReport = {
  reportId: "00000000-0000-4000-8000-000000000020",
  quoteId: mockWorkspace.id,
  revisionId: mockWorkspace.id,
  quoteVersion: 1,
  checkedAt: mockWorkspace.createdAt,
  ruleRevisionIds: [],
  coverage: [
    { category: "commercial_terms", appliedRuleIds: [], status: "pending" },
    { category: "platform_guidance", appliedRuleIds: [], status: "pending" },
  ],
  issues: [
    {
      checkId: `${mockWorkspace.id}:coverage:commercial_terms`,
      category: "commercial_terms",
      severity: "pending",
      fieldPath: "scenario.platform",
      message: "合成样例：缺商务条款规则",
      suggestedAction: "发布适用知识后重检",
      evidence: [],
    },
    {
      checkId: `${mockWorkspace.id}:coverage:platform_guidance`,
      category: "platform_guidance",
      severity: "pending",
      fieldPath: "scenario.platform",
      message: "合成样例：缺平台指导规则",
      suggestedAction: "发布适用知识后重检",
      evidence: [],
    },
  ],
} satisfies CheckReport;
export const mockAgentRun = {
  runId: "00000000-0000-4000-8000-000000000030",
  operationKey: "00000000-0000-4000-8000-000000000031",
  command: {
    schemaVersion: 1,
    requestId: "00000000-0000-4000-8000-000000000032",
    idempotencyKey: "00000000-0000-4000-8000-000000000031",
    method: "agent.understand",
    payload: {
      scenarioId: mockWorkspace.id,
      buyer: "合成采购方",
      inquiry: "仅供契约测试，未调用模型",
    },
  },
  status: "queued",
  attempt: 1,
  createdAt: mockWorkspace.createdAt,
  updatedAt: mockWorkspace.createdAt,
  baseRevisionId: null,
  committedRevisionId: null,
  clarification: null,
  error: null,
} satisfies AgentRun;

/** Synthetic Wiki proposal only. Authority, hashes and saved revisions are supplied by the host. */
export const mockWikiStageInput = {
  documentId: "00000000-0000-4000-8000-000000000040",
  expectedVersion: 0,
  parentRevisionId: null,
  content: {
    kind: "sop",
    title: "合成 SOP",
    locale: "pt-BR",
    scope: { platforms: [], markets: [], categories: [] },
    markdown: "# 合成流程\n核对资料。",
    validity: { status: "confirmed", validFrom: null, validUntil: null },
    sections: [
      {
        sectionId: "00000000-0000-4000-8000-000000000041",
        title: "核对",
        location: { kind: "text", start: 0, end: 12 },
        sourceReferenceIds: ["00000000-0000-4000-8000-000000000042"],
      },
    ],
    sourceRefs: [
      {
        referenceId: "00000000-0000-4000-8000-000000000042",
        sourceId: "00000000-0000-4000-8000-000000000043",
        sourceRevisionId: "00000000-0000-4000-8000-000000000044",
        sourceVersion: 1,
        artifactHash: mockKnowledgeRevision.sourceHash,
        location: { kind: "text", start: 0, end: 13 },
        excerptHash: mockKnowledgeRevision.sourceHash,
        assertion: "human_note",
      },
    ],
    relations: [],
    rules: [],
  },
} satisfies import("./knowledge-wiki").WikiCommand["payload"];

export const mockWikiCommands: import("./knowledge-wiki").WikiCommand[] = (() => {
  const read = { schemaVersion: 1 as const, requestId: mockWorkspace.id };
  const write = { ...read, idempotencyKey: mockWikiStageInput.documentId };
  const binding = {
    revisionId: mockWikiStageInput.documentId,
    contentHash: mockKnowledgeRevision.sourceHash,
    sourceSetHash: mockKnowledgeRevision.sourceHash,
  };
  const citation = {
    ...binding,
    documentId: mockWikiStageInput.documentId,
    version: 1,
    sectionId: mockWikiStageInput.content.sections[0]!.sectionId,
    sourceRefs: mockWikiStageInput.content.sourceRefs,
  };
  const consumer = {
    kind: "quote" as const,
    entityId: mockWorkspace.id,
    revisionId: mockWorkspace.id,
    contentHash: binding.contentHash,
  };
  return [
    {
      ...write,
      method: "source.stage",
      payload: {
        sourceId: mockWorkspace.id,
        expectedVersion: 0,
        label: "合成原文",
        sourceStatus: "synthetic",
        mediaType: "text/plain",
        sourceText: mockKnowledgeRevision.content.sourceText,
        acquiredAt: mockWorkspace.createdAt,
        sourceUri: null,
        permissionNote: "仅供测试",
        validity: mockWikiStageInput.content.validity,
      },
    },
    { ...read, method: "source.getRevision", payload: { sourceRevisionId: mockWorkspace.id } },
    { ...write, method: "wiki.stage", payload: mockWikiStageInput },
    { ...read, method: "wiki.getRevision", payload: { revisionId: binding.revisionId } },
    {
      ...read,
      method: "wiki.listRevisions",
      payload: { documentId: mockWikiStageInput.documentId, beforeVersion: null, limit: 20 },
    },
    {
      ...write,
      method: "wiki.review",
      payload: {
        ...binding,
        expectedLifecycleVersion: 1,
        decision: "approve",
        note: "合成审核请求，未执行",
        lintReceiptId: mockWorkspace.id,
      },
    },
    {
      ...write,
      method: "wiki.publish",
      payload: { ...binding, reviewId: mockWorkspace.id, expectedLifecycleVersion: 2 },
    },
    {
      ...write,
      method: "wiki.withdraw",
      payload: {
        revisionId: binding.revisionId,
        expectedLifecycleVersion: 3,
        note: "合成撤回请求，未执行",
      },
    },
    {
      ...read,
      method: "wiki.search",
      payload: {
        keywords: ["流程"],
        scope: { platform: "RFQ", market: "Brazil", category: "板材" },
        locale: "pt-BR",
        kinds: [],
        limit: 20,
        cursor: null,
      },
    },
    {
      ...read,
      method: "wiki.resolveCitation",
      payload: {
        citation,
        purpose: "history",
        scope: { platform: "RFQ", market: "Brazil", category: "板材" },
        locale: "pt-BR",
      },
    },
    { ...write, method: "wiki.registerConsumption", payload: { consumer, citations: [citation] } },
    {
      ...read,
      method: "wiki.getConsumption",
      payload: { kind: "quote", revisionId: consumer.revisionId },
    },
  ];
})();
