import {
  type AgentRun,
  type CheckReport,
  type DesktopClient,
  failure,
  type KnowledgeRevision,
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
