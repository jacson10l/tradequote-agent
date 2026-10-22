import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { FailureDiagnostic } from "@tradequote/contracts";
import {
  type AgentCommand,
  ErrorCodeSchema,
  type ModelCredentials,
  ModelCredentialsSchema,
} from "@tradequote/contracts";
import { AgentRunCoordinator, DeepSeekProvider } from "@tradequote/infrastructure";
import {
  clarificationCases,
  evaluationPlan,
  type FailureCase,
  failureCases,
  semanticCases,
  terms,
} from "./cases";
import { fixtureTransport } from "./fixture-model";
import {
  type CheckId,
  type EvaluationReport,
  EvaluationReportSchema,
  type EvaluationRow,
} from "./report";
import { board, envelope, evaluationWorkspace } from "./workspace";

const expectedCodes: Record<FailureCase, PublicCode> = {
  auth: "MODEL_AUTH_FAILED",
  rate_limit: "MODEL_RATE_LIMITED",
  server: "CAPABILITY_UNAVAILABLE",
  network: "CAPABILITY_UNAVAILABLE",
  invalid_json: "MODEL_INVALID_OUTPUT",
  truncated: "MODEL_INVALID_OUTPUT",
  oversized: "MODEL_INVALID_OUTPUT",
  empty: "MODEL_INVALID_OUTPUT",
  extra_field: "MODEL_INVALID_OUTPUT",
  amount_injection: "MODEL_INVALID_OUTPUT",
  unknown_tool: "ACTION_NOT_ALLOWED",
  false_complete: "ACTION_NOT_ALLOWED",
  tool_budget: "ACTION_NOT_ALLOWED",
  timeout: "MODEL_TIMEOUT",
  cancel_late: "CANCELLED",
  pre_cancel: "CANCELLED",
  explicit_retry: "MODEL_RATE_LIMITED",
};
type PublicCode = EvaluationRow["errorCode"];
type RowSpec = Pick<EvaluationRow, "id" | "kind" | "category" | "language">;
const specifications: RowSpec[] = evaluationPlan;
export const caseSetHash = createHash("sha256")
  .update(
    JSON.stringify({
      semanticCases,
      clarificationCases,
      failureCases,
      expectedCodes,
      specifications,
    }),
  )
  .digest("hex");
const blankRow = (spec: RowSpec, reason: EvaluationRow["reason"]): EvaluationRow => ({
  ...spec,
  status: "not_run",
  reason,
  modelCalls: 0,
  elapsedMs: 0,
  errorCode: null,
  expectedErrorCode:
    spec.kind === "failure"
      ? expectedCodes[spec.id.slice(8) as FailureCase]
      : spec.kind === "rule_block"
        ? "RULE_BLOCKED"
        : null,
  checks: [],
});
const publicCode = (error: unknown): PublicCode => {
  const value =
    error && typeof error === "object" && "code" in error
      ? ErrorCodeSchema.safeParse(error.code)
      : null;
  return value?.success ? value.data : "STORAGE_ERROR";
};
const checks = (values: Partial<Record<CheckId, boolean>>) =>
  Object.entries(values).map(([id, passed]) => ({ id: id as CheckId, passed: passed! }));
const human = { actorId: "synthetic-evaluator", origin: "human_ui" as const };
const recordDiagnostic = (row: EvaluationRow, diagnostic: FailureDiagnostic) => {
  row.diagnostics = [...(row.diagnostics ?? []), diagnostic].slice(-12);
};

/** Host-only evaluation. Never loads settings, environment keys or a production workspace.
 * Actual credentials may only be supplied by an explicitly authorized trusted host; the CLI
 * deliberately has no credential input or settings decryption path. */
export async function evaluateC04(options: {
  mode: "fixture" | "deepseek";
  credentials?: ModelCredentials;
  cancellation?: AbortSignal;
  onProgress?: (observedRows: number) => void;
  httpFixture?: { endpoint: string; credentials: ModelCredentials };
  workspaceRoot?: string;
}): Promise<EvaluationReport> {
  if (options.mode !== "fixture" && options.mode !== "deepseek")
    throw new Error("Invalid evaluation mode");
  if (
    options.httpFixture &&
    (options.mode !== "fixture" ||
      !/^http:\/\/127\.0\.0\.1:\d+$/.test(options.httpFixture.endpoint))
  )
    throw new Error("Invalid isolated HTTP fixture");
  const startedAt = new Date().toISOString();
  const credential =
    options.mode === "deepseek" ? ModelCredentialsSchema.safeParse(options.credentials) : null;
  const credentials: ModelCredentials | undefined =
    options.mode === "fixture"
      ? (options.httpFixture?.credentials ?? {
          key: "synthetic-c04-key",
          model: "synthetic-c04-model",
        })
      : credential?.success
        ? credential.data
        : undefined;
  const rows = specifications.map((s) =>
    blankRow(
      s,
      options.mode === "deepseek" && s.kind === "failure"
        ? "fixture_only"
        : "credentials_not_provided",
    ),
  );
  const row = (id: string) => rows.find((r) => r.id === id)!;
  let providerStopped = false;
  const progress = () => options.onProgress?.(rows.filter((r) => r.status !== "not_run").length);
  const bindCancellation = (
    coordinator: AgentRunCoordinator,
    f: ReturnType<typeof evaluationWorkspace>,
  ) => {
    const cancel = () => {
      for (const run of f.repo.runStore().list({ limit: 100 }).runs)
        if (["queued", "running"].includes(run.status))
          coordinator.execute({
            ...envelope(),
            method: "agent.cancel",
            payload: { runId: run.runId },
          });
    };
    options.cancellation?.addEventListener("abort", cancel, { once: true });
    return () => options.cancellation?.removeEventListener("abort", cancel);
  };
  if (credentials) {
    for (const sample of semanticCases) {
      if (options.cancellation?.aborted || providerStopped) break;
      let f: ReturnType<typeof evaluationWorkspace> | undefined;
      let coordinator: AgentRunCoordinator | undefined;
      let activeRow = row(`${sample.id}-v1`);
      let calls = 0;
      let version = 1;
      let unbind = () => {};
      try {
        f = evaluationWorkspace(sample.category.sku, options.workspaceRoot);
        const workspace = f;
        const fixture = () =>
          fixtureTransport({ product: workspace.product, version, language: sample.language });
        coordinator = new AgentRunCoordinator(
          f.repo,
          () =>
            new DeepSeekProvider(
              credentials,
              async (...args) => {
                calls++;
                return options.mode === "fixture" && !options.httpFixture
                  ? fixture()(...args)
                  : fetch(...args);
              },
              options.httpFixture?.endpoint,
            ),
          (diagnostic) => recordDiagnostic(activeRow, diagnostic),
        );
        unbind = bindCancellation(coordinator, f);
        let baseId = "";
        const snapshots = new Map<string, string>();
        for (version = 1; version <= 3; version++) {
          if (options.cancellation?.aborted) break;
          activeRow = row(`${sample.id}-v${version}`);
          const initialCalls = calls,
            startTime = performance.now();
          const command: AgentCommand =
            version === 1
              ? {
                  ...envelope(),
                  method: "agent.understand",
                  payload: {
                    executionMode: "tool_loop",
                    scenarioId: f.scenario.id,
                    buyer: "Synthetic evaluation buyer",
                    inquiry: sample.instructions[0]!,
                  },
                }
              : {
                  ...envelope(),
                  method: "agent.revise",
                  payload: {
                    executionMode: "tool_loop",
                    baseId,
                    expectedVersion: version - 1,
                    instruction: sample.instructions[version - 1]!,
                  },
                };
          const result = await coordinator.executeLegacy(command, credentials);
          activeRow.modelCalls = calls - initialCalls;
          activeRow.elapsedMs = Math.round(performance.now() - startTime);
          activeRow.reason = "observed";
          activeRow.errorCode = result.ok ? null : result.error.code;
          const current = board(
            f.repo.executeTrade(
              { schemaVersion: 1, requestId: envelope().requestId, method: "trade.get" },
              human,
            ),
          );
          const quote = current.quotes.find((q) => q.version === version);
          const run = f.repo
            .runStore()
            .list({ limit: 100 })
            .runs.find((r) => r.operationKey === command.idempotencyKey);
          const line = quote?.lines[0];
          const t = terms[sample.language];
          activeRow.checks = checks({
            outcome: result.ok && run?.status === "completed",
            revision_count: current.quotes.length === version,
            draft_only: quote?.status === "draft",
            product: quote?.lines.length === 1 && line?.product.id === f.product.id,
            quantity: line?.quantity === (version === 1 ? "100" : "120"),
            unit: line?.product.unit === sample.category.unit,
            terms:
              quote?.payment === (version === 3 ? t.nextPayment : t.payment) &&
              quote?.delivery === (version === 3 ? t.nextDelivery : t.delivery),
            amount: quote !== undefined && quote.goodsTotal === sample.category.totals[version - 1],
            sources:
              line?.product.sourceHash === f.product.sourceHash &&
              line.product.sourceStatus === "synthetic",
            validation:
              run?.validation?.kind === "saved_revision" &&
              run.validation.report.ruleRevisionIds.includes(f.source.revisionId) &&
              run.validation.report.revisionId === quote?.id,
            immutable_history: [...snapshots].every(
              ([id, raw]) => JSON.stringify(current.quotes.find((q) => q.id === id)) === raw,
            ),
          });
          activeRow.status = activeRow.checks.every((c) => c.passed) ? "passed" : "failed";
          if (options.cancellation?.aborted) {
            activeRow.status = "cancelled";
            activeRow.reason = "cancelled";
          }
          if (
            (options.mode === "deepseek" || options.httpFixture) &&
            !result.ok &&
            [
              "MODEL_AUTH_FAILED",
              "MODEL_RATE_LIMITED",
              "CAPABILITY_UNAVAILABLE",
              "MODEL_TIMEOUT",
            ].includes(result.error.code)
          )
            providerStopped = true;
          progress();
          if (activeRow.status !== "passed" || !quote) {
            for (let next = version + 1; next <= 3; next++)
              row(`${sample.id}-v${next}`).reason = "prior_step_failed";
            break;
          }
          baseId = quote.id;
          snapshots.set(quote.id, JSON.stringify(quote));
        }
      } catch (error) {
        activeRow.status = "failed";
        activeRow.reason = "evaluation_error";
        activeRow.errorCode = publicCode(error);
        activeRow.checks = checks({ outcome: false });
      } finally {
        unbind();
        progress();
        await coordinator?.close();
        f?.close();
      }
    }
    for (const spec of specifications.filter((s) => s.kind !== "semantic")) {
      if (options.cancellation?.aborted || providerStopped) break;
      const resultRow = row(spec.id);
      if (options.mode === "deepseek" && spec.kind === "failure") continue;
      const failure = spec.kind === "failure" ? (spec.id.slice(8) as FailureCase) : undefined;
      let calls = 0;
      const startTime = performance.now();
      let f: ReturnType<typeof evaluationWorkspace> | undefined;
      let coordinator: AgentRunCoordinator | undefined;
      let unbind = () => {};
      try {
        f = evaluationWorkspace("DEMO-TEE", options.workspaceRoot);
        const workspace = f;
        const transport = fixtureTransport({
          product: f.product,
          version: 1,
          language: spec.language ?? "en",
          ...(failure ? { failure } : {}),
          clarification: spec.kind === "clarification",
          blocked: spec.kind === "rule_block",
          onPending: () => {
            const run = workspace.repo.runStore().list({ limit: 100 }).runs[0];
            if (run)
              coordinator?.execute({
                ...envelope(),
                method: "agent.cancel",
                payload: { runId: run.runId },
              });
          },
        });
        const provider = new DeepSeekProvider(
          credentials,
          async (...args) => {
            calls++;
            return options.mode === "fixture" && (failure || !options.httpFixture)
              ? transport(...args)
              : fetch(...args);
          },
          options.httpFixture?.endpoint,
          failure === "timeout" ? 10 : 45000,
        );
        if (failure === "pre_cancel") {
          const cancellation = new AbortController();
          cancellation.abort();
          try {
            await provider.json(
              [{ role: "user", content: "Synthetic pre-cancel probe" }],
              cancellation.signal,
            );
          } catch (error) {
            resultRow.errorCode = publicCode(error);
          }
        } else {
          coordinator = new AgentRunCoordinator(
            f.repo,
            () => provider,
            (diagnostic) => recordDiagnostic(resultRow, diagnostic),
          );
          unbind = bindCancellation(coordinator, f);
          const result = await coordinator.executeLegacy(
            {
              ...envelope(),
              method: "agent.understand",
              payload: {
                executionMode: "tool_loop",
                scenarioId: f.scenario.id,
                buyer: "Synthetic evaluation buyer",
                inquiry:
                  spec.kind === "clarification"
                    ? clarificationCases[spec.language!]
                    : spec.kind === "rule_block"
                      ? "Synthetic: quote 100 piece DEMO-TEE. Payment is explicitly empty and must remain empty. Do not invent it; let validation block the draft. Delivery 30 days."
                      : semanticCases[0]!.instructions[0]!,
              },
            },
            credentials,
          );
          resultRow.errorCode = result.ok ? null : result.error.code;
          if (
            (options.mode === "deepseek" || options.httpFixture) &&
            !result.ok &&
            [
              "MODEL_AUTH_FAILED",
              "MODEL_RATE_LIMITED",
              "CAPABILITY_UNAVAILABLE",
              "MODEL_TIMEOUT",
            ].includes(result.error.code)
          )
            providerStopped = true;
        }
        const current = board(
          f.repo.executeTrade(
            { schemaVersion: 1, requestId: envelope().requestId, method: "trade.get" },
            human,
          ),
        );
        const run = f.repo.runStore().list({ limit: 100 }).runs[0];
        let retryPassed = true;
        if (failure === "explicit_retry" && run) {
          retryPassed = current.quotes.length === 0 && run.status === "failed" && calls === 1;
          const control = {
            ...envelope(),
            method: "agent.retry" as const,
            payload: { runId: run.runId },
          };
          const retried = coordinator!.execute(control, credentials);
          retryPassed &&= retried.ok;
          const deadline = performance.now() + 5000;
          while (
            ["queued", "running"].includes(f.repo.runStore().get(run.runId).status) &&
            performance.now() < deadline
          )
            await new Promise<void>((resolve) => setImmediate(resolve));
          const done = f.repo.runStore().get(run.runId);
          retryPassed &&=
            done.status === "completed" &&
            done.attempt === 2 &&
            done.operationKey === run.operationKey;
          coordinator!.execute(control, credentials); // Replaying the control cannot dispatch again.
        }
        const expectedCount = failure === "explicit_retry" ? 1 : 0;
        const callsAtEnd = calls;
        if (failure === "cancel_late") await new Promise((resolve) => setTimeout(resolve, 25));
        resultRow.checks = checks({
          outcome:
            spec.kind === "clarification"
              ? run?.status === "waiting_input" && !!run.clarification
              : resultRow.errorCode === resultRow.expectedErrorCode && retryPassed,
          revision_count:
            board(
              f.repo.executeTrade(
                { schemaVersion: 1, requestId: envelope().requestId, method: "trade.get" },
                human,
              ),
            ).quotes.length === expectedCount,
          no_late_write:
            board(
              f.repo.executeTrade(
                { schemaVersion: 1, requestId: envelope().requestId, method: "trade.get" },
                human,
              ),
            ).quotes.length === expectedCount && calls === callsAtEnd,
          ...(failure
            ? {
                single_dispatch:
                  calls ===
                  (failure === "pre_cancel"
                    ? 0
                    : failure === "tool_budget"
                      ? 12
                      : failure === "explicit_retry"
                        ? 7
                        : 1),
              }
            : {}),
        });
        resultRow.status = resultRow.checks.every((c) => c.passed) ? "passed" : "failed";
        resultRow.reason = "observed";
        if (options.cancellation?.aborted) {
          resultRow.status = "cancelled";
          resultRow.reason = "cancelled";
        }
      } catch (error) {
        resultRow.status = "failed";
        resultRow.reason = "evaluation_error";
        resultRow.errorCode = publicCode(error);
        resultRow.checks = checks({ outcome: false });
      } finally {
        resultRow.modelCalls = calls;
        resultRow.elapsedMs = Math.round(performance.now() - startTime);
        unbind();
        progress();
        await coordinator?.close();
        f?.close();
      }
    }
  }
  for (const row of rows)
    if (
      row.status === "not_run" &&
      ["credentials_not_provided", "prior_step_failed"].includes(row.reason)
    ) {
      if (options.cancellation?.aborted) row.reason = "cancelled";
      else if (providerStopped) row.reason = "provider_unavailable";
    }
  const modelCalls = rows.reduce((n, r) => n + r.modelCalls, 0);
  const model = credentials?.model;
  return EvaluationReportSchema.parse({
    schemaVersion: 1,
    suite: "c04-v1",
    mode: options.mode,
    status: rows.some((r) => r.status === "cancelled" || r.reason === "cancelled")
      ? "cancelled"
      : rows.some((r) => r.status === "failed")
        ? "failed"
        : rows.every((r) => r.status === "not_run")
          ? "not_run"
          : "passed",
    providerValidation:
      options.mode === "fixture" ? "fixture_only" : modelCalls > 0 ? "observed" : "not_run",
    syntheticData: true,
    caseSetHash,
    startedAt,
    finishedAt: new Date().toISOString(),
    model: model && !model.includes(credentials!.key) ? model : null,
    modelCalls,
    realRequests: options.mode === "deepseek" ? modelCalls : 0,
    usage: { tokens: null, cost: null, reason: "not_exposed_by_adapter" },
    rows,
  });
}
