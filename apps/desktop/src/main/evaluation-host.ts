import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  failure,
  type ModelCredentials,
  type ModelEvaluationCommand,
  ModelEvaluationCommandSchema,
  ModelEvaluationResultSchema,
  type ModelEvaluationRun,
  ModelEvaluationRunSchema,
} from "@tradequote/contracts";
import {
  EvaluationWorkerOutputSchema,
  markdownReport,
} from "@tradequote/infrastructure/evaluation";
import { z } from "zod";

export interface EvaluationChild {
  on(event: "message" | "exit", callback: (message: unknown) => void): unknown;
  postMessage(message: unknown): void;
  kill(): unknown;
}
const recordSchema = z.strictObject({
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  run: ModelEvaluationRunSchema,
  controls: z.array(z.uuid()).max(100).default([]),
});
type Record = z.infer<typeof recordSchema>;
const state = (runs: ModelEvaluationRun[], canStart: boolean) =>
  ModelEvaluationResultSchema.parse({
    ok: true,
    data: { kind: "runs", runs, canStart },
    warnings: [],
    evidenceIds: [],
  });

/** Main-only owner. Read/poll/reopen never forks or obtains credentials. One child until actual exit. */
export class ModelEvaluationHost {
  private records: Record[] = [];
  private corrupt = false;
  private closing = false;
  private active:
    | {
        runId: string;
        child: EvaluationChild;
        exited: Promise<void>;
        timer: ReturnType<typeof setTimeout>;
        killTimer: ReturnType<typeof setTimeout> | undefined;
        heartbeat: ReturnType<typeof setInterval>;
      }
    | undefined;
  constructor(
    private readonly directory: string,
    private readonly fork: () => EvaluationChild,
    private readonly credentials: () => ModelCredentials | undefined,
    private readonly httpFixture?: string,
  ) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    for (const file of readdirSync(directory).filter((f) => /^[a-f0-9-]{36}\.json$/.test(f))) {
      try {
        const path = join(directory, file);
        if (statSync(path).size > 200000) throw new Error("oversize");
        const record = recordSchema.parse(JSON.parse(readFileSync(path, "utf8")));
        if (record.run.runId !== file.slice(0, -5)) throw new Error("identity");
        if (record.run.status === "running") {
          record.run.status = "interrupted";
          record.run.finishedAt = new Date().toISOString();
          record.run.errorCode = "CAPABILITY_UNAVAILABLE";
          this.save(record);
        }
        this.records.push(record);
      } catch {
        this.corrupt = true;
      }
    }
    this.records.sort(
      (a, b) =>
        b.run.startedAt.localeCompare(a.run.startedAt) || b.run.runId.localeCompare(a.run.runId),
    );
    // A newly owned child removes stale scratch directories only after acquiring its OS lock.
  }
  private save(record: Record) {
    const validated = recordSchema.parse(record),
      file = join(this.directory, `${validated.run.runId}.json`);
    writeFileSync(`${file}.tmp`, `${JSON.stringify(validated)}\n`, { mode: 0o600 });
    renameSync(`${file}.tmp`, file);
  }
  private snapshot() {
    return state(
      this.records.slice(0, 20).map((r) => r.run),
      !this.active && !this.closing,
    );
  }
  execute(input: ModelEvaluationCommand | unknown) {
    const parsed = ModelEvaluationCommandSchema.safeParse(input);
    if (!parsed.success) return failure("VALIDATION_ERROR", "评估请求字段不合法");
    if (this.corrupt) return failure("STORAGE_ERROR", "评估历史无法读取；不会自动重新调用模型");
    if (this.closing) return failure("CAPABILITY_UNAVAILABLE", "应用正在退出");
    const command = parsed.data;
    try {
      if (command.method === "modelEvaluation.list") return this.snapshot();
      if (command.method === "modelEvaluation.export") {
        const run = this.records.find((r) => r.run.runId === command.payload.runId)?.run;
        if (!run?.report) return failure("NOT_FOUND", "此运行尚无可下载的脱敏报告");
        return ModelEvaluationResultSchema.parse({
          ok: true,
          data: {
            kind: "export",
            filename: `c04-${run.runId}.${command.payload.format === "json" ? "json" : "md"}`,
            content:
              command.payload.format === "json"
                ? `${JSON.stringify(run.report, null, 2)}\n`
                : markdownReport(run.report),
          },
          warnings: [],
          evidenceIds: [],
        });
      }
      if (command.method === "modelEvaluation.cancel") {
        const record = this.records.find((r) => r.run.runId === command.payload.runId);
        if (!record) return failure("NOT_FOUND", "评估运行不存在");
        const owner = this.records.find((r) => r.controls.includes(command.idempotencyKey));
        if (
          this.records.some((r) => r.run.operationKey === command.idempotencyKey) ||
          (owner && owner !== record)
        )
          return failure("IDEMPOTENCY_CONFLICT", "控制键不能用于其他评估操作");
        if (owner === record) return this.snapshot();
        if (record.controls.length >= 100)
          return failure("CAPABILITY_UNAVAILABLE", "该运行控制记录已达上限");
        record.controls.push(command.idempotencyKey);
        if (record.run.status !== "running") {
          this.save(record);
          return this.snapshot();
        }
        if (record.run.status === "running") {
          record.run.status = "cancelled";
          record.run.errorCode = "CANCELLED";
          record.run.finishedAt = new Date().toISOString();
          this.save(record);
          const active = this.active;
          if (active?.runId === record.run.runId) {
            active.child.postMessage({ type: "cancel" });
            active.killTimer = setTimeout(() => active.child.kill(), 2000);
          }
        }
        return this.snapshot();
      }
      if (this.records.some((r) => r.controls.includes(command.idempotencyKey)))
        return failure("IDEMPOTENCY_CONFLICT", "启动键不能复用取消控制键");
      const fingerprint = createHash("sha256")
        .update(JSON.stringify(command.payload))
        .digest("hex");
      const prior = this.records.find((r) => r.run.operationKey === command.idempotencyKey);
      if (prior)
        return prior.fingerprint === fingerprint
          ? this.snapshot()
          : failure("IDEMPOTENCY_CONFLICT", "同一评估操作标识不能更换内容");
      if (this.active)
        return failure("CAPABILITY_UNAVAILABLE", "已有评估进程运行或正在停止，请稍后显式启动");
      // Capture only after a new, explicitly authorized start. Never return/store the snapshot.
      const credentials = command.payload.mode === "deepseek" ? this.credentials() : undefined;
      if (
        command.payload.mode === "deepseek" &&
        (!credentials || credentials.model !== command.payload.model)
      )
        return failure("MODEL_AUTH_FAILED", "请先保存当前 API Key 和模型，再确认启动评估");
      const mode =
        command.payload.mode === "deepseek" && !this.httpFixture ? "deepseek" : "fixture";
      const run: ModelEvaluationRun = {
        runId: randomUUID(),
        operationKey: command.idempotencyKey,
        requestedMode: command.payload.mode,
        mode,
        transport:
          mode === "deepseek"
            ? "deepseek"
            : command.payload.mode === "deepseek"
              ? "http_fixture"
              : "scripted_fixture",
        status: "running",
        startedAt: new Date().toISOString(),
        finishedAt: null,
        observedRows: 0,
        errorCode: null,
        report: null,
      };
      const record = { fingerprint, run, controls: [] as string[] };
      this.save(record);
      this.records.unshift(record);
      const workspaceRoot = join(this.directory, "workspaces", run.runId);
      mkdirSync(workspaceRoot, { recursive: true, mode: 0o700 });
      let child: EvaluationChild;
      try {
        child = this.fork();
      } catch {
        run.status = "failed";
        run.errorCode = "CAPABILITY_UNAVAILABLE";
        run.finishedAt = new Date().toISOString();
        this.save(record);
        return this.snapshot();
      }
      let exited = () => {};
      const active = {
        runId: run.runId,
        child,
        exited: new Promise<void>((resolve) => {
          exited = resolve;
        }),
        timer: setTimeout(() => {
          if (run.status === "running") {
            run.status = "interrupted";
            run.errorCode = "MODEL_TIMEOUT";
            run.finishedAt = new Date().toISOString();
            try {
              this.save(record);
            } catch {
              this.corrupt = true;
            }
          }
          child.kill();
        }, 600000),
        killTimer: undefined as ReturnType<typeof setTimeout> | undefined,
        heartbeat: setInterval(() => {
          try {
            child.postMessage({ type: "heartbeat" });
          } catch {
            child.kill();
          }
        }, 1000),
      };
      this.active = active;
      let ready = false;
      const startup = setTimeout(() => child.kill(), 15000);
      child.on("message", (message) => {
        const parsed = EvaluationWorkerOutputSchema.safeParse(message);
        if (!parsed.success || this.active !== active) return;
        try {
          const data = parsed.data;
          if (data.type === "ready") {
            if (ready) return;
            ready = true;
            clearTimeout(startup);
            if (run.status !== "running") {
              child.kill();
              return;
            }
            child.postMessage({
              type: "start",
              mode,
              workspaceRoot,
              ...(mode === "deepseek" ? { credentials } : {}),
              ...(run.transport === "http_fixture"
                ? { httpFixture: { endpoint: this.httpFixture, credentials } }
                : {}),
            });
            return;
          }
          if (data.type === "progress" && run.status === "running") {
            run.observedRows = Math.max(run.observedRows, data.observedRows);
            this.save(record);
            return;
          }
          if (
            data.type === "report" &&
            (run.status === "running" ||
              (run.status === "cancelled" && data.report.status === "cancelled"))
          ) {
            if (data.report.mode !== run.mode) throw new Error("mode");
            run.report = data.report;
            run.observedRows = data.report.rows.filter((r) => r.status !== "not_run").length;
            run.status = data.report.status === "cancelled" ? "cancelled" : "completed";
            run.errorCode = run.status === "cancelled" ? "CANCELLED" : null;
            run.finishedAt = new Date().toISOString();
            this.save(record);
            child.kill();
            return;
          }
          if (data.type === "failed" && run.status === "running") {
            run.status = "failed";
            run.errorCode = data.code;
            run.finishedAt = new Date().toISOString();
            this.save(record);
            child.kill();
          }
        } catch {
          this.corrupt = true;
          child.kill();
        }
      });
      child.on("exit", () => {
        clearTimeout(startup);
        clearTimeout(active.timer);
        clearInterval(active.heartbeat);
        clearTimeout(active.killTimer);
        if (run.status === "running") {
          run.status = "interrupted";
          run.errorCode = "CAPABILITY_UNAVAILABLE";
          run.finishedAt = new Date().toISOString();
          try {
            this.save(record);
          } catch {
            this.corrupt = true;
          }
        }
        try {
          rmSync(workspaceRoot, { recursive: true, force: true });
        } catch {
          this.corrupt = true;
        }
        if (this.active === active) this.active = undefined;
        exited();
      });
      return this.snapshot();
    } catch {
      return failure("STORAGE_ERROR", "评估记录保存失败，请刷新核对；不会自动重新调用模型");
    }
  }
  async close() {
    this.closing = true;
    const active = this.active;
    if (!active) return;
    active.child.kill();
    await active.exited;
  }
}
