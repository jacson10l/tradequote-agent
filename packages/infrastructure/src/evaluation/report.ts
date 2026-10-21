import { ErrorCodeSchema } from "@tradequote/contracts";
import { z } from "zod";
import { evaluationPlan } from "./cases";

export const CheckIdSchema = z.enum([
  "outcome",
  "revision_count",
  "draft_only",
  "quantity",
  "unit",
  "product",
  "terms",
  "amount",
  "sources",
  "validation",
  "immutable_history",
  "single_dispatch",
  "no_late_write",
]);
export type CheckId = z.infer<typeof CheckIdSchema>;
export const EvaluationRowSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9_-]{1,80}$/),
    kind: z.enum(["semantic", "clarification", "rule_block", "failure"]),
    category: z.enum(["apparel", "panel", "fastener"]).nullable(),
    language: z.enum(["zh", "en", "de"]).nullable(),
    status: z.enum(["passed", "failed", "not_run"]),
    reason: z.enum([
      "observed",
      "credentials_not_provided",
      "fixture_only",
      "prior_step_failed",
      "evaluation_error",
    ]),
    errorCode: ErrorCodeSchema.nullable(),
    expectedErrorCode: ErrorCodeSchema.nullable(),
    modelCalls: z.number().int().nonnegative(),
    elapsedMs: z.number().int().nonnegative(),
    checks: z.array(z.strictObject({ id: CheckIdSchema, passed: z.boolean() })),
  })
  .superRefine((row, ctx) => {
    if (
      (row.status === "passed" && (row.checks.length === 0 || row.checks.some((c) => !c.passed))) ||
      (row.status === "failed" && row.checks.length > 0 && row.checks.every((c) => c.passed)) ||
      (row.status === "not_run" && (row.modelCalls !== 0 || row.checks.length > 0)) ||
      new Set(row.checks.map((c) => c.id)).size !== row.checks.length
    )
      ctx.addIssue({ code: "custom", message: "Evaluation status must match observed checks" });
  });
export type EvaluationRow = z.infer<typeof EvaluationRowSchema>;
export const EvaluationReportSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    suite: z.literal("c04-v1"),
    mode: z.enum(["fixture", "deepseek"]),
    status: z.enum(["passed", "failed", "not_run"]),
    providerValidation: z.enum(["fixture_only", "not_run", "observed"]),
    syntheticData: z.literal(true),
    caseSetHash: z.string().regex(/^[a-f0-9]{64}$/),
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime(),
    model: z
      .string()
      .regex(/^[A-Za-z0-9._:-]{1,128}$/)
      .nullable(),
    modelCalls: z.number().int().nonnegative(),
    realRequests: z.number().int().nonnegative(),
    usage: z.strictObject({
      tokens: z.null(),
      cost: z.null(),
      reason: z.literal("not_exposed_by_adapter"),
    }),
    rows: z.array(EvaluationRowSchema).min(1).max(100),
  })
  .superRefine((r, ctx) => {
    const status = r.rows.some((v) => v.status === "failed")
      ? "failed"
      : r.rows.every((v) => v.status === "not_run")
        ? "not_run"
        : "passed";
    if (
      r.status !== status ||
      new Set(r.rows.map((v) => v.id)).size !== r.rows.length ||
      r.rows.length !== evaluationPlan.length ||
      evaluationPlan.some(
        (s) =>
          !r.rows.some(
            (row) =>
              row.id === s.id &&
              row.kind === s.kind &&
              row.category === s.category &&
              row.language === s.language,
          ),
      ) ||
      r.modelCalls !== r.rows.reduce((n, v) => n + v.modelCalls, 0) ||
      r.realRequests !== (r.mode === "deepseek" ? r.modelCalls : 0) ||
      r.providerValidation !==
        (r.mode === "fixture" ? "fixture_only" : r.realRequests > 0 ? "observed" : "not_run")
    )
      ctx.addIssue({ code: "custom", message: "Report summary must match observations and mode" });
  });
export type EvaluationReport = z.infer<typeof EvaluationReportSchema>;
// A whitelist projection, not a regex scrub of arbitrary provider payloads.
export function markdownReport(report: EvaluationReport): string {
  const r = EvaluationReportSchema.parse(report);
  return [
    `# C04 ${r.mode} evaluation`,
    "",
    `Status: ${r.status}. Provider validation: ${r.providerValidation}. Synthetic data only.`,
    `Model: ${r.model ?? "not configured"}. Model calls: ${r.modelCalls}. Real request attempts: ${r.realRequests}.`,
    "Token counts and costs: unknown (not exposed by adapter). Fixture success does not validate DeepSeek semantics.",
    "",
    "| Case | Status | Code | Failed checks |",
    "|---|---|---|---|",
    ...r.rows.map(
      (row) =>
        `| ${row.id} | ${row.status} | ${row.errorCode ?? row.reason} | ${
          row.checks
            .filter((c) => !c.passed)
            .map((c) => c.id)
            .join(", ") || "—"
        } |`,
    ),
    "",
    "No keys, headers, prompts, model responses, buyer text, source contents, database paths or raw errors are included.",
    "",
  ].join("\n");
}
