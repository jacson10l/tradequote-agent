import assert from "node:assert/strict";
import test from "node:test";
import { ApprovalBinding, DecimalString, Quantity, Revise } from "./contracts.js";
const id = "00000000-0000-4000-8000-000000000001";
const command = { quoteId: id, baseRevisionId: id, expectedAggregateVersion: 0, typedPatch: [{ type: "setQuantity", lineId: id, quantity: { value: "3", unitId: "piece" } }], reason: "synthetic" };
test("decimal strings preserve exact values and reject coerced representations", () => {
  for (const v of ["0", "0.10", "12.500000"]) assert.equal(DecimalString.parse(v), v);
  for (const v of [0.1, "NaN", "Infinity", "1e3", "1,000", " 1", "01"]) assert.equal(DecimalString.safeParse(v).success, false);
});
test("quantity unknown/zero/negative and unitless are rejected", () => {
  for (const value of ["0", "-1", ""]) assert.equal(Quantity.safeParse({ value, unitId: "piece" }).success, false);
  assert.equal(Quantity.safeParse({ value: "1" }).success, false);
});
test("typed patch cannot inject totals, actor, approval or a workspace", () => {
  assert.equal(Revise.safeParse(command).success, true);
  for (const key of ["total", "actor", "approval", "workspaceId"]) assert.equal(Revise.safeParse({ ...command, [key]: "forged" }).success, false);
  assert.equal(Revise.safeParse({ ...command, typedPatch: [{ type: "setTotal", value: "0" }] }).success, false);
});
test("approval requires exact revision and both hashes", () => {
  assert.equal(ApprovalBinding.safeParse({ revisionId: id, contentHash: "a".repeat(64) }).success, false);
  assert.equal(ApprovalBinding.safeParse({ revisionId: id, contentHash: "a".repeat(64), bundleHash: "b".repeat(64) }).success, true);
});
