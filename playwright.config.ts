import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  outputDir: ".runtime/e2e",
  workers: 1,
  timeout: 60000,
  reporter: "list",
  webServer: {
    command: "pnpm --filter @tradequote/desktop exec vite --config vite.renderer.config.ts",
    url: "http://127.0.0.1:5179",
    reuseExistingServer: false,
  },
});
