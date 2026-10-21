import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: { index: resolve("src/main/index.ts"), worker: resolve("src/workers/business.ts") },
      },
    },
  },
  preload: {
    build: { externalizeDeps: false, rollupOptions: { output: { codeSplitting: false } } },
  },
  renderer: {
    resolve: { alias: { "@": resolve("src/renderer/src") } },
    server: { host: "127.0.0.1", port: 5179, strictPort: true },
    build: { minify: true },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "local-dev-csp",
        apply: "serve",
        // Vite React refresh uses an inline bootstrap in development only.
        transformIndexHtml(html) {
          return html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'");
        },
      },
    ],
  },
});
