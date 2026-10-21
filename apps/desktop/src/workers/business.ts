import { WorkerRequestSchema } from "@tradequote/contracts";
import { createWorkspaceService } from "@tradequote/domain";
import { SqliteWorkspaceRepository } from "@tradequote/infrastructure";

const database = process.argv[2];
if (!database || !process.parentPort) throw new Error("BUSINESS_WORKER_REQUIRES_HOST");
const repository = new SqliteWorkspaceRepository(database);
const service = createWorkspaceService(repository);
process.parentPort.on("message", (event: { data: unknown }) => {
  const parsed = WorkerRequestSchema.safeParse(event.data);
  if (!parsed.success) return;
  const { id, command } = parsed.data;
  const result = service.execute(command, { actorId: "local-user", origin: "human_ui" });
  process.parentPort?.postMessage({ id, result });
});
process.on("exit", () => repository.close());
