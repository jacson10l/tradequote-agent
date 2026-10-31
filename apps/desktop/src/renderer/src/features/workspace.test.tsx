// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type DesktopClient, failure, success } from "@tradequote/contracts";
import { mockWorkspace, readonlyMockClient } from "@tradequote/contracts/mock";
import { afterEach, expect, it, vi } from "vitest";
import { MessageProvider } from "../shared/message";
import { WorkspacePage } from "./workspace";

afterEach(cleanup);
function mount(client = readonlyMockClient) {
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={query}>
      <MessageProvider>
        <WorkspacePage client={client} />
      </MessageProvider>
    </QueryClientProvider>,
  );
}
it("shows validation, saves through client and refreshes persisted data", async () => {
  const user = userEvent.setup();
  const getWorkspace = vi
    .fn()
    .mockResolvedValueOnce(success(null))
    .mockResolvedValue(success(mockWorkspace));
  const createWorkspace = vi.fn().mockResolvedValue(success(mockWorkspace));
  mount({ ...readonlyMockClient, getWorkspace, createWorkspace });
  await user.click(await screen.findByRole("button", { name: "创建工作区" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("请输入工作区名称");
  expect(createWorkspace).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText("工作区名称"), mockWorkspace.name);
  await user.click(screen.getByRole("button", { name: "创建工作区" }));
  expect(await screen.findByText("已保存至本机 · 版本 1")).toBeVisible();
  expect(getWorkspace).toHaveBeenCalledTimes(2);
});
it("surfaces conflicts and reloads current data without silently retrying", async () => {
  const user = userEvent.setup();
  const renameWorkspace = vi
    .fn()
    .mockResolvedValue(failure("REVISION_CONFLICT", "已被其他操作修改", 2));
  const getWorkspace = vi
    .fn()
    .mockResolvedValueOnce(success(mockWorkspace))
    .mockResolvedValue(success({ ...mockWorkspace, name: "新名称", version: 2 }));
  mount({ ...readonlyMockClient, getWorkspace, renameWorkspace });
  await user.click(await screen.findByRole("button", { name: "保存工作区" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("已被其他操作修改");
  expect(renameWorkspace).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "重新加载最新版本" }));
  expect(await screen.findByText("已保存至本机 · 版本 2")).toBeVisible();
  expect(screen.getByLabelText("工作区名称")).toHaveValue("新名称");
});
it("uses message for a rejected write while preserving the entered form", async () => {
  const user = userEvent.setup();
  const createWorkspace = vi.fn().mockResolvedValue(failure("ACTION_NOT_ALLOWED", "操作不允许"));
  mount({ ...readonlyMockClient, getWorkspace: async () => success(null), createWorkspace });
  await user.type(await screen.findByLabelText("工作区名称"), "保留我的输入");
  await user.click(screen.getByRole("button", { name: "创建工作区" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("操作不允许");
  expect(screen.getByLabelText("工作区名称")).toHaveValue("保留我的输入");
  await user.click(screen.getByRole("button", { name: "关闭提示" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("retries a load notification and removes it after recovery", async () => {
  const user = userEvent.setup();
  const getWorkspace = vi
    .fn()
    .mockResolvedValueOnce(failure("ACTION_NOT_ALLOWED", "调用来源不允许"))
    .mockResolvedValueOnce(failure("ACTION_NOT_ALLOWED", "调用来源不允许"))
    .mockResolvedValue(success(null));
  mount({ ...readonlyMockClient, getWorkspace });
  expect(await screen.findByRole("alert")).toHaveTextContent("调用来源不允许");
  await user.click(screen.getByRole("button", { name: "重新加载" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("调用来源不允许");
  await user.click(screen.getByRole("button", { name: "重新加载" }));
  expect(await screen.findByRole("button", { name: "创建工作区" })).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(getWorkspace).toHaveBeenCalledTimes(3);
});

it("keeps business defaults blank and saves through the existing versioned service, reusing the retry key", async () => {
  const user = userEvent.setup();
  const saveScenario = vi
    .fn<DesktopClient["saveScenario"]>()
    .mockResolvedValue(failure("STORAGE_ERROR", "保存未完成，请重试"));
  mount({ ...readonlyMockClient, getWorkspace: async () => success(mockWorkspace), saveScenario });
  expect(await screen.findByRole("heading", { name: "业务默认配置" })).toBeVisible();
  expect(screen.getByLabelText("场景名称")).toHaveValue("");
  for (const [label, value] of Object.entries({
    场景名称: "活动采购",
    目标用户与岗位: "业务员",
    "目标平台 / 场景": "客户邮件",
    目标市场: "英国",
    商品品类: "活动用品",
    "目标语言（逗号分隔 BCP 47）": "en",
  })) {
    await user.type(screen.getByLabelText(label), value);
  }
  await user.selectOptions(screen.getByLabelText("场景来源"), "synthetic");
  await user.click(screen.getByRole("button", { name: "保存业务场景" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("保存未完成");
  await user.click(screen.getByRole("button", { name: "保存业务场景" }));
  expect(saveScenario).toHaveBeenCalledTimes(2);
  const first = saveScenario.mock.calls[0]![0];
  const second = saveScenario.mock.calls[1]![0];
  expect(first).toMatchObject({
    method: "scenario.save",
    payload: {
      expectedVersion: 0,
      scenario: { name: "活动采购", locales: ["en"], sourceStatus: "synthetic" },
    },
  });
  expect(second.idempotencyKey).toBe(first.idempotencyKey);
  expect(second.requestId).not.toBe(first.requestId);
});
