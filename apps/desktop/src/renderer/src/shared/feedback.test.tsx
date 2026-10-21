// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { MessageProvider, useMessage } from "./message";
import { Notification } from "./notification";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function Trigger() {
  const message = useMessage();
  return (
    <>
      <button type="button" onClick={() => message.error("保存失败")}>
        报错
      </button>
      <button type="button" onClick={() => message.success("保存成功")}>
        成功
      </button>
    </>
  );
}
function mount() {
  render(
    <StrictMode>
      <MessageProvider>
        <Trigger />
      </MessageProvider>
    </StrictMode>,
  );
}
it("deduplicates repeated errors, refreshes expiry and cleans up timers", () => {
  vi.useFakeTimers();
  mount();
  fireEvent.click(screen.getByText("报错"));
  act(() => vi.advanceTimersByTime(5000));
  fireEvent.click(screen.getByText("报错"));
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByRole("alert")).toHaveTextContent("保存失败");
  act(() => vi.advanceTimersByTime(5000));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("成功"));
  expect(screen.getByRole("status")).toHaveTextContent("保存成功");
  cleanup();
  expect(vi.getTimerCount()).toBe(0);
});
it("keeps messages while reading or focused and allows explicit dismissal", () => {
  vi.useFakeTimers();
  mount();
  fireEvent.click(screen.getByText("报错"));
  const alert = screen.getByRole("alert");
  fireEvent.mouseEnter(alert);
  act(() => vi.advanceTimersByTime(10000));
  expect(alert).toBeVisible();
  fireEvent.focus(screen.getByRole("button", { name: "关闭提示" }));
  fireEvent.mouseLeave(alert);
  act(() => vi.advanceTimersByTime(10000));
  expect(alert).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "关闭提示" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("keeps actionable notifications until resolved, disables pending retry and supports close", () => {
  vi.useFakeTimers();
  const retry = vi.fn();
  const close = vi.fn();
  const view = render(
    <Notification
      title="工作区读取失败"
      description="调用来源不允许"
      action={{ label: "重新加载", onClick: retry }}
      onClose={close}
    />,
  );
  act(() => vi.advanceTimersByTime(60000));
  expect(screen.getByRole("alert")).toHaveTextContent("调用来源不允许");
  fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
  expect(retry).toHaveBeenCalledOnce();
  view.rerender(
    <Notification
      title="工作区读取失败"
      description="调用来源不允许"
      action={{ label: "重新加载", onClick: retry, pending: true }}
      onClose={close}
    />,
  );
  expect(screen.getByRole("button", { name: "正在加载…" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "关闭通知" }));
  expect(close).toHaveBeenCalledOnce();
});
