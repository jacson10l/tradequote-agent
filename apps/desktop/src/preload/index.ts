import { CommandSchema, type DesktopClient, failure, ResultSchema } from "@tradequote/contracts";
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
const client: DesktopClient = {
  getWorkspace: () =>
    invoke({ schemaVersion: 1, method: "workspace.get", requestId: crypto.randomUUID() }),
  createWorkspace: (command) => invoke({ ...command, method: "workspace.create" }),
  renameWorkspace: (command) => invoke({ ...command, method: "workspace.rename" }),
};
contextBridge.exposeInMainWorld("tradequote", Object.freeze(client));
