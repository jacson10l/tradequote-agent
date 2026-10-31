import {
  AgentCommandSchema,
  AgentReadCommandSchema,
  AgentReadResultSchema,
  CheckCommandSchema,
  CheckListResultSchema,
  CheckResultSchema,
  CommandSchema,
  CsvSelectionSchema,
  type DesktopClient,
  failure,
  ModelEvaluationCommandSchema,
  ModelEvaluationResultSchema,
  ModelResultSchema,
  ModelSettingsCommandSchema,
  ResultSchema,
  RunCommandSchema,
  RunEventsCommandSchema,
  RunEventsResultSchema,
  RunEventsSignalSchema,
  RunListResultSchema,
  RunResultSchema,
  TradeCommandSchema,
  TradeResultSchema,
  unavailableFirstBatchClient,
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
async function invokeRun(input: unknown) {
  const parsed = RunCommandSchema.safeParse(input);
  if (!parsed.success) return failure("VALIDATION_ERROR", "运行字段不合法");
  try {
    const result = await ipcRenderer.invoke(parsed.data.method, parsed.data);
    return (parsed.data.method === "agent.list" ? RunListResultSchema : RunResultSchema).parse(
      result,
    );
  } catch {
    return failure("CAPABILITY_UNAVAILABLE", "运行连接中断，请刷新运行记录；不会自动重发");
  }
}
async function invokeCheck(input: unknown, method: "quote.check" | "quote.getChecks") {
  const parsed = CheckCommandSchema.safeParse(input);
  if (!parsed.success || parsed.data.method !== method)
    return failure("VALIDATION_ERROR", "检查请求字段不合法");
  try {
    const response = await ipcRenderer.invoke(method, parsed.data);
    if (method === "quote.check") {
      const result = CheckResultSchema.parse(response);
      if (result.ok && result.data.revisionId !== parsed.data.payload.revisionId)
        return failure("STORAGE_ERROR", "检查报告与请求版本不一致");
      return result;
    }
    const result = CheckListResultSchema.parse(response);
    if (
      result.ok &&
      (result.data.some((report) => report.revisionId !== parsed.data.payload.revisionId) ||
        new Set(result.data.map((report) => report.reportId)).size !== result.data.length)
    )
      return failure("STORAGE_ERROR", "检查报告列表与请求版本不一致");
    return result;
  } catch {
    return failure(
      "CAPABILITY_UNAVAILABLE",
      method === "quote.check"
        ? "检查连接中断，保存结果未知；请重试本次检查或重新读取报告"
        : "检查报告读取失败，请重新读取报告",
    );
  }
}
const client: DesktopClient = {
  modelEvaluation: async (command) => {
    const parsed = ModelEvaluationCommandSchema.safeParse(command);
    if (!parsed.success) return failure("VALIDATION_ERROR", "评估请求字段不合法");
    try {
      return ModelEvaluationResultSchema.parse(
        await ipcRenderer.invoke(parsed.data.method, parsed.data),
      );
    } catch {
      return failure("CAPABILITY_UNAVAILABLE", "评估连接中断，请刷新历史；不会自动重新调用模型");
    }
  },
  ...unavailableFirstBatchClient,
  checkQuote: async (command) => CheckResultSchema.parse(await invokeCheck(command, "quote.check")),
  getQuoteChecks: async (command) =>
    CheckListResultSchema.parse(await invokeCheck(command, "quote.getChecks")),
  getAgentRunEvents: async (command) => {
    const parsed = RunEventsCommandSchema.safeParse(command);
    if (!parsed.success) return failure("VALIDATION_ERROR", "运行事件字段不合法");
    try {
      const result = RunEventsResultSchema.parse(
        await ipcRenderer.invoke("agent.events", parsed.data),
      );
      if (
        result.ok &&
        (result.data.run.runId !== parsed.data.payload.runId ||
          result.data.afterSeq !== parsed.data.payload.afterSeq)
      )
        return failure("STORAGE_ERROR", "运行事件与请求范围不一致");
      return result;
    } catch {
      return failure("CAPABILITY_UNAVAILABLE", "事件连接中断，将只读重连；不会重新调用模型");
    }
  },
  onAgentRunEvents: (listener) => {
    const receive = (_event: unknown, input: unknown) => {
      const parsed = RunEventsSignalSchema.safeParse(input);
      if (parsed.success) {
        try {
          listener(parsed.data);
        } catch {
          /* Notifications are observational. */
        }
      }
    };
    ipcRenderer.on("agent.events.signal", receive);
    let active = true;
    const dispose = () => {
      if (!active) return;
      active = false;
      ipcRenderer.removeListener("agent.events.signal", receive);
      window.removeEventListener("unload", dispose);
    };
    window.addEventListener("unload", dispose, { once: true });
    return dispose;
  },
  continueAgentRun: async (command) => RunResultSchema.parse(await invokeRun(command)),
  startAgentRun: async (command) => RunResultSchema.parse(await invokeRun(command)),
  getAgentRun: async (command) => RunResultSchema.parse(await invokeRun(command)),
  cancelAgentRun: async (command) => RunResultSchema.parse(await invokeRun(command)),
  retryAgentRun: async (command) => RunResultSchema.parse(await invokeRun(command)),
  listAgentRuns: async (command) => RunListResultSchema.parse(await invokeRun(command)),
  readAgent: async (command) => {
    const parsed = AgentReadCommandSchema.safeParse(command);
    if (!parsed.success) return failure("VALIDATION_ERROR", "只读任务字段不合法");
    try {
      return AgentReadResultSchema.parse(await ipcRenderer.invoke("agent.read", parsed.data));
    } catch {
      return failure("CAPABILITY_UNAVAILABLE", "只读连接中断，未保存报价；重新运行会再次调用模型");
    }
  },
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
