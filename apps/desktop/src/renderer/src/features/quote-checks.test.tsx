// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  type CheckClient,
  type CheckListResult,
  type CheckReport,
  failure,
  type QuoteSnapshot,
  success,
} from "@tradequote/contracts";
import { readonlyMockClient } from "@tradequote/contracts/mock";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it } from "vitest";
import { MessageProvider } from "../shared/message";
import { QuoteChecks } from "./quote-checks";
import { checksList, checksPendingReport, checksQuote, checksReport } from "./quote-checks.fixture";
import { QuotesPage } from "./quotes";

afterEach(cleanup);
function mount(
  client: Pick<CheckClient, "getQuoteChecks"> = {
    getQuoteChecks: async () => checksList([checksReport]),
  },
  quote = checksQuote,
) {
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const element = (next: QuoteSnapshot) => (
    <QueryClientProvider client={queries}>
      <QuoteChecks quote={next} client={client} />
    </QueryClientProvider>
  );
  const view = render(element(quote));
  return { showQuote: (next: QuoteSnapshot) => view.rerender(element(next)) };
}

it("uses the same issue for a keyboard risk marker and its field annotation with fixed evidence", async () => {
  const user = userEvent.setup();
  mount();
  const marker = await screen.findByRole("button", { name: "阻断 · 付款条款 · 付款条件缺失" });
  expect(screen.getByText("1 项阻断 · 1 项提醒 · 0 项待核实")).toBeVisible();
  marker.focus();
  await user.keyboard("{Enter}");
  const field = screen.getByRole("region", { name: "付款条款" });
  expect(field).toHaveFocus();
  expect(marker).toHaveAttribute("aria-pressed", "true");
  expect(within(field).getByText("付款条件缺失")).toBeVisible();
  expect(within(field).getByText("补充付款条件后重新检查")).toBeVisible();
  await user.click(within(field).getByText("查看固定来源"));
  expect(within(field).getByText("合成来源 · 合成商务条款 V1")).toBeVisible();
  expect(within(field).getByText("原文位置：UTF-16 [0, 12)")).toBeVisible();
  expect(within(field).getByText(checksReport.issues[0]!.checkId)).toBeVisible();
});

it("selects the newest report and lets users read earlier reports without rewriting them", async () => {
  const user = userEvent.setup();
  const later: CheckReport = {
    ...checksReport,
    reportId: "00000000-0000-4000-8000-000000000021",
    checkedAt: "2026-10-22T02:00:00.000Z",
    issues: checksReport.issues.map((issue) =>
      issue.fieldPath === "payment" ? { ...issue, message: "付款条件需采购复核" } : issue,
    ),
  };
  const original = structuredClone(checksReport);
  mount({ getQuoteChecks: async () => checksList([checksReport, later]) });
  const history = await screen.findByLabelText("本版本检查报告");
  expect(history).toHaveValue(later.reportId);
  await user.selectOptions(history, checksReport.reportId);
  expect(
    await screen.findByRole("button", { name: "阻断 · 付款条款 · 付款条件缺失" }),
  ).toBeVisible();
  expect(screen.queryByRole("button", { name: /付款条件需采购复核/ })).not.toBeInTheDocument();
  expect(checksReport).toEqual(original);
});

it.each([
  [
    "quote",
    {
      ...checksReport,
      quoteId: "00000000-0000-4000-8000-000000000099",
      revisionId: "00000000-0000-4000-8000-000000000099",
    },
  ],
  ["version", { ...checksReport, quoteVersion: 2 }],
] as const)("hides reports bound to another %s", async (_kind, report) => {
  mount({ getQuoteChecks: async () => checksList([report]) });
  expect(await screen.findByRole("alert")).toHaveTextContent("检查报告与当前报价版本不一致");
  expect(screen.queryByRole("group", { name: "风险标记" })).not.toBeInTheDocument();
  expect(screen.queryByText("补充付款条件后重新检查")).not.toBeInTheDocument();
});

it("renders missing coverage as pending and never as a rule pass", async () => {
  const user = userEvent.setup();
  mount({ getQuoteChecks: async () => checksList([checksPendingReport]) });
  const marker = await screen.findByRole("button", {
    name: "待核实 · 业务平台与规则覆盖 · 缺少商务条款规则",
  });
  await user.click(marker);
  const field = screen.getByRole("region", { name: "业务平台与规则覆盖" });
  expect(field).toHaveFocus();
  expect(screen.getByText("商务条款：待核实")).toBeVisible();
  expect(screen.getByText("平台指引：待核实")).toBeVisible();
  expect(screen.queryByText(/本报告未发现规则问题/)).not.toBeInTheDocument();
  expect(within(field).queryByText(/合成来源/)).not.toBeInTheDocument();
});

it("rejects ambiguous duplicate report IDs instead of presenting a partial history", async () => {
  mount({ getQuoteChecks: async () => checksList([checksReport, { ...checksReport }]) });
  expect(await screen.findByRole("alert")).toHaveTextContent("报告列表包含重复标识");
  expect(screen.queryByLabelText("本版本检查报告")).not.toBeInTheDocument();
});

it("keeps new versions empty when an old-version response arrives late", async () => {
  let finishOld!: (result: CheckListResult) => void;
  const oldResponse = new Promise<CheckListResult>((resolve) => {
    finishOld = resolve;
  });
  const v2: QuoteSnapshot = {
    ...checksQuote,
    id: "00000000-0000-4000-8000-000000000030",
    rootId: checksQuote.id,
    parentId: checksQuote.id,
    version: 2,
    payment: "电汇",
  };
  const requestIds: string[] = [];
  const view = mount({
    getQuoteChecks: (command) => {
      requestIds.push(command.payload.revisionId);
      expect(command.payload).toEqual({ revisionId: command.payload.revisionId });
      return command.payload.revisionId === checksQuote.id
        ? oldResponse
        : Promise.resolve(checksList([]));
    },
  });
  expect(screen.getByRole("status")).toHaveTextContent("正在读取当前版本的检查报告");
  view.showQuote(v2);
  expect(await screen.findByText("当前版本尚无检查报告，条款仍待核实。")).toBeVisible();
  await act(async () => finishOld(checksList([checksReport])));
  expect(screen.getByRole("region", { name: "报价 V2 规则检查" })).toBeVisible();
  expect(screen.queryByRole("group", { name: "风险标记" })).not.toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "付款条款" })).getByText("电汇")).toBeVisible();
  view.showQuote(checksQuote);
  expect(
    await screen.findByRole("button", { name: "阻断 · 付款条款 · 付款条件缺失" }),
  ).toBeVisible();
  expect(requestIds).toContain(v2.id);
});

it("shows unavailable service as pending and recovers through a read-only retry", async () => {
  const user = userEvent.setup();
  let available = false;
  mount({
    getQuoteChecks: async () =>
      available ? checksList([checksReport]) : failure("CAPABILITY_UNAVAILABLE", "未接入"),
  });
  expect(await screen.findByRole("alert")).toHaveTextContent("检查服务尚未接入");
  expect(screen.queryByRole("group", { name: "风险标记" })).not.toBeInTheDocument();
  available = true;
  await user.click(screen.getByRole("button", { name: "重新读取报告" }));
  expect(
    await screen.findByRole("button", { name: "提醒 · 交期与交货条件 · 交货承诺需要核实" }),
  ).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("rejects malformed reports with a readable error and no fabricated success", async () => {
  mount({ getQuoteChecks: async () => checksList([{ ...checksReport, ruleRevisionIds: [] }]) });
  expect(await screen.findByRole("alert")).toHaveTextContent("检查报告内容无法校验");
  expect(screen.queryByText(/本报告未发现规则问题/)).not.toBeInTheDocument();
});

it.each(["async", "sync"])(
  "does not expose raw %s transport exceptions in the report panel",
  async (mode) => {
    mount({
      getQuoteChecks: () => {
        if (mode === "sync") throw new Error("internal transport failure");
        return Promise.reject(new Error("internal transport failure"));
      },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("读取检查报告失败，请重试");
    expect(screen.queryByText("internal transport failure")).not.toBeInTheDocument();
  },
);

it("shows every fixed source as text and identifies synthetic evidence before expansion", async () => {
  const user = userEvent.setup();
  const report = structuredClone(checksReport);
  const extraId = "00000000-0000-4000-8000-000000000015";
  report.ruleRevisionIds.push(extraId);
  report.issues[0]!.evidence.push({
    ...report.issues[0]!.evidence[0]!,
    revisionId: extraId,
    sourceStatus: "user_provided",
    sourceLabel: "<img src=x onerror=alert(1)>",
  });
  mount({ getQuoteChecks: async () => checksList([report]) });
  expect(await screen.findByText(/含合成规则来源/)).toBeVisible();
  const field = screen.getByRole("region", { name: "付款条款" });
  await user.click(within(field).getByText("查看固定来源"));
  expect(within(field).getByText("用户提供来源 · <img src=x onerror=alert(1)>")).toBeVisible();
  expect(within(field).queryByRole("img")).not.toBeInTheDocument();
  expect(within(field).getAllByText(/来源 SHA-256/)).toHaveLength(2);
});

it("describes zero issues as limited rule coverage instead of an approval", async () => {
  mount({ getQuoteChecks: async () => checksList([{ ...checksReport, issues: [] }]) });
  expect(await screen.findByText(/本报告未发现规则问题；仅覆盖已应用规则/)).toBeVisible();
  expect(screen.getByText("商务条款：已检查 1 条")).toBeVisible();
  expect(screen.queryByText("合规通过")).not.toBeInTheDocument();
});

it("mounts the report beside the actual saved quote without writing or opening approval", async () => {
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const client = {
    ...readonlyMockClient,
    getWorkspace: async () =>
      success({
        id: checksQuote.workspaceId,
        name: "合成工作区",
        version: 1,
        createdAt: checksQuote.createdAt,
      }),
    getTrade: async () => ({
      ok: true as const,
      data: {
        scenario: checksQuote.scenario,
        batches: [],
        products: [checksQuote.lines[0]!.product],
        quotes: [checksQuote],
        turns: [],
      },
      warnings: [],
      evidenceIds: [],
    }),
    getQuoteChecks: async () => checksList([checksReport]),
  };
  render(
    <QueryClientProvider client={queries}>
      <MemoryRouter>
        <MessageProvider>
          <QuotesPage client={client} />
        </MessageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(
    await screen.findByRole("button", { name: "阻断 · 付款条款 · 付款条件缺失" }),
  ).toBeVisible();
  expect(screen.getByRole("article", { name: "已保存报价详情" })).toHaveTextContent(
    checksQuote.number,
  );
  expect(screen.getByTestId("goods-total")).toHaveTextContent("未知 USD");
  expect(screen.getByRole("button", { name: "提交人工审核" })).toBeDisabled();
});

it("revalidates cached data when quote identity metadata changes", async () => {
  const view = mount();
  await screen.findByRole("button", { name: "阻断 · 付款条款 · 付款条件缺失" });
  view.showQuote({ ...checksQuote, version: 2, rootId: "00000000-0000-4000-8000-000000000050" });
  expect(await screen.findByRole("alert")).toHaveTextContent("检查报告与当前报价版本不一致");
  expect(screen.queryByRole("group", { name: "风险标记" })).not.toBeInTheDocument();
});
