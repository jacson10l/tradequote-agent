import assert from "node:assert/strict";
import { DeepSeekHarness } from "@deepseek-ai/dsh-sdk-client";
import Decimal from "decimal.js";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { platform, arch, release } from "node:os";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { fileURLToPath } from "node:url";
import { openStore } from "./storage.mjs";
export async function harnessProbe(dir) {
// Real published Harness + loopback fixtures; no real model/DB/Electron.
assert.ok(["darwin", "linux"].includes(process.platform), "Process observation is Unix-only; Windows validation is pending.");
const workspace = await mkdtemp(resolve(dir,"harness-"));
const bridgeToken = randomUUID();
const requests = [], businessCalls = [], revisions = [];
const allowlist = ["calculate_quote", "create_quote_revision", "search_catalog"];
const store = openStore(resolve(workspace, "harness-business.sqlite"));
let calculation, releaseWait;
let mode = "flow", step = 0, responseCount = 0;
const waitArrived = new Promise(resolve => { releaseWait = resolve; });
const flow = [
  { name: "search_catalog", input: { query: "valve" } },
  { name: "calculate_quote", input: { sku: "VALVE-01", quantity: "3" } },
  { name: "create_quote_revision", input: { calculationId: "calc-1", expectedVersion: 0 } },
  { name: "create_quote_revision", input: { calculationId: "calc-1", expectedVersion: 0 } },
  { name: "bash", input: { command: "echo must-not-execute" } },
  { name: "calculate_quote", input: { sku: "VALVE-01", quantity: 3 } },
  { name: "search_catalog", input: { query: "valve", workspaceId: "model-forged" } },
];
const report = {
  at: new Date().toISOString(),
  environment: { node: process.version, platform: platform(), arch: arch(), release: release() },
  realModel: false, checks: [], requests, businessCalls,
};
const check = (name, detail = {}) => report.checks.push({ check: name, status: "passed", ...detail });
const server = createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
    if (req.url === "/business") {
      assert.equal(req.headers.authorization, `Bearer ${bridgeToken}`);
      assert.ok(allowlist.includes(body.tool));
      businessCalls.push(body);
      let value;
      if (body.tool === "search_catalog") {
        value = { sku: "VALVE-01", unitPrice: "0.10", currency: "USD", evidenceId: "synthetic-price-v1" };
      } else if (body.tool === "calculate_quote") {
        assert.equal(body.args.sku, "VALVE-01");
        assert.equal(typeof body.args.quantity, "string");
        const quantity = new Decimal(body.args.quantity);
        assert.ok(quantity.isPositive());
        calculation = { id: "calc-1", total: quantity.times("0.10").toFixed(2), currency: "USD" };
        value = calculation;
      } else {
        assert.equal(body.args.calculationId, calculation?.id);
        value = store.revise({ quantity: "3", expectedVersion: body.args.expectedVersion }, "host-operation-1");
        value = { ...value, revisionId: "revision-1" };
        if (!revisions.length) revisions.push(value);
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(value));
      return;
    }
    assert.equal(req.url, "/v1/messages");
    const tools = (body.tools ?? []).map(t => t.name).sort();
    assert.deepEqual(tools, allowlist);
    requests.push({
      path: req.url, tools, stream: body.stream, mode,
      toolResults: body.messages.flatMap(m => Array.isArray(m.content) ? m.content.filter(c => c.type === "tool_result") : []),
    });
    if (mode === "wait") { releaseWait(); return; }
    const tool = mode === "flow" ? flow[step++] : step++ === 0 ? flow[2] : undefined;
    const responseId = ++responseCount;
    res.writeHead(200, { "content-type": "text/event-stream" });
    const emit = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
    emit("message_start", { message: { id: `fixture-${responseId}`, type: "message", role: "assistant", model: "m0-fixture", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } });
    if (tool) {
      emit("content_block_start", { index: 0, content_block: { type: "tool_use", id: `call-${responseId}`, name: tool.name, input: {} } });
      emit("content_block_delta", { index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(tool.input) } });
    } else {
      emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
      emit("content_block_delta", { index: 0, delta: { type: "text_delta", text: '{"revisionId":"revision-1","status":"fixture-only"}' } });
    }
    emit("content_block_stop", { index: 0 });
    emit("message_delta", { delta: { stop_reason: tool ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
    emit("message_stop", {});
    res.end();
  } catch (error) {
    report.checks.push({ check: "fixture-server", status: "failed", error: String(error) });
    res.writeHead(500);
    res.end("fixture assertion failed");
  }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const disabled = ["tool-fs", "tool-working-directory", "persistent-bash", "persistent-pwsh", "pty", "terminal-bash", "terminal-pwsh", "mcp-resources"];
const patch = resolve(workspace, "business.patch.yml");
await writeFile(patch, disabled.map(id => `- id: ${id}\n  disabled: true\n`).join("") +
  `- id: llm-deepseek\n  config:\n    baseURL: http://127.0.0.1:${port}\n    thinking: disabled\n    reasoningEffort: off\n    streamIdleTimeoutMs: 10000\n` +
  `- insert:\n    - id: tradequote-business\n      name: ${JSON.stringify(fileURLToPath(new URL("./business-tools.mjs", import.meta.url)))}\n`);
const options = {
  profile: "sdk-minimal", patches: [patch],
  dshHome: resolve(workspace, "home"), processCwd: workspace, cwd: workspace,
  env: { PATH: process.env.PATH, ELECTRON_RUN_AS_NODE: "1", DEEPSEEK_API_KEY: "synthetic-m0-key",
    M0_BUSINESS_URL: `http://127.0.0.1:${port}/business`, M0_BRIDGE_TOKEN: bridgeToken },
  model: "deepseek-v4-flash", maxTokens: 256,
  initializeTimeoutMs: 15000, requestTimeoutMs: 10000,
  shutdownTimeoutMs: 2000, disposeEofGraceMs: 3000, disposeGraceMs: 2000,
};
let harness = new DeepSeekHarness(options);
function runtimePids() {
  assert.notEqual(process.platform, "win32", "This process probe currently requires macOS/Linux ps; Windows is NOT verified.");
  return execFileSync("ps", ["-axo", "pid=,ppid=,comm="], { encoding: "utf8" })
    .split("\n").map(line => line.trim().split(/\s+/))
    .filter(([, ppid, name]) => Number(ppid) === process.pid && name?.includes("node"))
    .map(([pid]) => Number(pid));
}
function assertReaped(pids) {
  for (const pid of pids) assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
}
async function bounded(promise, milliseconds = 15000) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("M0 deadline")), milliseconds); })]);
  } finally { clearTimeout(timer); }
}
try {
  const started = performance.now();
  await harness.start();
  const pids = runtimePids();
  assert.equal(pids.length, 1);
  check("initialize", { ms: Math.round(performance.now() - started) });
  const result = await bounded(harness.run("Synthetic business flow.", { sessionId: "m0-fixture" }));
  assert.deepEqual(JSON.parse(result.finalResponse), { revisionId: "revision-1", status: "fixture-only" });
  assert.equal(revisions.length, 1);
  assert.equal(revisions[0].total, "0.30");
  assert.deepEqual(businessCalls.map(c => c.tool), ["search_catalog", "calculate_quote", "create_quote_revision", "create_quote_revision"]);
  assert.equal(requests.at(-1).toolResults.filter(r => r.is_error).length, 3);
  check("business-tools-and-structured-result", { eventCount: result.events.length, decimalTotal: revisions[0].total });
  check("tool-allowlist-enforced", { visibleTools: allowlist, blocked: ["bash", "numeric quantity", "forged workspaceId"] });
  check("host-idempotency-repeat", { committedRevisions: revisions.length });
  await harness.close();
  assertReaped(pids);
  check("graceful-close-process-reaped");
  harness = new DeepSeekHarness(options);
  await harness.resumeSession("m0-fixture");
  mode = "resume"; step = 0;
  const resumed = await bounded(harness.run("Retry the same host operation.", { sessionId: "m0-fixture" }));
  assert.equal(JSON.parse(resumed.finalResponse).revisionId, "revision-1");
  assert.equal(revisions.length, 1);
  check("resume-after-process-restart", { committedRevisions: revisions.length });
  const restoredPids = runtimePids();
  assert.equal(restoredPids.length, 1);
  mode = "wait";
  const pending = harness.run("Wait for cancellation.", { sessionId: "m0-fixture" }).then(
    () => ({ resolved: true }), error => ({ rejected: true, error: error.name }),
  );
  await bounded(waitArrived);
  const closing = performance.now();
  await harness.close();
  const cancelled = await bounded(pending);
  assert.equal(cancelled.rejected, true);
  assertReaped(restoredPids);
  assert.equal(revisions.length, 1);
  check("cancel-by-owned-process-close", { ms: Math.round(performance.now() - closing), committedRevisions: revisions.length, pendingResult: cancelled });
  harness = new DeepSeekHarness(options);
  mode = "resume"; step = 0;
  await harness.resumeSession("m0-fixture");
  const afterCancel = await bounded(harness.run("Resume cancelled turn.", { sessionId: "m0-fixture" }));
  assert.equal(JSON.parse(afterCancel.finalResponse).revisionId, "revision-1");
  assert.equal(revisions.length, 1);
  check("resume-after-cancellation");
  await assert.rejects(() => harness.resumeSession("missing-fixture-session"));
  check("missing-session-rejected");
  await assert.rejects(
    () => harness.client.request("session/cancel", { sessionId: "m0-fixture" }),
    error => error.name === "JsonRpcResponseError" && error.code === -32603 && /unknown .* method: session\/cancel/.test(error.message),
  );
  check("per-session-cancel-not-in-protocol", { rpcErrorCode: -32603, decision: "one active run per owned process; close cancels process" });
} catch (error) {
  report.checks.push({ check: "runtime", status: "failed", error: String(error).slice(0, 16000) });
  report.failed = true;
} finally {
  try {
    const pids = runtimePids();
    await harness.close();
    assertReaped(pids);
    check("final-close-process-reaped");
  } catch (error) {
    report.checks.push({ check: "close", status: "failed", error: String(error) });
    report.failed = true;
  }
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  if (report.checks.some(c => c.status === "failed")) report.failed = true;
  report.requests = requests.map(({ toolResults, ...request }) => ({ ...request, toolResultCount: toolResults.length, toolErrorCount: toolResults.filter(r => r.is_error).length }));
  report.dependencies = JSON.parse(await readFile(new URL("./package.json", import.meta.url), "utf8")).dependencies;
  store.db.close();
}

if (report.failed) throw new Error(JSON.stringify(report.checks.filter(c=>c.status==="failed")));
return {checks:report.checks, realModel:false, persistence:"SQLite synthetic business service"};
}
