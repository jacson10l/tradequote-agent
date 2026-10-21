import { type DesktopClient, failure, success, type Workspace } from "./index";
export const mockWorkspace: Workspace = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "合成演示工作区",
  version: 1,
  createdAt: "2026-10-21T00:00:00.000Z",
};
/** Read-only UI fixture. No persistence or successful fake writes. */
export const readonlyMockClient: DesktopClient = {
  getWorkspace: async () => success(mockWorkspace),
  createWorkspace: async () => failure("CAPABILITY_UNAVAILABLE", "只读样例不能保存"),
  renameWorkspace: async () => failure("CAPABILITY_UNAVAILABLE", "只读样例不能保存"),
};
