import { expect, it, vi } from "vitest";
import { DeepSeekProvider } from "./deepseek";

const creds = { key: "synthetic-key", model: "test-model" };
const messages = [{ role: "user" as const, content: 'Return JSON {"probe":"tradequote"}' }];
const good = () =>
  new Response(
    JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: '{"probe":"tradequote"}' } }],
    }),
  );
it("calls fixed HTTPS endpoint, disables redirects, bounds tokens and validates JSON envelope", async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(good());
  expect(await new DeepSeekProvider(creds, transport).json(messages)).toEqual({
    probe: "tradequote",
  });
  expect(transport.mock.calls[0]?.[0]).toBe("https://api.deepseek.com/chat/completions");
  expect(transport.mock.calls[0]?.[1]).toMatchObject({
    redirect: "error",
    headers: { Authorization: "Bearer synthetic-key" },
  });
  expect(JSON.parse(String(transport.mock.calls[0]?.[1]?.body))).toMatchObject({
    model: "test-model",
    stream: false,
    response_format: { type: "json_object" },
    thinking: { type: "disabled" },
  });
});
it("redacts HTTP and network errors and rejects empty, truncated, oversized or malformed responses", async () => {
  for (const [response, code] of [
    [new Response("SECRET upstream body", { status: 401 }), "MODEL_AUTH_FAILED"],
    [new Response("SECRET", { status: 429 }), "MODEL_RATE_LIMITED"],
    [new Response("SECRET", { status: 500 }), "CAPABILITY_UNAVAILABLE"],
    [new Response("not-json"), "MODEL_INVALID_OUTPUT"],
    [new Response("x".repeat(131073)), "MODEL_INVALID_OUTPUT"],
    [
      new Response(
        JSON.stringify({ choices: [{ finish_reason: "length", message: { content: "{}" } }] }),
      ),
      "MODEL_INVALID_OUTPUT",
    ],
    [
      new Response(
        JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "" } }] }),
      ),
      "MODEL_INVALID_OUTPUT",
    ],
  ] as const) {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expect(new DeepSeekProvider(creds, transport).json(messages)).rejects.toMatchObject({
      code,
    });
  }
  const transport = vi
    .fn<typeof fetch>()
    .mockRejectedValue(new Error("SECRET token synthetic-key"));
  await expect(new DeepSeekProvider(creds, transport).json(messages)).rejects.toMatchObject({
    code: "CAPABILITY_UNAVAILABLE",
    message: "模型连接失败，请检查网络后重试",
  });
});
it("times out without retrying the provider", async () => {
  const transport = vi.fn<typeof fetch>().mockImplementation(
    (_url, options) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => reject(new Error("abort")), {
          once: true,
        });
      }),
  );
  await expect(
    new DeepSeekProvider(creds, transport, undefined, 10).json(messages),
  ).rejects.toMatchObject({ code: "MODEL_TIMEOUT" });
  expect(transport).toHaveBeenCalledTimes(1);
});
