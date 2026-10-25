import {
  type AgentReadCommand,
  AgentReadCommandSchema,
  type AgentReadResult,
  AgentReadResultSchema,
  failure,
  type ModelCredentials,
} from "@tradequote/contracts";
import { TradeFault, type TradeRepository, type WorkspaceRepository } from "@tradequote/domain";
import { CatalogQuoteReadAgent } from "./catalog-quote-read-agent";
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
  ) {}

  execute(input: AgentReadCommand, credentials?: ModelCredentials): Promise<AgentReadResult> {
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
    const promise = this.run(command, credentials).finally(() => {
      this.active = undefined;
    });
    this.active = { requestId: command.requestId, fingerprint, promise };
    return promise;
  }

  private async run(
    command: AgentReadCommand,
    credentials: ModelCredentials,
  ): Promise<AgentReadResult> {
    try {
      const workspace = this.repository.read();
      if (!workspace) return failure("NOT_FOUND", "请先创建工作区");
      const data = await new CatalogQuoteReadAgent(this.repository, this.provider(credentials), {
        workspaceId: workspace.id,
        asOf: this.now(),
        quoteRevisionIds: command.payload.quoteRevisionIds,
        ...(command.payload.productIds === undefined
          ? {}
          : { productIds: command.payload.productIds }),
      }).run(command.payload.instruction);
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
