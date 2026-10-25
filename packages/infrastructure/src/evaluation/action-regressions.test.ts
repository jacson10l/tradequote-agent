import { mkdirSync, writeFileSync } from "node:fs";
import type { FailureDiagnostic } from "@tradequote/contracts";
import { afterAll, expect, it, vi } from "vitest";
import { z } from "zod";
import { DeepSeekProvider } from "../deepseek";
import { defineBusinessTool, ToolLoopRuntime } from "../read-tool-runtime";
import * as fixtureModule from "./fixture-model";
import { markdownReport } from "./report";
import { evaluateC04 } from "./runner";

// Invented boundary probes, never captured model responses or evidence of their exact cause.
let reconstructed: unknown;
afterAll(() => {
  mkdirSync(".runtime", { recursive: true });
  writeFileSync(
    ".runtime/c04-action-reconstructed.json",
    `${JSON.stringify(reconstructed, null, 2)}\n`,
  );
});

it("three observed failure boundaries recover under original business checks, without replaying real payloads", async () => {
  const network = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("EXTERNAL_REQUEST_FORBIDDEN"));
  const original = fixtureModule.fixtureTransport;
  let forbiddenPostBlockRequests = 0;
  const changed = vi.spyOn(fixtureModule, "fixtureTransport").mockImplementation((options) => {
    const transport = original(options);
    return async (...args) => {
      const messages: { role: string; content: string }[] = JSON.parse(
        String(args[1]?.body),
      ).messages;
      const records = messages.filter((m) => m.content.startsWith('{"toolResult":'));
      const corrected = messages.some((m) => m.content.startsWith('{"hostFeedback":'));
      const response = await transport(...args);
      if (!response.ok) return response;
      const body = await response.json();
      if (
        options.blocked &&
        JSON.parse(records.at(-1)?.content ?? "{}").toolResult?.name === "validate_quote"
      ) {
        forbiddenPostBlockRequests++;
        body.choices[0].message.content = "SYNTHETIC_PRIVATE_INVALID_JSON";
      } else if (!options.failure && !options.clarification && !options.blocked && !corrected) {
        if (
          options.product.sku === "DEMO-TEE" &&
          options.language === "en" &&
          options.version === 2 &&
          records.length === 1
        )
          body.choices[0].message.content = JSON.stringify({ kind: "tool", name: 7, input: {} });
        if (
          options.product.sku === "DEMO-PANEL" &&
          options.language === "en" &&
          options.version === 1 &&
          records.length === 0
        )
          body.choices[0].message.content = JSON.stringify({
            kind: "clarification",
            question: "Synthetic catalog question",
          });
      }
      return new Response(JSON.stringify(body));
    };
  });
  try {
    const r = await evaluateC04({ mode: "fixture" });
    reconstructed = {
      scope: "synthetic_boundary_reconstructions_not_real_payload_replay",
      realRequests: r.realRequests,
      providerValidation: r.providerValidation,
      caseSetHash: r.caseSetHash,
      status: r.status,
      rows: r.rows,
    };
    for (const id of [
      "apparel-en-v2",
      "panel-en-v1",
      "rule-block",
      "apparel-en-v3",
      "panel-en-v2",
      "panel-en-v3",
    ]) {
      const row = r.rows.find((v) => v.id === id)!;
      expect(row, id).toMatchObject({ status: "passed", reason: "observed" });
      expect(
        row.checks.every((c) => c.passed),
        id,
      ).toBe(true);
    }
    expect(r.rows.find((v) => v.id === "apparel-en-v2")?.diagnostics).toContainEqual(
      expect.objectContaining({
        stage: "action_schema",
        tool: null,
        category: "action_field_type",
        disposition: "feedback",
        modelCall: 2,
      }),
    );
    expect(r.rows.find((v) => v.id === "panel-en-v1")?.diagnostics).toContainEqual(
      expect.objectContaining({
        stage: "clarification",
        tool: null,
        category: "clarification_before_read",
        disposition: "feedback",
        modelCall: 1,
      }),
    );
    expect(r.rows.find((v) => v.id === "rule-block")).toMatchObject({
      expectedErrorCode: "RULE_BLOCKED",
      errorCode: "RULE_BLOCKED",
      modelCalls: 6,
      diagnostics: [
        expect.objectContaining({
          stage: "provider",
          tool: null,
          category: "content_json",
          disposition: "stopped",
          modelCall: 6,
        }),
        expect.objectContaining({
          stage: "tool_execution",
          tool: "validate_quote",
          category: "rule_block",
          disposition: "stopped",
          modelCall: 6,
        }),
      ],
    });
    expect(forbiddenPostBlockRequests).toBe(1);
    expect(r.status).toBe("passed");
    expect(r.realRequests).toBe(0);
    for (const row of r.rows.filter((v) => v.kind === "clarification")) {
      expect(row.status).toBe("passed");
      expect(row.modelCalls).toBe(2);
      expect(row.diagnostics?.map((d) => d.disposition)).toEqual(["feedback", "stopped"]);
    }
    expect(JSON.stringify(r) + markdownReport(r)).not.toContain("SYNTHETIC_PRIVATE");
    expect(network).not.toHaveBeenCalled();
  } finally {
    changed.mockRestore();
    network.mockRestore();
  }
}, 20000);

it.each([
  { output: null, category: "action_shape" },
  { output: [], category: "action_shape" },
  { output: { kind: "SYNTHETIC_PRIVATE_KIND" }, category: "action_kind" },
  { output: { kind: "tool", input: {} }, category: "action_missing_field" },
  { output: { kind: "tool", name: 7, input: {} }, category: "action_field_type" },
  {
    output: { kind: "complete", summary: "synthetic", SYNTHETIC_PRIVATE_FIELD: true },
    category: "action_unknown_field",
  },
  { output: { kind: "clarification", question: "" }, category: "action_invalid_value" },
])("classifies $category with no input values or field paths", async ({ output, category }) => {
  const diagnostics: FailureDiagnostic[] = [];
  const json = vi.fn().mockResolvedValue(output);
  const runtime = new ToolLoopRuntime({ json }, [], {}, undefined, "read", undefined, (d) =>
    diagnostics.push(d),
  );
  await expect(runtime.run("Synthetic action boundary")).rejects.toMatchObject({
    code: "MODEL_INVALID_OUTPUT",
  });
  expect(json).toHaveBeenCalledTimes(1);
  expect(diagnostics).toEqual([
    {
      stage: "action_schema",
      tool: null,
      category,
      disposition: "stopped",
      modelCall: 1,
      errorCode: "MODEL_INVALID_OUTPUT",
    },
  ]);
  expect(JSON.stringify(diagnostics)).not.toContain("SYNTHETIC_PRIVATE");
});

it.each(["action_then_input", "input_then_action", "action_twice"])(
  "shares the existing single correction: %s",
  async (order) => {
    const execute = vi.fn(async () => true);
    const tool = defineBusinessTool({
      name: "search_catalog",
      description: "Synthetic read",
      inputSchema: z.strictObject({ query: z.string() }),
      outputSchema: z.boolean(),
      execute,
    });
    const invalidAction = { kind: "tool", name: 7, input: { query: "SYNTHETIC_PRIVATE_INPUT" } };
    const invalidInput = { kind: "tool", name: "search_catalog", input: { query: 7 } };
    const outputs =
      order === "action_then_input"
        ? [invalidAction, invalidInput]
        : order === "input_then_action"
          ? [invalidInput, invalidAction]
          : [invalidAction, invalidAction];
    let calls = 0;
    const json = vi.fn(async (messages: unknown) => {
      // Invalid action bytes must never be echoed into subsequent requests.
      expect(JSON.stringify(messages)).not.toContain("SYNTHETIC_PRIVATE_INPUT");
      return outputs[calls++];
    });
    const diagnostics: FailureDiagnostic[] = [];
    const runtime = new ToolLoopRuntime({ json }, [tool], {}, undefined, "draft", undefined, (d) =>
      diagnostics.push(d),
    );
    await expect(runtime.run("Synthetic bounded repair")).rejects.toMatchObject({
      code: "MODEL_INVALID_OUTPUT",
    });
    expect(calls).toBe(2);
    expect(execute).not.toHaveBeenCalled();
    expect(diagnostics.map((d) => d.disposition)).toEqual(["feedback", "stopped"]);
  },
);

it.each([
  {
    output: { kind: "tool", name: "search_catalog", input: {}, approved: true },
    category: "action_unknown_field",
    code: "MODEL_INVALID_OUTPUT",
  },
  {
    output: { kind: "SYNTHETIC_PRIVATE_KIND" },
    category: "action_kind",
    code: "MODEL_INVALID_OUTPUT",
  },
  {
    output: { kind: "tool", name: "publish_catalog", input: {} },
    category: "unknown_tool",
    code: "ACTION_NOT_ALLOWED",
  },
])(
  "draft hard stop $category does not consume a correction or execute tools",
  async ({ output, category, code }) => {
    const json = vi.fn().mockResolvedValue(output);
    const diagnostics: FailureDiagnostic[] = [];
    const runtime = new ToolLoopRuntime({ json }, [], {}, undefined, "draft", undefined, (d) =>
      diagnostics.push(d),
    );
    await expect(runtime.run("Synthetic hard stop")).rejects.toMatchObject({ code });
    expect(json).toHaveBeenCalledTimes(1);
    expect(diagnostics).toEqual([expect.objectContaining({ category, disposition: "stopped" })]);
  },
);

it.each(["auth", "truncated", "stale_block"])(
  "verified block cannot mask %s",
  async (probe) => {
    const original = fixtureModule.fixtureTransport;
    let blockSeen = false;
    const changed = vi.spyOn(fixtureModule, "fixtureTransport").mockImplementation((options) => {
      const transport = original(options);
      if (!options.blocked) return transport;
      return async (...args) => {
        const messages: { content: string }[] = JSON.parse(String(args[1]?.body)).messages;
        const records = messages
          .filter((m) => m.content.startsWith('{"toolResult":'))
          .map((m) => JSON.parse(m.content).toolResult);
        const last = records.at(-1);
        if (last?.name === "validate_quote") {
          blockSeen = true;
          if (probe === "auth") return new Response(null, { status: 401 });
          if (probe === "truncated")
            return new Response(
              JSON.stringify({
                choices: [{ finish_reason: "length", message: { content: "SYNTHETIC_PRIVATE" } }],
              }),
            );
          const calculated = JSON.parse(
            messages.find((m) => m.content.includes('"name":"calculate_quote","input"'))!.content,
          );
          calculated.input.proposal.payment = "Synthetic corrected payment";
          return new Response(
            JSON.stringify({
              choices: [
                { finish_reason: "stop", message: { content: JSON.stringify(calculated) } },
              ],
            }),
          );
        }
        if (
          probe === "stale_block" &&
          records.filter((r) => r.name === "calculate_quote").length === 2
        )
          return new Response(
            JSON.stringify({
              choices: [
                { finish_reason: "stop", message: { content: "SYNTHETIC_PRIVATE_INVALID_JSON" } },
              ],
            }),
          );
        return transport(...args);
      };
    });
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("EXTERNAL_REQUEST_FORBIDDEN"));
    try {
      const r = await evaluateC04({ mode: "fixture" });
      const row = r.rows.find((v) => v.id === "rule-block")!;
      expect(blockSeen).toBe(true);
      expect(row).toMatchObject({
        status: "failed",
        expectedErrorCode: "RULE_BLOCKED",
        errorCode: probe === "auth" ? "MODEL_AUTH_FAILED" : "MODEL_INVALID_OUTPUT",
        modelCalls: probe === "stale_block" ? 7 : 6,
      });
      expect(row.diagnostics?.some((d) => d.category === "rule_block")).toBe(false);
      expect(row.checks.filter((c) => !c.passed).map((c) => c.id)).toEqual(["outcome"]);
      expect(JSON.stringify(r)).not.toContain("SYNTHETIC_PRIVATE");
      expect(network).not.toHaveBeenCalled();
    } finally {
      changed.mockRestore();
      network.mockRestore();
    }
  },
  20000,
);

it("content_json without a verified rule block remains a single hard failure", async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        choices: [
          { finish_reason: "stop", message: { content: "SYNTHETIC_PRIVATE_INVALID_JSON" } },
        ],
      }),
    ),
  );
  const diagnostics: FailureDiagnostic[] = [];
  const runtime = new ToolLoopRuntime(
    new DeepSeekProvider({ key: "synthetic-action-key", model: "synthetic-model" }, transport),
    [],
    {},
    undefined,
    "draft",
    undefined,
    (d) => diagnostics.push(d),
  );
  await expect(runtime.run("Synthetic parser boundary")).rejects.toMatchObject({
    code: "MODEL_INVALID_OUTPUT",
  });
  expect(transport).toHaveBeenCalledTimes(1);
  expect(diagnostics).toEqual([
    {
      stage: "provider",
      tool: null,
      category: "content_json",
      disposition: "stopped",
      modelCall: 1,
      errorCode: "MODEL_INVALID_OUTPUT",
    },
  ]);
});
