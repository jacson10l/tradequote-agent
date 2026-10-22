import { expect, it, vi } from "vitest";
import { EvaluationRowSchema, markdownReport } from "./report";
import { evaluateC04 } from "./runner";

it("exports bounded enum-only failure evidence while accepting unchanged legacy rows", async () => {
  const network = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("SYNTHETIC_SECRET_PAYLOAD"));
  try {
    const report = await evaluateC04({ mode: "fixture" });
    expect(report.status).toBe("passed");
    const row = (id: string) => report.rows.find((r) => r.id === `failure-${id}`)!;
    expect(row("unknown_tool")).toMatchObject({
      diagnostics: [
        { stage: "tool_lookup", tool: null, category: "unknown_tool", disposition: "stopped" },
      ],
    });
    expect(row("amount_injection")).toMatchObject({
      diagnostics: [
        {
          stage: "tool_input",
          tool: "calculate_quote",
          category: "unknown_field",
          disposition: "stopped",
        },
      ],
    });
    expect(row("extra_field")).toMatchObject({
      diagnostics: [
        { stage: "action_schema", tool: null, category: "invalid_action", disposition: "stopped" },
      ],
    });
    expect(row("tool_budget")).toMatchObject({
      diagnostics: [{ stage: "budget", category: "request_limit" }],
    });
    expect(row("network")).toMatchObject({
      diagnostics: [{ stage: "provider", category: "provider_failure" }],
    });
    expect(row("false_complete")).toMatchObject({
      diagnostics: [{ stage: "completion", category: "premature_complete" }],
    });
    const legacy = { ...row("network") };
    Reflect.deleteProperty(legacy, "diagnostics");
    expect(EvaluationRowSchema.parse(legacy)).toEqual(legacy);
    for (const data of [
      {
        stage: "tool_input",
        tool: "SYNTHETIC_SECRET_PAYLOAD",
        category: "missing_field",
        disposition: "stopped",
        modelCall: 1,
        errorCode: "MODEL_INVALID_OUTPUT",
      },
      {
        stage: "tool_input",
        tool: "calculate_quote",
        category: "missing_field",
        disposition: "stopped",
        modelCall: 1,
        errorCode: "MODEL_INVALID_OUTPUT",
        raw: "SYNTHETIC_SECRET_PAYLOAD",
      },
    ])
      expect(EvaluationRowSchema.safeParse({ ...legacy, diagnostics: [data] }).success).toBe(false);
    expect(markdownReport(report)).toContain("Failure stage");
    const exported = JSON.stringify(report) + markdownReport(report);
    for (const secret of [
      "SYNTHETIC_SECRET_PAYLOAD",
      "synthetic-c04-key",
      "synthetic confidential",
      "Authorization",
      "toolResult",
      "proposal",
      "publish_catalog",
    ])
      expect(exported).not.toContain(secret);
    expect(network).not.toHaveBeenCalled();
  } finally {
    network.mockRestore();
  }
});
