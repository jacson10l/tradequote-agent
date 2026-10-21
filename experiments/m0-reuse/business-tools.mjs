import { defineTool } from "@deepseek-ai/dsh-tools";

export const name = "tradequote-m0-business-tools";
export const inject = ["tools"];
const definitions = {
  search_catalog: { query: { type: "string", required: true } },
  calculate_quote: { sku: { type: "string", required: true }, quantity: { type: "string", required: true } },
  create_quote_revision: { calculationId: { type: "string", required: true }, expectedVersion: { type: "integer", required: true } },
};

// Temporary bridge: the host assigns identity/idempotency, never the model.
export function apply(ctx) {
  ctx.tools.guard(exec => Object.hasOwn(definitions, exec.name) ? undefined : "M0_TOOL_NOT_ALLOWED");
  for (const [name, parameters] of Object.entries(definitions)) {
    ctx.tools.register(defineTool({
      name, description: `Synthetic M0 business fixture: ${name}`, parameters,
      output: {
        schema: { type: "json" },
        render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }],
      },
      async execute(args, exec) {
        // Upstream DSL parameter roots are open: explicitly reject extra fields.
        if (Object.keys(args).some(key => !Object.hasOwn(parameters, key))) {
          throw new Error("M0_UNEXPECTED_ARGUMENT");
        }
        const response = await fetch(process.env.M0_BUSINESS_URL, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${process.env.M0_BRIDGE_TOKEN}` },
          body: JSON.stringify({ tool: name, args }),
          signal: exec.signal,
        });
        if (!response.ok) throw new Error(`M0_BUSINESS_ERROR:${response.status}`);
        return response.json();
      },
    }));
  }
}
