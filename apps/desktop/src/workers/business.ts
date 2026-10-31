import {
  AgentCommandSchema,
  AgentReadCommandSchema,
  CheckCommandSchema,
  RunCommandSchema,
  RunEventsCommandSchema,
  RunEventsWatchSchema,
  TradeCommandSchema,
  WorkerRequestSchema,
} from "@tradequote/contracts";
import { createTradeService, createWorkspaceService } from "@tradequote/domain";
import {
  AgentRunCoordinator,
  DeepSeekProvider,
  SqliteWorkspaceRepository,
  WorkerOwnership,
} from "@tradequote/infrastructure";

const database = process.argv[2];
if (!database || !process.parentPort) throw new Error("BUSINESS_WORKER_REQUIRES_HOST");
const ownership = new WorkerOwnership(database);
const repository = new SqliteWorkspaceRepository(database);
const service = createWorkspaceService(repository);
const tradeService = createTradeService(repository);
const agent = new AgentRunCoordinator(
  repository,
  (c) => new DeepSeekProvider(c, fetch, process.argv[3]),
);
let eventsTimer: ReturnType<typeof setInterval> | undefined;
let eventsCursor = 0;
const stopEvents = () => {
  clearInterval(eventsTimer);
  eventsTimer = undefined;
};
process.parentPort.on("message", async (event: { data: unknown }) => {
  const watch = RunEventsWatchSchema.safeParse(event.data);
  if (watch.success) {
    stopEvents();
    if (watch.data.enabled)
      eventsTimer = setInterval(() => {
        try {
          if (!repository.read()) return;
          const batch = repository.runStore().eventHints(eventsCursor);
          eventsCursor = batch.cursor;
          for (const hint of batch.hints) process.parentPort?.postMessage(hint);
        } catch {
          /* Durable page reads expose safe failures; never publish uncommitted/raw data. */
        }
      }, 300);
    return;
  }
  const parsed = WorkerRequestSchema.safeParse(event.data);
  if (!parsed.success) return;
  const { id, command } = parsed.data;
  const check = CheckCommandSchema.safeParse(command);
  if (check.success) {
    const result = repository.executeChecks(check.data, {
      actorId: "local-user",
      origin: "human_ui",
    });
    process.parentPort?.postMessage({ id, result });
    return;
  }
  const events = RunEventsCommandSchema.safeParse(command);
  if (events.success) {
    process.parentPort?.postMessage({ id, result: agent.events(events.data) });
    return;
  }
  const readCommand = AgentReadCommandSchema.safeParse(command);
  if (readCommand.success) {
    const result = await agent.executeReadLegacy(readCommand.data, parsed.data.credentials);
    process.parentPort?.postMessage({ id, result });
    return;
  }
  const runCommand = RunCommandSchema.safeParse(command);
  if (runCommand.success) {
    const result = agent.execute(runCommand.data, parsed.data.credentials);
    process.parentPort?.postMessage({ id, result });
    return;
  }
  const agentCommand = AgentCommandSchema.safeParse(command);
  if (agentCommand.success) {
    const result = await agent.executeLegacy(agentCommand.data, parsed.data.credentials);
    process.parentPort?.postMessage({ id, result });
    return;
  }
  const handler = TradeCommandSchema.safeParse(command).success ? tradeService : service;
  const result = handler.execute(command, { actorId: "local-user", origin: "human_ui" });
  process.parentPort?.postMessage({ id, result });
});
process.parentPort.postMessage({ type: "ready" });
process.on("exit", () => {
  stopEvents();
  repository.close();
  ownership.close();
});
