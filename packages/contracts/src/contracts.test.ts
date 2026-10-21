import { describe, expect, it } from "vitest";
import {
  CommandSchema,
  patchToolJsonSchema,
  ResultSchema,
  TypedPatchSchema,
  WorkerRequestSchema,
} from "./index";

const id = "00000000-0000-4000-8000-000000000001";
describe("untrusted boundary contracts", () => {
  it("rejects arbitrary IPC, identity injection and invalid versions", () => {
    const command = {
      schemaVersion: 1,
      requestId: id,
      idempotencyKey: id,
      method: "workspace.rename",
      payload: { name: "demo", expectedVersion: 1 },
    };
    expect(CommandSchema.safeParse(command).success).toBe(true);
    for (const invalid of [
      { ...command, actorId: "admin" },
      { ...command, method: "shell" },
      { ...command, payload: { name: " ", expectedVersion: 0 } },
      { ...command, payload: { ...command.payload, path: "../" } },
    ])
      expect(CommandSchema.safeParse(invalid).success).toBe(false);
    expect(WorkerRequestSchema.safeParse({ id, command, origin: "human_ui" }).success).toBe(false);
    expect(
      ResultSchema.safeParse({ ok: true, data: { id, name: "bad", version: "1" } }).success,
    ).toBe(false);
  });
  it("limits model patches and emits a closed JSON schema independently of provider", () => {
    expect(
      TypedPatchSchema.safeParse({
        op: "setQuantity",
        lineId: id,
        quantity: { value: "1.25", unitId: "piece" },
      }).success,
    ).toBe(true);
    for (const quantity of [1, "1,000", "-1", "NaN"])
      expect(
        TypedPatchSchema.safeParse({
          op: "setQuantity",
          lineId: id,
          quantity: { value: quantity, unitId: "piece" },
        }).success,
      ).toBe(false);
    expect(TypedPatchSchema.safeParse({ op: "setTotal", total: "0" }).success).toBe(false);
    const schema = patchToolJsonSchema();
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    expect(JSON.stringify(schema)).not.toMatch(/approval|actorId/);
  });
});
