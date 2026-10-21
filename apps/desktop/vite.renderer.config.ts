import config from "./electron.vite.config";
// Only a Vite server for E2E; electron-vite --rendererOnly still launches Electron.
export default { ...config.renderer, root: "src/renderer" };
