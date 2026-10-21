import { createServer } from "node:http";
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

it("does not send pre-cancelled requests or expose the abort reason", async () => {
  const controller = new AbortController();
  controller.abort(new Error("SECRET abort reason"));
  const transport = vi.fn<typeof fetch>();
  await expect(
    new DeepSeekProvider(creds, transport).json(messages, controller.signal),
  ).rejects.toMatchObject({ code: "CANCELLED", message: "模型请求已取消，未提交新版本" });
  expect(transport).not.toHaveBeenCalled();
});

it("aborts an actual partial HTTP response and closes the request", async () => {
  let started: () => void = () => {};
  let disconnected: () => void = () => {};
  const receiving = new Promise<void>((r) => {
    started = r;
  });
  const closed = new Promise<void>((r) => {
    disconnected = r;
  });
  const server = createServer((_req, res) => {
    res.on("close", disconnected);
    res.writeHead(200, { "content-type": "application/json" });
    res.write('{"choices":[');
    started();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("fixture port");
    const controller = new AbortController();
    const request = new DeepSeekProvider(creds, fetch, `http://127.0.0.1:${address.port}`).json(
      messages,
      controller.signal,
    );
    // Attach the rejection assertion before triggering cancellation.
    const rejected = expect(request).rejects.toMatchObject({ code: "CANCELLED" });
    await receiving;
    controller.abort();
    await rejected;
    await closed;
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

it("preserves the first abort cause when cancellation follows a timeout", async () => {
  const controller = new AbortController();
  const transport = vi.fn<typeof fetch>().mockImplementation(
    (_url, options) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener(
          "abort",
          () => {
            controller.abort();
            reject(new Error("synthetic abort"));
          },
          { once: true },
        );
      }),
  );
  await expect(
    new DeepSeekProvider(creds, transport, undefined, 10).json(messages, controller.signal),
  ).rejects.toMatchObject({ code: "MODEL_TIMEOUT" });
  expect(transport).toHaveBeenCalledTimes(1);
});
