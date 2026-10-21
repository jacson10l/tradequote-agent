import { AgentCommandSchema, TradeCommandSchema, WorkerRequestSchema } from "@tradequote/contracts";
import { createTradeService, createWorkspaceService } from "@tradequote/domain";
import {
  AgentExecutor,
  DeepSeekProvider,
  SqliteWorkspaceRepository,
} from "@tradequote/infrastructure";

const database = process.argv[2];
if (!database || !process.parentPort) throw new Error("BUSINESS_WORKER_REQUIRES_HOST");
const repository = new SqliteWorkspaceRepository(database);
const service = createWorkspaceService(repository);
const tradeService = createTradeService(repository);
const agent = new AgentExecutor(repository, (c) => new DeepSeekProvider(c, fetch, process.argv[3]));
process.parentPort.on("message", async (event: { data: unknown }) => {
  const parsed = WorkerRequestSchema.safeParse(event.data);
  if (!parsed.success) return;
  const { id, command } = parsed.data;
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
