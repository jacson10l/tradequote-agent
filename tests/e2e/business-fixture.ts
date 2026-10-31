import { expect, type Page } from "@playwright/test";
import { demoCatalogCsv, demoScenario } from "../../packages/contracts/src/trade";
/** Explicit synthetic fixture input; production UI never preloads these values. */
export async function saveBusinessScenario(page: Page, expectedVersion = 1) {
  await page.getByRole("navigation").getByRole("link", { name: "工作区设置", exact: true }).click();
  const fields = {
    name: demoScenario.name,
    targetUser: demoScenario.targetUser,
    platform: demoScenario.platform,
    market: demoScenario.market,
    category: demoScenario.category,
  };
  for (const [key, value] of Object.entries(fields)) {
    const input = page.locator(`#scenario-${key}`);
    if (!(await input.inputValue())) await input.fill(value);
  }
  if (!(await page.locator("#scenario-locales").inputValue()))
    await page.locator("#scenario-locales").fill(demoScenario.locales.join(","));
  await page.locator("#scenario-source").selectOption("synthetic");
  await page.getByRole("button", { name: "保存业务场景", exact: true }).click();
  await page.getByText("业务配置已保存", { exact: true }).waitFor({ state: "visible" });
  await expect(page.getByText(`场景版本 ${expectedVersion}`, { exact: true })).toBeVisible();
  await page.getByRole("navigation").getByRole("link", { name: "资料与报价", exact: true }).click();
}
export async function fillCatalogFixture(page: Page) {
  await page.getByLabel("CSV 原文").fill(demoCatalogCsv);
  await page.locator("#source-name").fill("fixture.csv");
  await page.getByLabel("资料性质").selectOption("synthetic");
}
export async function compatibilityQuote(
  page: Page,
  instruction: string,
  buyer?: string,
  toolLoop = false,
) {
  const result = await page.evaluate(
    async (input) => {
      const board = await window.tradequote.getTrade();
      if (!board.ok || !board.data.scenario) throw Error("synthetic scenario missing");
      const common = {
        schemaVersion: 1 as const,
        requestId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
      };
      const mode = input.toolLoop ? { executionMode: "tool_loop" as const } : {};
      if (input.buyer)
        return window.tradequote.understandInquiry({
          ...common,
          method: "agent.understand",
          payload: {
            ...mode,
            scenarioId: board.data.scenario.id,
            buyer: input.buyer,
            inquiry: input.instruction,
          },
        });
      const quote = board.data.quotes[0];
      if (!quote) throw Error("synthetic quote missing");
      return window.tradequote.reviseQuote({
        ...common,
        method: "agent.revise",
        payload: {
          ...mode,
          baseId: quote.id,
          expectedVersion: quote.version,
          instruction: input.instruction,
        },
      });
    },
    { instruction, buyer, toolLoop },
  );
  await page.reload();
  return result;
}
