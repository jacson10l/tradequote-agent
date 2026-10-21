import config from "./electron.vite.config";
// Only a Vite server for E2E; electron-vite --rendererOnly still launches Electron.
export default {
  ...config.renderer,
  root: "src/renderer",
  server: { host: "127.0.0.1", port: 5189, strictPort: true },
};
