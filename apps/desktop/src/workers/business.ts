import {
  AgentCommandSchema,
  AgentReadCommandSchema,
  TradeCommandSchema,
  WorkerRequestSchema,
} from "@tradequote/contracts";
import { createTradeService, createWorkspaceService } from "@tradequote/domain";
import {
  AgentExecutor,
  CatalogQuoteReadService,
  DeepSeekProvider,
  SqliteWorkspaceRepository,
} from "@tradequote/infrastructure";

const database = process.argv[2];
if (!database || !process.parentPort) throw new Error("BUSINESS_WORKER_REQUIRES_HOST");
const repository = new SqliteWorkspaceRepository(database);
const service = createWorkspaceService(repository);
const tradeService = createTradeService(repository);
const agent = new AgentExecutor(repository, (c) => new DeepSeekProvider(c, fetch, process.argv[3]));
const reader = new CatalogQuoteReadService(
  repository,
  (c) => new DeepSeekProvider(c, fetch, process.argv[3]),
);
process.parentPort.on("message", async (event: { data: unknown }) => {
  const parsed = WorkerRequestSchema.safeParse(event.data);
  if (!parsed.success) return;
  const { id, command } = parsed.data;
  const readCommand = AgentReadCommandSchema.safeParse(command);
  if (readCommand.success) {
    const result = await reader.execute(readCommand.data, parsed.data.credentials);
    process.parentPort?.postMessage({ id, result });
    return;
  }
  const agentCommand = AgentCommandSchema.safeParse(command);
  if (agentCommand.success) {
    const result = await agent.execute(agentCommand.data, parsed.data.credentials);
    process.parentPort?.postMessage({ id, result });
    return;
  }
  const handler = TradeCommandSchema.safeParse(command).success ? tradeService : service;
  const result = handler.execute(command, { actorId: "local-user", origin: "human_ui" });
  process.parentPort?.postMessage({ id, result });
});
process.on("exit", () => repository.close());
