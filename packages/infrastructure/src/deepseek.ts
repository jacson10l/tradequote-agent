import type { ModelCredentials, ProviderOutputCategory } from "@tradequote/contracts";
import { TradeFault } from "@tradequote/domain";
import { z } from "zod";

const responseEnvelope = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.unknown().optional(),
        message: z
          .object({
            content: z.unknown().optional(),
            tool_calls: z.array(z.unknown()).nullable().optional(),
          })
          .optional(),
      }),
    )
    .min(1),
});
export type ModelMessage = { role: "system" | "user" | "assistant"; content: string };
// Internal typed cause only; no response bytes, parser text or credentials are retained.
export class ModelOutputFault extends TradeFault {
  constructor(readonly category: ProviderOutputCategory) {
    super("MODEL_INVALID_OUTPUT", "模型输出未通过格式校验，未保存报价");
  }
}
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
        await response.body?.cancel().catch(() => {});
        if (response.status === 401 || response.status === 403)
          throw new TradeFault("MODEL_AUTH_FAILED", "模型鉴权失败，请检查 API Key");
        if (response.status === 429)
          throw new TradeFault("MODEL_RATE_LIMITED", "模型服务限流，请稍后重试同一操作");
        throw new TradeFault("CAPABILITY_UNAVAILABLE", "模型服务暂不可用，请稍后重试");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new ModelOutputFault("empty_response");
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 131072) throw new ModelOutputFault("response_oversized");
          chunks.push(part.value);
        }
      } finally {
        // Cleanup is best effort and must never replace the first protocol/HTTP fault.
        await reader.cancel().catch(() => {});
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        throw new ModelOutputFault("response_encoding");
      }
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        throw new ModelOutputFault("response_json");
      }
      // Access only the supported envelope fields, without preserving arbitrary upstream data.
      const envelope = responseEnvelope.safeParse(body);
      if (!envelope.success) throw new ModelOutputFault("response_envelope");
      const choice = envelope.data.choices[0];
      if (choice?.finish_reason === "length") throw new ModelOutputFault("response_truncated");
      if (
        choice?.finish_reason !== "stop" ||
        typeof choice?.message?.content !== "string" ||
        choice.message.tool_calls?.length
      )
        throw new ModelOutputFault("response_envelope");
      if (!choice.message.content.trim()) throw new ModelOutputFault("empty_content");
      try {
        return JSON.parse(choice.message.content);
      } catch {
        throw new ModelOutputFault("content_json");
      }
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

  /**
   * 纯文本对话（用于虚拟形象闲聊等非结构化场景）。与 json() 的区别：
   * 不强制 response_format=json_object，直接返回 assistant 的自然语言文本。
   * 复用同一套超时、鉴权、限流与输出校验，但不解析 JSON。
   */
  async chat(messages: ModelMessage[], cancellation?: AbortSignal): Promise<string> {
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
          max_tokens: 2048,
          thinking: { type: "disabled" },
        }),
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        if (response.status === 401 || response.status === 403)
          throw new TradeFault("MODEL_AUTH_FAILED", "模型鉴权失败，请检查 API Key");
        if (response.status === 429)
          throw new TradeFault("MODEL_RATE_LIMITED", "模型服务限流，请稍后重试同一操作");
        throw new TradeFault("CAPABILITY_UNAVAILABLE", "模型服务暂不可用，请稍后重试");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new ModelOutputFault("empty_response");
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 131072) throw new ModelOutputFault("response_oversized");
          chunks.push(part.value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        throw new ModelOutputFault("response_encoding");
      }
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        throw new ModelOutputFault("response_json");
      }
      const envelope = responseEnvelope.safeParse(body);
      if (!envelope.success) throw new ModelOutputFault("response_envelope");
      const choice = envelope.data.choices[0];
      if (choice?.finish_reason === "length") throw new ModelOutputFault("response_truncated");
      if (choice?.finish_reason !== "stop" || typeof choice?.message?.content !== "string")
        throw new ModelOutputFault("response_envelope");
      const content = choice.message.content.trim();
      if (!content) throw new ModelOutputFault("empty_content");
      return content;
    } catch (error) {
      if (cancellation?.aborted && signal.reason === cancellation.reason)
        throw new TradeFault("CANCELLED", "模型请求已取消");
      if (signal.aborted) throw new TradeFault("MODEL_TIMEOUT", "模型请求超时，可重试");
      if (error instanceof TradeFault) throw error;
      throw new TradeFault("CAPABILITY_UNAVAILABLE", "模型连接失败，请检查网络后重试");
    }
  }
}
