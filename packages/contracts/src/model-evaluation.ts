import { z } from "zod";
import { ModelCredentialsSchema } from "./agent";
import { ErrorCodeSchema } from "./errors";
import { readEnvelope, resultSchema, writeEnvelope } from "./protocol";
import { AgentToolNameSchema } from "./runs";

export const providerOutputCategories = [
  "empty_response",
  "response_oversized",
  "response_encoding",
  "response_json",
  "response_envelope",
  "response_truncated",
  "empty_content",
  "content_json",
] as const;
export type ProviderOutputCategory = (typeof providerOutputCategories)[number];

// Host-produced enums only. Never accept field paths, input values or model/error text.
export const FailureDiagnosticSchema = z.strictObject({
  stage: z.enum([
    "provider",
    "action_schema",
    "tool_lookup",
    "tool_input",
    "tool_execution",
    "completion",
    "clarification",
    "budget",
    "context",
    "evaluation_check",
  ]),
  tool: AgentToolNameSchema.nullable(),
  category: z.enum([
    "provider_failure",
    ...providerOutputCategories,
    "payment_mismatch",
    "delivery_mismatch",
    "invalid_action",
    "action_shape",
    "action_kind",
    "action_missing_field",
    "action_field_type",
    "action_unknown_field",
    "action_invalid_value",
    "clarification_before_read",
    "unknown_tool",
    "missing_field",
    "type_mismatch",
    "unknown_field",
    "invalid_value",
    "quantity_format",
    "calculate_first",
    "knowledge_first",
    "business_failure",
    "premature_complete",
    "missing_facts",
    "rule_block",
    "request_limit",
    "context_limit",
    "cancelled",
    "timeout",
  ]),
  disposition: z.enum(["feedback", "stopped"]),
  modelCall: z.number().int().min(0).max(12),
  errorCode: ErrorCodeSchema,
});
export type FailureDiagnostic = z.infer<typeof FailureDiagnosticSchema>;
export const evaluationLanguages = ["zh", "en", "de"] as const;
export const evaluationFailures = [
  "auth",
  "rate_limit",
  "server",
  "network",
  "invalid_json",
  "truncated",
  "oversized",
  "empty",
  "extra_field",
  "amount_injection",
  "unknown_tool",
  "false_complete",
  "tool_budget",
  "timeout",
  "cancel_late",
  "pre_cancel",
  "explicit_retry",
] as const;
export type FailureCase = (typeof evaluationFailures)[number];

export const evaluationPlan = [
  ...(["apparel", "panel", "fastener"] as const).flatMap((category) =>
    evaluationLanguages.flatMap((language) =>
      [1, 2, 3].map((version) => ({
        id: `${category}-${language}-v${version}`,
        kind: "semantic" as const,
        category,
        language,
      })),
    ),
  ),
  ...evaluationLanguages.map((language) => ({
    id: `clarification-${language}`,
    kind: "clarification" as const,
    category: null,
    language,
  })),
  {
    id: "rule-block",
    kind: "rule_block" as const,
    category: "apparel" as const,
    language: "en" as const,
  },
  ...evaluationFailures.map((failure) => ({
    id: `failure-${failure}`,
    kind: "failure" as const,
    category: null,
    language: null,
  })),
];
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
    status: z.enum(["passed", "failed", "not_run", "cancelled"]),
    reason: z.enum([
      "observed",
      "credentials_not_provided",
      "fixture_only",
      "prior_step_failed",
      "evaluation_error",
      "cancelled",
      "provider_unavailable",
    ]),
    errorCode: ErrorCodeSchema.nullable(),
    expectedErrorCode: ErrorCodeSchema.nullable(),
    modelCalls: z.number().int().nonnegative(),
    elapsedMs: z.number().int().nonnegative(),
    checks: z.array(z.strictObject({ id: CheckIdSchema, passed: z.boolean() })),
    diagnostics: z.array(FailureDiagnosticSchema).min(1).max(12).optional(),
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
    status: z.enum(["passed", "failed", "not_run", "cancelled"]),
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
    const status = r.rows.some((v) => v.status === "cancelled" || v.reason === "cancelled")
      ? "cancelled"
      : r.rows.some((v) => v.status === "failed")
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

export const ModelEvaluationRunSchema = z
  .strictObject({
    runId: z.uuid(),
    operationKey: z.uuid(),
    requestedMode: z.enum(["fixture", "deepseek"]),
    mode: z.enum(["fixture", "deepseek"]),
    transport: z.enum(["scripted_fixture", "http_fixture", "deepseek"]),
    status: z.enum(["running", "completed", "cancelled", "interrupted", "failed"]),
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime().nullable(),
    observedRows: z.number().int().min(0).max(48),
    errorCode: ErrorCodeSchema.nullable(),
    report: EvaluationReportSchema.nullable(),
  })
  .superRefine((r, ctx) => {
    if (
      (r.status === "running") !== (r.finishedAt === null) ||
      (r.status === "completed" && r.report === null) ||
      (r.report && r.report.mode !== r.mode) ||
      (r.transport === "deepseek") !== (r.mode === "deepseek") ||
      (r.transport === "scripted_fixture" && r.requestedMode !== "fixture") ||
      (r.report && r.status === "running")
    )
      ctx.addIssue({
        code: "custom",
        message: "Evaluation run must preserve transport and terminal facts",
      });
  });
export type ModelEvaluationRun = z.infer<typeof ModelEvaluationRunSchema>;
export const ModelEvaluationCommandSchema = z.discriminatedUnion("method", [
  z.strictObject({
    ...writeEnvelope,
    method: z.literal("modelEvaluation.start"),
    payload: z.discriminatedUnion("mode", [
      z.strictObject({ mode: z.literal("fixture") }),
      z.strictObject({
        mode: z.literal("deepseek"),
        model: ModelCredentialsSchema.shape.model,
        confirmedPaid: z.literal(true),
      }),
    ]),
  }),
  z.strictObject({
    ...readEnvelope,
    method: z.literal("modelEvaluation.list"),
    payload: z.strictObject({}),
  }),
  z.strictObject({
    ...writeEnvelope,
    method: z.literal("modelEvaluation.cancel"),
    payload: z.strictObject({ runId: z.uuid() }),
  }),
  z.strictObject({
    ...readEnvelope,
    method: z.literal("modelEvaluation.export"),
    payload: z.strictObject({ runId: z.uuid(), format: z.enum(["json", "markdown"]) }),
  }),
]);
export const ModelEvaluationResultSchema = resultSchema(
  z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("saved"), saved: z.boolean() }),
    z.strictObject({
      kind: z.literal("runs"),
      canStart: z.boolean(),
      runs: z.array(ModelEvaluationRunSchema).max(20),
    }),
    z.strictObject({
      kind: z.literal("export"),
      filename: z.string().regex(/^c04-[a-f0-9-]{36}\.(json|md)$/),
      content: z.string().max(200000),
    }),
  ]),
);
export type ModelEvaluationCommand = z.infer<typeof ModelEvaluationCommandSchema>;
export type ModelEvaluationResult = z.infer<typeof ModelEvaluationResultSchema>;
export interface ModelEvaluationClient {
  modelEvaluation(command: ModelEvaluationCommand): Promise<ModelEvaluationResult>;
}
