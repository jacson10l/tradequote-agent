// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { failure, success } from "@tradequote/contracts";
import { mockWorkspace, readonlyMockClient } from "@tradequote/contracts/mock";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspacePage } from "./workspace";

afterEach(cleanup);
function mount(client = readonlyMockClient) {
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={query}>
      <WorkspacePage client={client} />
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
