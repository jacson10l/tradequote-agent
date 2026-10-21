import type { ModelCredentials } from "@tradequote/contracts";
import { TradeFault } from "@tradequote/domain";
export type ModelMessage = { role: "system" | "user" | "assistant"; content: string };
export class DeepSeekProvider {
  constructor(
    private readonly credentials: ModelCredentials,
    private readonly transport: typeof fetch = fetch,
    private readonly endpoint = "https://api.deepseek.com",
    private readonly timeoutMs = 45000,
  ) {}
  async json(messages: ModelMessage[], cancellation?: AbortSignal): Promise<unknown> {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const signal = cancellation ? AbortSignal.any([cancellation, timeout]) : timeout;
    try {
      signal.throwIfAborted();
      const response = await this.transport(`${this.endpoint}/chat/completions`, {
        method: "POST",
        redirect: "error",
        signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.credentials.key}`,
        },
        body: JSON.stringify({
          model: this.credentials.model,
          messages,
          stream: false,
          max_tokens: 4096,
          thinking: { type: "disabled" },
          response_format: { type: "json_object" },
        }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 401 || response.status === 403)
          throw new TradeFault("MODEL_AUTH_FAILED", "模型鉴权失败，请检查 API Key");
        if (response.status === 429)
          throw new TradeFault("MODEL_RATE_LIMITED", "模型服务限流，请稍后重试同一操作");
        throw new TradeFault("CAPABILITY_UNAVAILABLE", "模型服务暂不可用，请稍后重试");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new TradeFault("MODEL_INVALID_OUTPUT", "模型响应为空");
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 131072) throw new TradeFault("MODEL_INVALID_OUTPUT", "模型响应超过大小限制");
          chunks.push(part.value);
        }
      } finally {
        await reader.cancel();
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      const choice = body?.choices?.[0];
      if (
        choice?.finish_reason !== "stop" ||
        typeof choice?.message?.content !== "string" ||
        choice.message.tool_calls?.length
      )
        throw new TradeFault("MODEL_INVALID_OUTPUT", "模型输出不完整或格式不支持，未保存报价");
      return JSON.parse(choice.message.content);
    } catch (error) {
      if (cancellation?.aborted && signal.reason === cancellation.reason)
        throw new TradeFault("CANCELLED", "模型请求已取消，未提交新版本");
      if (signal.aborted)
        throw new TradeFault("MODEL_TIMEOUT", "模型请求超时，未提交新版本；可重试同一操作");
      if (error instanceof TradeFault) throw error;
      if (
        error instanceof SyntaxError ||
        (error instanceof TypeError && String(error.message).includes("encoded"))
      )
        throw new TradeFault("MODEL_INVALID_OUTPUT", "模型返回了无效 JSON，未保存报价");
      throw new TradeFault("CAPABILITY_UNAVAILABLE", "模型连接失败，请检查网络后重试");
    }
  }
}
