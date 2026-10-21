import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { CommandSchema, failure } from "@tradequote/contracts";
import { app, BrowserWindow, ipcMain, nativeImage, session } from "electron";
import { BusinessWorker } from "./worker-client";

// Test data isolation is only available in unpackaged development builds.
if (!app.isPackaged && process.env.TRADEQUOTE_TEST_DATA) {
  mkdirSync(process.env.TRADEQUOTE_TEST_DATA, { recursive: true });
  app.setPath("userData", process.env.TRADEQUOTE_TEST_DATA);
}
const locked = app.requestSingleInstanceLock();
let worker: BusinessWorker | undefined;
let window: BrowserWindow | undefined;
if (!locked) app.quit();
else {
  app.on("second-instance", () => {
    window?.restore();
    window?.focus();
  });
  app
    .whenReady()
    .then(() => {
      session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
        callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      worker = new BusinessWorker(
        join(__dirname, "worker.js"),
        join(app.getPath("userData"), "workspaces", "default", "workspace.sqlite"),
      );
      const rendererUrl =
        (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) ||
        pathToFileURL(join(__dirname, "../renderer/index.html")).href;
      const icon = nativeImage.createFromPath(join(__dirname, "../../resources/icon.png"));
      if (icon.isEmpty()) throw new Error("APPLICATION_ICON_MISSING");
      app.dock?.setIcon(icon);
      app.setAppUserModelId("local.tradequote.desktop");
      window = new BrowserWindow({
        icon,
        width: 1380,
        height: 900,
        minWidth: 800,
        minHeight: 640,
        title: "TradeQuote",
        backgroundColor: "#FFFAEB",
        webPreferences: {
          preload: join(__dirname, "../preload/index.js"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("will-navigate", (event) => event.preventDefault());
      window.webContents.on("will-attach-webview", (event) => event.preventDefault());
      for (const method of ["workspace.get", "workspace.create", "workspace.rename"] as const) {
        ipcMain.handle(method, (event, input: unknown) => {
          if (
            !window ||
            event.sender !== window.webContents ||
            event.senderFrame !== window.webContents.mainFrame ||
            event.senderFrame.url.split("#")[0] !== rendererUrl.split("#")[0]
          ) {
            return failure("ACTION_NOT_ALLOWED", "调用来源不允许");
          }
          const parsed = CommandSchema.safeParse(input);
          if (!parsed.success || parsed.data.method !== method)
            return failure("VALIDATION_ERROR", "请求字段不合法");
          return (
            worker?.request(parsed.data) ?? failure("CAPABILITY_UNAVAILABLE", "业务进程未启动")
          );
        });
      }
      window.on("closed", () => {
        window = undefined;
      });
      void window.loadURL(rendererUrl);
    })
    .catch(() => {
      app.exit(1);
    });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", () => worker?.close());
}
