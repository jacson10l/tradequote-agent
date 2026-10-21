import { mkdirSync } from "node:fs";
import { open } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { failure, ModelSettingsCommandSchema, RuntimeCommandSchema } from "@tradequote/contracts";
import { TradeFault } from "@tradequote/domain";
import { DeepSeekProvider, ModelSettingsStore } from "@tradequote/infrastructure";
import {
  app,
  BrowserWindow,
  dialog,
  type IpcMainInvokeEvent,
  ipcMain,
  nativeImage,
  safeStorage,
  session,
} from "electron";
import { BusinessWorker } from "./worker-client";

// Preserve the existing data directory when setting the runtime display name.
const existingUserData = app.getPath("userData");
app.setName("TradeQuote");
app.setPath("userData", existingUserData);

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
    .then(async () => {
      session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
        callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      // A local HTTP fixture is available only to isolated unpackaged acceptance tests.
      const fixture =
        !app.isPackaged &&
        process.env.TRADEQUOTE_TEST_DATA &&
        /^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.TRADEQUOTE_TEST_MODEL_URL ?? "")
          ? process.env.TRADEQUOTE_TEST_MODEL_URL
          : undefined;
      const settings = new ModelSettingsStore(
        join(app.getPath("userData"), "model-settings", "credentials.enc"),
        {
          available: () =>
            safeStorage.isEncryptionAvailable() &&
            (process.platform !== "linux" ||
              safeStorage.getSelectedStorageBackend() !== "basic_text"),
          encrypt: (value) => safeStorage.encryptString(value),
          decrypt: (value) => safeStorage.decryptString(value),
        },
      );
      await settings.init();
      let settingsBusy = false;
      worker = new BusinessWorker(
        join(__dirname, "worker.js"),
        join(app.getPath("userData"), "workspaces", "default", "workspace.sqlite"),
        fixture,
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
      const trusted = (event: IpcMainInvokeEvent) =>
        !!window &&
        event.sender === window.webContents &&
        event.senderFrame === window.webContents.mainFrame &&
        event.senderFrame.url.split("#")[0] === rendererUrl.split("#")[0];
      for (const method of ["model.status", "model.save", "model.clear", "model.test"] as const) {
        ipcMain.handle(method, async (event, input: unknown) => {
          if (!trusted(event)) return failure("ACTION_NOT_ALLOWED", "调用来源不允许");
          const parsed = ModelSettingsCommandSchema.safeParse(input);
          if (!parsed.success || parsed.data.method !== method)
            return failure("VALIDATION_ERROR", "设置字段不合法");
          if (settingsBusy)
            return failure("CAPABILITY_UNAVAILABLE", "模型设置正在处理，请稍后重试");
          settingsBusy = true;
          try {
            const command = parsed.data;
            if (command.method === "model.status") return settings.status();
            if (command.method === "model.save")
              return await settings.save(command.key, command.model);
            if (command.method === "model.clear") return await settings.clear();
            const credentials = settings.getCredentials();
            if (!credentials) return failure("MODEL_AUTH_FAILED", "请先保存 API Key 和模型 ID");
            const output = await new DeepSeekProvider(credentials, fetch, fixture).json([
              {
                role: "user",
                content: 'Return JSON exactly {"probe":"tradequote"}. Synthetic connection check.',
              },
            ]);
            if (
              typeof output !== "object" ||
              output === null ||
              !("probe" in output) ||
              output.probe !== "tradequote"
            )
              return failure("MODEL_INVALID_OUTPUT", "模型未返回预期 JSON");
            return settings.verified();
          } catch (error) {
            return error instanceof TradeFault
              ? failure(error.code, error.message)
              : failure("STORAGE_ERROR", "模型设置保存失败，请重试；不会回显凭据");
          } finally {
            settingsBusy = false;
          }
        });
      }
      ipcMain.handle("catalog.pickCsv", async (event) => {
        if (!trusted(event) || !window) return { status: "error", message: "调用来源不允许" };
        const selected = await dialog.showOpenDialog(window, {
          properties: ["openFile"],
          filters: [{ name: "UTF-8 CSV", extensions: ["csv"] }],
        });
        const path = selected.filePaths[0];
        if (selected.canceled || !path) return { status: "cancelled" };
        if (extname(path).toLowerCase() !== ".csv")
          return { status: "error", message: "请选择 UTF-8 CSV 文件" };
        try {
          const file = await open(path, "r");
          try {
            const stat = await file.stat();
            if (!stat.isFile() || stat.size > 262144)
              return { status: "error", message: "文件须为不超过 256 KiB 的普通 CSV" };
            const buffer = Buffer.alloc(262145);
            const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
            if (bytesRead > 262144) return { status: "error", message: "文件超过 256 KiB" };
            const csv = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
              buffer.subarray(0, bytesRead),
            );
            return { status: "selected", name: basename(path), csv };
          } finally {
            await file.close();
          }
        } catch {
          return { status: "error", message: "无法读取文件，请检查权限或转换为 UTF-8 CSV" };
        }
      });
      for (const method of [
        "workspace.get",
        "workspace.create",
        "workspace.rename",
        "trade.get",
        "scenario.save",
        "catalog.stage",
        "catalog.publish",
        "quote.createV1",
        "agent.understand",
        "agent.revise",
        "agent.read",
        "agent.start",
        "agent.get",
        "agent.list",
        "agent.cancel",
        "agent.retry",
      ] as const) {
        ipcMain.handle(method, (event, input: unknown) => {
          if (
            !window ||
            event.sender !== window.webContents ||
            event.senderFrame !== window.webContents.mainFrame ||
            event.senderFrame.url.split("#")[0] !== rendererUrl.split("#")[0]
          ) {
            return failure("ACTION_NOT_ALLOWED", "调用来源不允许");
          }
          const parsed = RuntimeCommandSchema.safeParse(input);
          if (!parsed.success || parsed.data.method !== method)
            return failure("VALIDATION_ERROR", "请求字段不合法");
          return (
            worker?.request(
              parsed.data,
              parsed.data.method.startsWith("agent.") ? settings.getCredentials() : undefined,
            ) ?? failure("CAPABILITY_UNAVAILABLE", "业务进程未启动")
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
  let quitting = false;
  let workerStopped = false;
  app.on("before-quit", (event) => {
    if (workerStopped || !worker) return;
    event.preventDefault();
    if (quitting) return;
    quitting = true;
    void worker.close().then(() => {
      workerStopped = true;
      app.quit();
    });
  });
}
