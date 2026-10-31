import { type EvaluationReport, EvaluationReportSchema } from "@tradequote/contracts";

export type { CheckId, EvaluationReport, EvaluationRow } from "@tradequote/contracts";
export { CheckIdSchema, EvaluationReportSchema, EvaluationRowSchema } from "@tradequote/contracts";
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
    ...(r.rows.some((row) => row.diagnostics?.length)
      ? [
          "",
          "| Case | Failure stage | Tool | Validation category | Disposition | Model call | Code |",
          "|---|---|---|---|---|---:|---|",
          ...r.rows.flatMap((row) =>
            (row.diagnostics ?? []).map(
              (d) =>
                `| ${row.id} | ${d.stage} | ${d.tool ?? "—"} | ${d.category} | ${d.disposition} | ${d.modelCall} | ${d.errorCode} |`,
            ),
          ),
        ]
      : []),
    "",
    "No keys, headers, prompts, model responses, buyer text, source contents, database paths or raw errors are included.",
    "",
  ].join("\n");
}
