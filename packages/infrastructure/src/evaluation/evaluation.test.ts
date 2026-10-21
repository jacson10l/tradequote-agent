import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { categories, languages, semanticCases } from "./cases";
import * as fixtureModule from "./fixture-model";
import { EvaluationReportSchema, EvaluationRowSchema, markdownReport } from "./report";
import { evaluateC04 } from "./runner";

describe("C04 evaluations against isolated real business services", () => {
  it("evaluates three categories in three languages through V1/V2/V3, clarification, blocking and all failure probes", async () => {
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("FORBIDDEN_EXTERNAL_REQUEST"));
    try {
      const report = await evaluateC04({ mode: "fixture" });
      expect(report.status).toBe("passed");
      expect(report.rows.filter((row) => row.status === "failed")).toEqual([]);
      expect(report.rows).toHaveLength(48);
      expect(report.rows.filter((row) => row.kind === "semantic")).toHaveLength(27);
      expect(report.rows.filter((row) => row.kind === "clarification")).toHaveLength(3);
      expect(report.providerValidation).toBe("fixture_only");
      expect(report.realRequests).toBe(0);
      expect(network).not.toHaveBeenCalled();
      for (const sample of semanticCases)
        expect(
          report.rows.filter((r) => r.id.startsWith(`${sample.id}-`)).map((r) => r.status),
        ).toEqual(["passed", "passed", "passed"]);
      expect(categories).toHaveLength(3);
      expect(languages).toHaveLength(3);
      const text = JSON.stringify(report) + markdownReport(report);
      for (const forbidden of [
        "synthetic-c04-key",
        "synthetic confidential",
        "Authorization",
        "toolResult",
        "Synthetic evaluation buyer",
        "Synthetic fixture proposal",
        "FORBIDDEN_EXTERNAL_REQUEST",
        "evaluation.sqlite",
      ])
        expect(text).not.toContain(forbidden);
      expect(report.usage).toEqual({ tokens: null, cost: null, reason: "not_exposed_by_adapter" });
    } finally {
      network.mockRestore();
    }
  }, 20000);
  it("detects schema-valid semantic drift and skips dependent revisions instead of reporting success", async () => {
    const original = fixtureModule.fixtureTransport;
    const changed = vi.spyOn(fixtureModule, "fixtureTransport").mockImplementation((options) => {
      const transport = original(options);
      if (
        options.version !== 1 ||
        options.language !== "zh" ||
        options.failure ||
        options.clarification ||
        options.blocked
      )
        return transport;
      return async (...args) => {
        const response = await transport(...args);
        const body = await response.json();
        const action: { name?: string; input?: { proposal?: { payment?: string } } } = JSON.parse(
          body.choices[0].message.content,
        );
        if (action.name === "calculate_quote" && action.input?.proposal) {
          action.input.proposal.payment = "SYNTHETIC_SEMANTIC_DRIFT";
          body.choices[0].message.content = JSON.stringify(action);
        }
        return new Response(JSON.stringify(body));
      };
    });
    try {
      const report = await evaluateC04({ mode: "fixture" });
      expect(report.status).toBe("failed");
      for (const c of categories) {
        const first = report.rows.find((r) => r.id === `${c.id}-zh-v1`)!;
        expect(first.errorCode).toBeNull(); // Valid schema, actual saved draft, wrong buyer terms.
        expect(first.checks.find((c) => c.id === "terms")?.passed).toBe(false);
        expect(first.status).toBe("failed");
        expect(report.rows.find((r) => r.id === `${c.id}-zh-v2`)).toMatchObject({
          status: "not_run",
          reason: "prior_step_failed",
          modelCalls: 0,
        });
      }
      expect(JSON.stringify(report)).not.toContain("SYNTHETIC_SEMANTIC_DRIFT");
    } finally {
      changed.mockRestore();
    }
  }, 20000);
  it("marks real DeepSeek entirely not-run without credentials and never reads environment keys or calls fetch", async () => {
    const network = vi.spyOn(globalThis, "fetch");
    vi.stubEnv("DEEPSEEK_API_KEY", "DO_NOT_READ_C04_TEST_KEY");
    try {
      const report = await evaluateC04({ mode: "deepseek" });
      expect(report.status).toBe("not_run");
      expect(report.providerValidation).toBe("not_run");
      expect(report.rows.every((r) => r.status === "not_run")).toBe(true);
      expect(report.modelCalls).toBe(0);
      expect(report.realRequests).toBe(0);
      expect(report.model).toBeNull();
      expect(network).not.toHaveBeenCalled();
      expect(JSON.stringify(report)).not.toContain("DO_NOT_READ_C04_TEST_KEY");
    } finally {
      vi.unstubAllEnvs();
      network.mockRestore();
    }
  });
  it("does not accept raw provider text, fake fixture request counts, or inconsistent report success", async () => {
    const report = await evaluateC04({ mode: "deepseek" });
    expect(EvaluationReportSchema.safeParse({ ...report, status: "passed" }).success).toBe(false);
    expect(EvaluationReportSchema.safeParse({ ...report, realRequests: 1 }).success).toBe(false);
    expect(EvaluationReportSchema.safeParse({ ...report, rawError: "SECRET" }).success).toBe(false);
    expect(EvaluationRowSchema.safeParse({ ...report.rows[0], prompt: "SECRET" }).success).toBe(
      false,
    );
    expect(
      EvaluationRowSchema.safeParse({ ...report.rows[0], status: "passed", checks: [] }).success,
    ).toBe(false);
    expect(EvaluationRowSchema.safeParse({ ...report.rows[0], reason: "SECRET" }).success).toBe(
      false,
    );
    expect(
      EvaluationReportSchema.safeParse({ ...report, rows: report.rows.slice(1) }).success,
    ).toBe(false);
  });
  it("rejects implicit mode, key flags and custom endpoints before any provider work", () => {
    const cli = fileURLToPath(new URL("../../../../scripts/evaluate-model.mjs", import.meta.url));
    for (const args of [
      [],
      ["--mode", "fixture", "--key", "SYNTHETIC_FORBIDDEN_ARGUMENT"],
      ["--mode", "fixture", "--endpoint", "https://invalid.example"],
    ]) {
      const child = spawnSync(process.execPath, [cli, ...args], {
        encoding: "utf8",
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      });
      expect(child.status).toBe(1);
      expect(child.stderr).not.toContain("SYNTHETIC_FORBIDDEN_ARGUMENT");
      expect(child.stdout).not.toContain("modelCalls");
    }
  });
});
