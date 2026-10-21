import { expect, it, vi } from "vitest";
import { createWorkspaceService, transitionWorkspace } from "./index";

const id = "00000000-0000-4000-8000-000000000001";
const rename = {
  schemaVersion: 1 as const,
  requestId: id,
  idempotencyKey: id,
  method: "workspace.rename" as const,
  payload: { name: "new", expectedVersion: 1 },
};
it("rejects stale writes without changing the current object", () => {
  const current = Object.freeze({
    id,
    name: "existing",
    version: 2,
    createdAt: "2026-10-21T00:00:00.000Z",
  });
  expect(transitionWorkspace(current, rename, id, current.createdAt)).toMatchObject({
    ok: false,
    error: { code: "REVISION_CONFLICT", currentAggregateVersion: 2 },
  });
  expect(current.name).toBe("existing");
});
it("rejects model-origin workspace writes before repository access", () => {
  const repository = { read: vi.fn(), commit: vi.fn() };
  const service = createWorkspaceService(repository);
  expect(service.execute(rename, { actorId: "local", origin: "agent_tool" })).toMatchObject({
    ok: false,
    error: { code: "ACTION_NOT_ALLOWED" },
  });
  expect(repository.commit).not.toHaveBeenCalled();
  expect(
    service.execute({ ...rename, total: 0 }, { actorId: "local", origin: "human_ui" }),
  ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
});
