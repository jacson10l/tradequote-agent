import {
  AgentCommandSchema,
  CommandSchema,
  CsvSelectionSchema,
  type DesktopClient,
  failure,
  ModelResultSchema,
  ModelSettingsCommandSchema,
  ResultSchema,
  TradeCommandSchema,
  TradeResultSchema,
} from "@tradequote/contracts";
import { contextBridge, ipcRenderer } from "electron";

async function invoke(input: unknown) {
  const parsed = CommandSchema.safeParse(input);
  if (!parsed.success) return failure("VALIDATION_ERROR", "请求字段不合法");
  try {
    return ResultSchema.parse(await ipcRenderer.invoke(parsed.data.method, parsed.data));
  } catch {
    return failure("CAPABILITY_UNAVAILABLE", "桌面连接失败，请重新打开应用");
  }
}
async function invokeTrade(input: unknown) {
  const parsed = TradeCommandSchema.safeParse(input);
  if (!parsed.success) return failure("VALIDATION_ERROR", "请求字段不合法，请核对输入");
  try {
    return TradeResultSchema.parse(await ipcRenderer.invoke(parsed.data.method, parsed.data));
  } catch {
    return failure("CAPABILITY_UNAVAILABLE", "连接中断，保存结果未知，请重试同一操作或重新加载");
  }
}
async function invokeAgent(input: unknown) {
  const parsed = AgentCommandSchema.safeParse(input);
  if (!parsed.success) return failure("VALIDATION_ERROR", "对话字段不合法");
  try {
    return TradeResultSchema.parse(await ipcRenderer.invoke(parsed.data.method, parsed.data));
  } catch {
    return failure("CAPABILITY_UNAVAILABLE", "连接中断，结果未知；请重新加载或重试同一操作");
  }
}
const client: DesktopClient = {
  understandInquiry: (command) => invokeAgent({ ...command, method: "agent.understand" }),
  reviseQuote: (command) => invokeAgent({ ...command, method: "agent.revise" }),
  modelSettings: async (command) => {
    const parsed = ModelSettingsCommandSchema.safeParse(command);
    if (!parsed.success) return failure("VALIDATION_ERROR", "模型设置字段不合法");
    try {
      return ModelResultSchema.parse(await ipcRenderer.invoke(parsed.data.method, parsed.data));
    } catch {
      return failure("CAPABILITY_UNAVAILABLE", "模型设置连接失败，请重试");
    }
  },
  getWorkspace: () =>
    invoke({ schemaVersion: 1, method: "workspace.get", requestId: crypto.randomUUID() }),
  createWorkspace: (command) => invoke({ ...command, method: "workspace.create" }),
  renameWorkspace: (command) => invoke({ ...command, method: "workspace.rename" }),
  getTrade: () =>
    invokeTrade({ schemaVersion: 1, method: "trade.get", requestId: crypto.randomUUID() }),
  saveScenario: (command) => invokeTrade({ ...command, method: "scenario.save" }),
  stageCatalog: (command) => invokeTrade({ ...command, method: "catalog.stage" }),
  publishCatalog: (command) => invokeTrade({ ...command, method: "catalog.publish" }),
  createQuoteV1: (command) => invokeTrade({ ...command, method: "quote.createV1" }),
  pickCatalogCsv: async () => {
    try {
      return CsvSelectionSchema.parse(await ipcRenderer.invoke("catalog.pickCsv"));
    } catch {
      return { status: "error", message: "文件选择失败，请重试" };
    }
  },
};
contextBridge.exposeInMainWorld("tradequote", Object.freeze(client));
