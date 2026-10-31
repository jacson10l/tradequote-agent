import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentReadCommand } from "@tradequote/contracts";
import { afterEach, expect, it, vi } from "vitest";
import { CatalogQuoteReadService } from "./catalog-quote-read-service";
import { SqliteWorkspaceRepository } from "./index";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const fn of cleanup.splice(0).reverse()) fn();
});
const credentials = { key: "synthetic-private-key", model: "synthetic-model" };
const command = (): AgentReadCommand => ({
  schemaVersion: 1,
  requestId: randomUUID(),
  method: "agent.read",
  payload: { instruction: "读取商品", quoteRevisionIds: [] },
});
function fixture(create = true) {
  const dir = mkdtempSync(join(tmpdir(), "tq-read-service-"));
  const repo = new SqliteWorkspaceRepository(join(dir, "fixture.sqlite"));
  cleanup.push(() => {
    repo.close();
    rmSync(dir, { recursive: true, force: true });
  });
  if (create)
    repo.commit(
      {
        schemaVersion: 1,
        requestId: randomUUID(),
        idempotencyKey: randomUUID(),
        method: "workspace.create",
        payload: { name: "合成" },
      },
      { actorId: "test", origin: "human_ui" },
    );
  return repo;
}
it("requires valid input, configured credentials and a real workspace before model execution", async () => {
  const json = vi.fn();
  const service = new CatalogQuoteReadService(fixture(false), () => ({ json }));
  expect(await service.execute(command())).toMatchObject({
    ok: false,
    error: { code: "MODEL_AUTH_FAILED" },
  });
  expect(await service.execute(command(), credentials)).toMatchObject({
    ok: false,
    error: { code: "NOT_FOUND" },
  });
  const invalid = { ...command(), payload: { ...command().payload, asOf: "2000-01-01" } };
  expect(await service.execute(invalid, credentials)).toMatchObject({
    ok: false,
    error: { code: "VALIDATION_ERROR" },
  });
  expect(json).not.toHaveBeenCalled();
});
it("uses host clock/workspace and returns a validated reply without credentials", async () => {
  const repo = fixture();
  const json = vi.fn().mockResolvedValue({ kind: "complete", summary: "没有保存报价" });
  const result = await new CatalogQuoteReadService(
    repo,
    () => ({ json }),
    () => "2026-10-21T01:02:03.000Z",
  ).execute(command(), credentials);
  expect(result).toMatchObject({
    ok: true,
    data: {
      workspaceId: repo.read()?.id,
      asOf: "2026-10-21T01:02:03.000Z",
      outcome: "completed",
      observations: [],
    },
  });
  expect(JSON.stringify(result)).not.toContain(credentials.key);
  expect(JSON.stringify(json.mock.calls[0])).not.toContain(credentials.key);
});
it("joins identical in-flight requests, rejects competing work and never automatically retries", async () => {
  let resolve: (value: unknown) => void = () => {};
  const json = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    )
    .mockResolvedValue({ kind: "complete", summary: "读取结束" });
  const service = new CatalogQuoteReadService(fixture(), () => ({ json }));
  const input = command();
  const pending = service.execute(input, credentials);
  expect(service.execute(input, credentials)).toBe(pending);
  expect(
    await service.execute(
      { ...input, payload: { ...input.payload, instruction: "不同任务" } },
      credentials,
    ),
  ).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_CONFLICT" } });
  expect(await service.execute(command(), credentials)).toMatchObject({
    ok: false,
    error: { code: "CAPABILITY_UNAVAILABLE" },
  });
  resolve({ kind: "complete", summary: "读取结束" });
  expect(await pending).toMatchObject({ ok: true });
  expect(json).toHaveBeenCalledTimes(1);
  expect(await service.execute(command(), credentials)).toMatchObject({ ok: true });
  expect(json).toHaveBeenCalledTimes(2);
});
it("redacts unexpected failures and releases admission after a failed request", async () => {
  const json = vi
    .fn()
    .mockRejectedValueOnce(new Error("SECRET provider details"))
    .mockResolvedValue({ kind: "clarification", question: "请确认商品" });
  const service = new CatalogQuoteReadService(fixture(), () => ({ json }));
  const failed = await service.execute(command(), credentials);
  expect(failed).toMatchObject({ ok: false, error: { code: "CAPABILITY_UNAVAILABLE" } });
  expect(JSON.stringify(failed)).not.toContain("SECRET");
  expect(await service.execute(command(), credentials)).toMatchObject({
    ok: true,
    data: { outcome: "waiting_input", clarification: "请确认商品" },
  });
  expect(json).toHaveBeenCalledTimes(2);
});
