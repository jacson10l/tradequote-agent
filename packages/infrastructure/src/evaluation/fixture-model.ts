import type { Product, RevisionProposal, Understanding } from "@tradequote/contracts";
import { z } from "zod";
import type { FailureCase, Language } from "./cases";
import { terms } from "./cases";

const message = z.object({ role: z.string(), content: z.string() });
const toolResult = z.object({ toolResult: z.object({ name: z.string(), data: z.unknown() }) });
const idResult = z.object({ ok: z.literal(true), data: z.object({ candidateId: z.uuid() }) });
const validationResult = z.object({
  ok: z.literal(true),
  data: z.object({ validationId: z.uuid() }),
});
export function fixtureTransport(options: {
  product: Product;
  version: number;
  language: Language;
  failure?: FailureCase;
  clarification?: boolean;
  blocked?: boolean;
  onPending?: () => void;
}): typeof fetch {
  let requests = 0;
  return async (_url, init) => {
    requests++;
    if (options.failure === "explicit_retry" && requests === 1)
      return new Response("synthetic confidential rate limit", { status: 429 });
    const messages = z
      .object({ messages: z.array(message) })
      .parse(JSON.parse(String(init?.body))).messages;
    const records = messages
      .filter((m) => m.role === "user" && m.content.startsWith('{"toolResult":'))
      .map((m) => toolResult.parse(JSON.parse(m.content)).toolResult);
    const last = records.at(-1);
    const tool = (name: string, input: unknown) => ({ kind: "tool", name, input });
    const { product: p, version, language, failure } = options;
    let output: unknown;
    if (failure === "timeout")
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("synthetic raw secret")), {
          once: true,
        });
      });
    if (failure === "cancel_late") {
      options.onPending?.();
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    if (["auth", "rate_limit", "server"].includes(failure ?? ""))
      return new Response("synthetic confidential upstream text", {
        status: failure === "auth" ? 401 : failure === "rate_limit" ? 429 : 503,
      });
    if (failure === "network") throw new Error("synthetic confidential network stack");
    if (failure === "invalid_json") return new Response("synthetic non-JSON secret");
    if (failure === "oversized") return new Response("x".repeat(131073));
    if (failure === "empty")
      return new Response(
        JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "" } }] }),
      );
    if (options.clarification)
      output = { kind: "clarification", question: "Synthetic clarification required" };
    else if (failure === "extra_field")
      output = { kind: "complete", summary: "synthetic", approved: true };
    else if (failure === "amount_injection")
      output = tool("calculate_quote", { proposal: { lines: [], goodsTotal: "0.00" } });
    else if (failure === "unknown_tool") output = tool("publish_catalog", {});
    else if (failure === "false_complete")
      output = { kind: "complete", summary: "Saved and approved synthetic quote" };
    else if (failure === "tool_budget") output = tool("search_catalog", { query: p.sku });
    else if (!last)
      output = tool(
        version === 1 ? "search_catalog" : "get_quote",
        version === 1
          ? { query: p.sku }
          : {
              revisionId: z
                .object({
                  hostContext: z.object({
                    operation: z.object({ payload: z.object({ baseId: z.uuid() }) }),
                  }),
                })
                .parse(
                  JSON.parse(
                    messages.find((m) => m.content.startsWith('{"hostContext":'))!.content,
                  ),
                ).hostContext.operation.payload.baseId,
            },
      );
    else if (last.name === "search_catalog")
      output = tool("get_product_revisions", { productIds: [p.id] });
    else if (last.name === "get_product_revisions" || last.name === "get_quote") {
      const t = terms[language];
      const proposal: Understanding | RevisionProposal =
        version === 1
          ? {
              lines: [{ productId: p.id, quantity: "100", unit: p.unit }],
              payment: options.blocked ? "" : t.payment,
              delivery: t.delivery,
              summary: "Synthetic fixture proposal",
            }
          : {
              patches:
                version === 2
                  ? [{ op: "setQuantity", productId: p.id, quantity: "120" }]
                  : [
                      { op: "setPayment", value: t.nextPayment },
                      { op: "setDelivery", value: t.nextDelivery },
                    ],
              summary: "Synthetic fixture revision",
            };
      output = tool("calculate_quote", { proposal });
    } else if (last.name === "calculate_quote") output = tool("search_knowledge", {});
    else if (last.name === "search_knowledge")
      output = tool("validate_quote", {
        candidateId: idResult.parse(
          [...records].reverse().find((r) => r.name === "calculate_quote")?.data,
        ).data.candidateId,
      });
    else if (last.name === "validate_quote")
      output = tool(version === 1 ? "create_draft" : "apply_patch", {
        candidateId: idResult.parse(
          [...records].reverse().find((r) => r.name === "calculate_quote")?.data,
        ).data.candidateId,
        validationId: validationResult.parse(last.data).data.validationId,
      });
    else throw new Error("Synthetic fixture reached unexpected action");
    return new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: failure === "truncated" ? "length" : "stop",
            message: { content: JSON.stringify(output) },
          },
        ],
      }),
    );
  };
}
