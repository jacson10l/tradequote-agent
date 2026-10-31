import { defineConfig } from "vitest/config";
// Explicit B contract probe; never part of the normal unit-test success claim.
export default defineConfig({
  test: {
    include: ["packages/infrastructure/probes/a01e-contract.probe.ts"],
    environment: "node",
  },
});
