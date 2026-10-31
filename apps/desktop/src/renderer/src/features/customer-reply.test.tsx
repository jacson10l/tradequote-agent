// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CheckClient } from "@tradequote/contracts";
import { readonlyMockClient } from "@tradequote/contracts/mock";
import { afterEach, expect, it, vi } from "vitest";
import { MessageProvider } from "../shared/message";
import { CustomerReply } from "./customer-reply";
import { checksList, checksQuote, checksReport } from "./quote-checks.fixture";

afterEach(cleanup);
function mount(
  getQuoteChecks: CheckClient["getQuoteChecks"] = async () => checksList([checksReport]),
) {
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queries}>
      <MessageProvider>
        <CustomerReply quote={checksQuote} client={{ ...readonlyMockClient, getQuoteChecks }} />
      </MessageProvider>
    </QueryClientProvider>,
  );
  return { ...view, queries };
}
it("switches English/German, copies exact read-only text and shows unreviewed risk sources", async () => {
  const user = userEvent.setup();
  mount();
  const text = screen.getByRole("textbox", { name: "客户回复正文" });
  await waitFor(() =>
    expect((text as HTMLTextAreaElement).value).toEqual(
      expect.stringContaining(checksReport.reportId),
    ),
  );
  expect(text).toHaveAttribute("readonly");
  expect((text as HTMLTextAreaElement).value).toEqual(expect.stringContaining("[warning]"));
  await user.selectOptions(screen.getByLabelText("回复语言"), "de");
  expect((text as HTMLTextAreaElement).value).toEqual(
    expect.stringContaining("Nicht geprüfter Entwurf"),
  );
  const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  await user.click(screen.getByRole("button", { name: "复制未审核草稿" }));
  expect(copy).toHaveBeenCalledWith((text as HTMLTextAreaElement).value);
  expect(await screen.findByText("已复制未审核草稿，请人工核对后使用")).toBeVisible();
  copy.mockRejectedValue(new Error("unavailable"));
  await user.click(screen.getByRole("button", { name: "复制未审核草稿" }));
  expect(await screen.findByText("复制失败，请选中正文手动复制")).toBeVisible();
});
it("rejects wrong-version and duplicate reports and permits an explicit read retry", async () => {
  const user = userEvent.setup();
  const read = vi
    .fn<CheckClient["getQuoteChecks"]>()
    .mockResolvedValueOnce(checksList([{ ...checksReport, quoteVersion: 2 }]))
    .mockResolvedValueOnce(checksList([checksReport, checksReport]))
    .mockResolvedValue(checksList([]));
  mount(read);
  expect(await screen.findByRole("alert")).toHaveTextContent("检查报告读取失败");
  expect((screen.getByLabelText("客户回复正文") as HTMLTextAreaElement).value).toEqual(
    expect.stringContaining("Check report unavailable"),
  );
  await user.click(screen.getByRole("button", { name: "重试草稿报告读取" }));
  await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole("alert")).toHaveTextContent("检查报告读取失败");
  await user.click(screen.getByRole("button", { name: "重试草稿报告读取" }));
  await waitFor(() =>
    expect((screen.getByLabelText("客户回复正文") as HTMLTextAreaElement).value).toEqual(
      expect.stringContaining("No saved check report"),
    ),
  );
});

it("includes the persisted Agent check in the reply when no independent manual report exists", async () => {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MessageProvider>
        <CustomerReply
          quote={checksQuote}
          client={{ ...readonlyMockClient, getQuoteChecks: async () => checksList([]) }}
          runReport={checksReport}
        />
      </MessageProvider>
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(
      screen.getByRole<HTMLTextAreaElement>("textbox", { name: "客户回复正文" }).value,
    ).toContain(checksReport.reportId),
  );
  expect(
    screen.getByRole<HTMLTextAreaElement>("textbox", { name: "客户回复正文" }).value,
  ).toContain("[block]");
});

it("does not attach a persisted Agent report to another quote version", async () => {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MessageProvider>
        <CustomerReply
          quote={{ ...checksQuote, version: 2 }}
          client={{ ...readonlyMockClient, getQuoteChecks: async () => checksList([]) }}
          runReport={checksReport}
        />
      </MessageProvider>
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(
      screen.getByRole<HTMLTextAreaElement>("textbox", { name: "客户回复正文" }).value,
    ).toContain("No saved check report"),
  );
  expect(
    screen.getByRole<HTMLTextAreaElement>("textbox", { name: "客户回复正文" }).value,
  ).not.toContain(checksReport.reportId);
});
