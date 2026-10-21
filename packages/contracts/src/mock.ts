import { type DesktopClient, failure, success, type Workspace } from "./index";
export const mockWorkspace: Workspace = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "合成演示工作区",
  version: 1,
  createdAt: "2026-10-21T00:00:00.000Z",
};
/** Read-only UI fixture. No persistence or successful fake writes. */
export const readonlyMockClient: DesktopClient = {
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
