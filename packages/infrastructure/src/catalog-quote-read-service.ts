import {
  type AgentReadCommand,
  AgentReadCommandSchema,
  AgentReadDataSchema,
  type AgentReadResult,
  AgentReadResultSchema,
  failure,
  type ModelCredentials,
  type ReadToolObservation,
  ReadToolObservationSchema,
} from "@tradequote/contracts";
import { TradeFault, type TradeRepository, type WorkspaceRepository } from "@tradequote/domain";
import { CatalogQuoteReadAgent } from "./catalog-quote-read-agent";
import { CodexHarness } from "./codex-harness";
import { DeepSeekProvider } from "./deepseek";

/** Process-local admission only; no durable run or automatic provider retry. */
export class CatalogQuoteReadService {
  private active:
    | { requestId: string; fingerprint: string; promise: Promise<AgentReadResult> }
    | undefined;
  constructor(
    private readonly repository: TradeRepository & Pick<WorkspaceRepository, "read">,
    private readonly provider: (credentials: ModelCredentials) => Pick<DeepSeekProvider, "json"> = (
      credentials,
    ) => new DeepSeekProvider(credentials),
    private readonly now = () => new Date().toISOString(),
    private readonly codex: Pick<CodexHarness, "run"> = new CodexHarness(),
  ) {}

  execute(
    input: AgentReadCommand,
    credentials?: ModelCredentials,
    lifecycle?: {
      clarificationHistory?: { question: string; answer: string }[] | undefined;
      cancellation: AbortSignal;
      onObservation: (observation: ReadToolObservation) => void;
    },
  ): Promise<AgentReadResult> {
    const parsed = AgentReadCommandSchema.safeParse(input);
    if (!parsed.success) return Promise.resolve(failure("VALIDATION_ERROR", "只读任务字段不合法"));
    const command = parsed.data;
    const fingerprint = JSON.stringify(command.payload);
    if (this.active) {
      if (this.active.requestId === command.requestId)
        return this.active.fingerprint === fingerprint
          ? this.active.promise
          : Promise.resolve(failure("IDEMPOTENCY_CONFLICT", "同一请求标识不能用于不同只读任务"));
      return Promise.resolve(
        failure("CAPABILITY_UNAVAILABLE", "已有只读任务运行中，请等待完成后再运行"),
      );
    }
    if (!credentials)
      return Promise.resolve(
        failure("MODEL_AUTH_FAILED", "请先在模型设置中保存 API Key 和模型 ID"),
      );
    const promise = this.run(command, credentials, lifecycle).finally(() => {
      this.active = undefined;
    });
    this.active = { requestId: command.requestId, fingerprint, promise };
    return promise;
  }

  private async run(
    command: AgentReadCommand,
    credentials: ModelCredentials | undefined,
    lifecycle?: {
      clarificationHistory?: { question: string; answer: string }[] | undefined;
      cancellation: AbortSignal;
      onObservation: (observation: ReadToolObservation) => void;
    },
  ): Promise<AgentReadResult> {
    try {
      const workspace = this.repository.read();
      if (!workspace) return failure("NOT_FOUND", "请先创建工作区");
      const asOf = this.now();
      const adapter = new CatalogQuoteReadAgent(
        this.repository,
        credentials
          ? this.provider(credentials)
          : {
              json: async () => {
                throw new TradeFault("ACTION_NOT_ALLOWED", "Codex任务没有模型回退");
              },
            },
        {
          workspaceId: workspace.id,
          asOf,
          quoteRevisionIds: command.payload.quoteRevisionIds,
          ...(command.payload.productIds === undefined
            ? {}
            : { productIds: command.payload.productIds }),
        },
        undefined,
        lifecycle?.clarificationHistory,
      );
      let data;
      if (command.payload.executionMode === "codex_harness") {
        const prepared = adapter.prepare();
        const outcome = await this.codex.run({
          policy: "read",
          ...(credentials ? { credentials } : {}),
          instruction: command.payload.instruction,
          context: {
            ...prepared.hostContext,
            clarificationHistory: lifecycle?.clarificationHistory ?? [],
          },
          tools: prepared.tools.map((tool) => ({
            ...tool,
            invoke: async (input, signal) => {
              if (lifecycle?.cancellation.aborted) throw new TradeFault("CANCELLED", "查询已取消");
              const count = prepared.observations.length;
              try {
                return await tool.invoke(input, signal);
              } catch (error) {
                prepared.observations.push({
                  tool: tool.name,
                  result: failure(
                    error instanceof TradeFault ? error.code : "CAPABILITY_UNAVAILABLE",
                    error instanceof TradeFault ? error.message : "只读工具执行失败",
                  ),
                });
                throw error;
              } finally {
                if (prepared.observations.length > count && !lifecycle?.cancellation.aborted)
                  lifecycle?.onObservation(
                    ReadToolObservationSchema.parse(prepared.observations.at(-1)),
                  );
              }
            },
          })),
          availableTools: () => prepared.tools.map((t) => t.name),
          cancellation: lifecycle?.cancellation ?? new AbortController().signal,
        });
        data = AgentReadDataSchema.parse({
          ...outcome,
          workspaceId: workspace.id,
          asOf,
          observations: prepared.observations,
        });
      } else {
        data = await adapter.run(command.payload.instruction, lifecycle?.cancellation);
        for (const observation of data.observations) lifecycle?.onObservation(observation);
      }
      if (lifecycle?.cancellation.aborted) throw new TradeFault("CANCELLED", "查询已取消");
      const evidenceIds = [
        ...new Set(data.observations.flatMap((o) => (o.result.ok ? o.result.evidenceIds : []))),
      ];
      return AgentReadResultSchema.parse({ ok: true, data, warnings: [], evidenceIds });
    } catch (error) {
      return error instanceof TradeFault
        ? failure(error.code, error.message)
        : failure("CAPABILITY_UNAVAILABLE", "只读任务失败，未保存报价；请核对资料后重新运行");
    }
  }
}
