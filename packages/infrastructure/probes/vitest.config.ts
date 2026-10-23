import { defineConfig } from "vitest/config";
// Explicit diagnostic suite; never part of the normal unit-test success claim.
export default defineConfig({
  test: {
    include: ["packages/infrastructure/probes/migration-lineage.probe.ts"],
    environment: "node",
  },
});
