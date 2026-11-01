import type { z } from "zod";
import { type CheckClient, CheckCommandSchema } from "./checks";
import { type KnowledgeClient, KnowledgeCommandSchema } from "./knowledge";
import { type KnowledgeBuildClient, KnowledgeBuildCommandSchema } from "./knowledge-build";
import { type KnowledgeDesktopClient, KnowledgeDesktopCommandSchema } from "./knowledge-desktop";
import {
  type KnowledgeMaintenanceClient,
  KnowledgeMaintenanceCommandSchema,
} from "./knowledge-maintenance";
import { type WikiClient, WikiCommandSchema } from "./knowledge-wiki";
import type { FailureSchema } from "./protocol";
import { type RunEventsClient, RunEventsCommandSchema } from "./run-events";
import { type RunClient, RunCommandSchema } from "./runs";

// Deliberately local: no new IPC route is exposed before the corresponding service ships.
function unavailable(schema: z.ZodType, input: unknown): Promise<z.infer<typeof FailureSchema>> {
  const valid = schema.safeParse(input).success;
  return Promise.resolve({
    ok: false,
    error: {
      code: valid ? "CAPABILITY_UNAVAILABLE" : "VALIDATION_ERROR",
      message: valid ? "公共契约已就绪，业务能力尚未接入" : "请求字段不合法",
      retryable: false,
      issues: [],
    },
  });
}
export const unavailableFirstBatchClient: KnowledgeDesktopClient &
  KnowledgeClient &
  CheckClient &
  RunClient &
  WikiClient &
  KnowledgeBuildClient &
  RunEventsClient &
  KnowledgeMaintenanceClient = {
  executeKnowledgeDesktop: (command) => unavailable(KnowledgeDesktopCommandSchema, command),
  executeKnowledgeBuild: (command) => unavailable(KnowledgeBuildCommandSchema, command),
  executeWikiMaintenance: (command) => unavailable(KnowledgeMaintenanceCommandSchema, command),
  getAgentRunEvents: (command) => unavailable(RunEventsCommandSchema, command),
  onAgentRunEvents: () => () => {},
  executeWiki: (command) => unavailable(WikiCommandSchema, command),
  stageKnowledge: (command) => unavailable(KnowledgeCommandSchema.options[0], command),
  publishKnowledge: (command) => unavailable(KnowledgeCommandSchema.options[1], command),
  queryKnowledge: (command) => unavailable(KnowledgeCommandSchema.options[2], command),
  getKnowledgeRevision: (command) => unavailable(KnowledgeCommandSchema.options[3], command),
  checkQuote: (command) => unavailable(CheckCommandSchema.options[0], command),
  getQuoteChecks: (command) => unavailable(CheckCommandSchema.options[1], command),
  listAgentRuns: (command) => unavailable(RunCommandSchema.options[4], command),
  continueAgentRun: (command) => unavailable(RunCommandSchema.options[5], command),
  startAgentRun: (command) => unavailable(RunCommandSchema.options[0], command),
  getAgentRun: (command) => unavailable(RunCommandSchema.options[1], command),
  cancelAgentRun: (command) => unavailable(RunCommandSchema.options[2], command),
  retryAgentRun: (command) => unavailable(RunCommandSchema.options[3], command),
};
