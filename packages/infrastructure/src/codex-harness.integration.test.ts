import { randomUUID } from "node:crypto";
import { RunResultSchema } from "@tradequote/contracts";
import { afterEach, expect, it } from "vitest";
import { AgentRunCoordinator } from "./agent-run-coordinator";
import { CodexHarness } from "./codex-harness";
import { common, data, runFixture } from "./testing/run-fixture";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanups.splice(0).reverse()) close();
});
const live = process.env.TRADEQUOTE_VERIFY_CODEX === "1" ? it : it.skip;
async function terminal(agent: AgentRunCoordinator, runId: string) {
  for (let i = 0; i < 750; i++) {
    const run = RunResultSchema.parse(
      agent.execute({
        schemaVersion: 1,
        requestId: randomUUID(),
        method: "agent.get",
        payload: { runId },
      }),
    );
    if (!run.ok) throw new Error(run.error.message);
    if (!["queued", "running"].includes(run.data.status)) return run.data;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("native Codex run did not terminate");
}
live(
  "real Codex queries products, calculates and saves V1 then revises 500 with a preserved V1",
  async () => {
    const fixture = runFixture(cleanups);
    const agent = new AgentRunCoordinator(fixture.repo);
    const command = fixture.start();
    command.payload.payload.inquiry =
      "请根据询盘保存一份未审核报价草稿：DEMO-TEE 100 piece。付款和交期没有提供，请留空并列为待确认。商品金额必须调用工具核价。";
    const start = RunResultSchema.parse(
      agent.execute({
        ...command,
        payload: {
          ...command.payload,
          payload: { ...command.payload.payload, executionMode: "codex_harness" },
        },
      }),
    );
    if (!start.ok) throw new Error(start.error.message);
    const v1Run = await terminal(agent, start.data.runId);
    console.log(
      JSON.stringify({
        kind: "native-v1",
        status: v1Run.status,
        tools: v1Run.toolSteps?.map((s) => ({ tool: s.tool, ok: s.ok })),
        error: v1Run.error?.code,
      }),
    );
    expect(v1Run.status).toBe("completed");
    const v1 = data(
      fixture.repo.executeTrade(
        { ...common(), method: "trade.get" },
        { actorId: "test", origin: "human_ui" },
      ),
    ).quotes[0]!;
    expect(v1.goodsTotal).toBe("900.00");
    expect(
      data(
        fixture.repo.executeTrade(
          { schemaVersion: 1, requestId: randomUUID(), method: "trade.get" },
          { actorId: "test", origin: "human_ui" },
        ),
      ).turns[0]?.model,
    ).toMatch(/^codex:.+/);
    expect(v1.pending).toContain("付款条款待确认");
    expect(v1.pending).toContain("交期与交货条件待确认");
    const revise = RunResultSchema.parse(
      agent.execute({
        ...common(),
        method: "agent.start",
        payload: {
          method: "agent.revise",
          payload: {
            executionMode: "codex_harness",
            baseId: v1.id,
            expectedVersion: 1,
            instruction: "数量改为500 piece，比较变化，付款和交期保持空白待确认，保存新草稿版本。",
          },
        },
      }),
    );
    if (!revise.ok) throw new Error(revise.error.message);
    const v2Run = await terminal(agent, revise.data.runId);
    console.log(
      JSON.stringify({
        kind: "native-v2",
        status: v2Run.status,
        tools: v2Run.toolSteps?.map((s) => ({ tool: s.tool, ok: s.ok })),
        error: v2Run.error?.code,
      }),
    );
    expect(v2Run.status).toBe("completed");
    const board = data(
      fixture.repo.executeTrade(
        { ...common(), method: "trade.get" },
        { actorId: "test", origin: "human_ui" },
      ),
    );
    expect(board.quotes.find((q) => q.id === v1.id)).toEqual(v1);
    expect(board.quotes.find((q) => q.id === v2Run.committedRevisionId)?.goodsTotal).toBe(
      "4500.00",
    );
    await agent.close();
  },
  300000,
);

live(
  "real Codex cancellation and a missing executable failure recover only on explicit retry",
  async () => {
    const fixture = runFixture(cleanups);
    const agent = new AgentRunCoordinator(fixture.repo);
    const command = {
      ...fixture.start(),
      payload: {
        method: "agent.understand" as const,
        payload: {
          scenarioId: fixture.scenario.id,
          buyer: "合成买方",
          inquiry: "DEMO-TEE 100 piece，付款和交期留空待确认，保存草稿",
          executionMode: "codex_harness" as const,
        },
      },
    };
    const cancelled = RunResultSchema.parse(agent.execute(command));
    if (!cancelled.ok) throw new Error(cancelled.error.message);
    let reachedTool = false;
    for (let i = 0; i < 1200; i++) {
      const state = RunResultSchema.parse(
        agent.execute({
          schemaVersion: 1,
          requestId: randomUUID(),
          method: "agent.get",
          payload: { runId: cancelled.data.runId },
        }),
      );
      if (!state.ok) throw new Error(state.error.message);
      if (state.data.toolSteps?.length) {
        reachedTool = true;
        break;
      }
      if (state.data.status !== "running")
        throw new Error(`native cancelled task ended before its first tool: ${state.data.status}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(reachedTool).toBe(true);
    agent.execute(fixture.control(cancelled.data.runId, "agent.cancel"));
    expect((await terminal(agent, cancelled.data.runId)).status).toBe("cancelled");
    await agent.close();
    expect(fixture.counts().quote_v1).toBe(0);
    const broken = new AgentRunCoordinator(
      fixture.repo,
      undefined,
      undefined,
      new CodexHarness({ executable: `/missing-${randomUUID()}/codex` }),
    );
    const started = RunResultSchema.parse(broken.execute({ ...command, ...common() }));
    if (!started.ok) throw new Error(started.error.message);
    expect((await terminal(broken, started.data.runId)).status).toBe("failed");
    await broken.close();
    fixture.reopen();
    const recovered = new AgentRunCoordinator(fixture.repo);
    expect(fixture.counts().quote_v1).toBe(0);
    const retry = RunResultSchema.parse(
      recovered.execute(fixture.control(started.data.runId, "agent.retry")),
    );
    if (!retry.ok) throw new Error(retry.error.message);
    const done = await terminal(recovered, started.data.runId);
    console.log(
      JSON.stringify({
        kind: "native-retry",
        status: done.status,
        attempt: done.attempt,
        tools: done.toolSteps?.map((s) => s.tool),
      }),
    );
    expect(done.status).toBe("completed");
    expect(done.operationKey).toBe(started.data.operationKey);
    expect(done.attempt).toBe(2);
    expect(fixture.counts().quote_v1).toBe(1);
    await recovered.close();
  },
  180000,
);
