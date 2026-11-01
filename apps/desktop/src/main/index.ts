import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { open, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  failure,
  KnowledgeDesktopCommandSchema,
  KnowledgeMaintenanceCommandSchema,
  ModelEvaluationCommandSchema,
  ModelSettingsCommandSchema,
  PetCommandSchema,
  RuntimeCommandSchema,
  TradeBoardSchema,
  WikiCommandSchema,
} from "@tradequote/contracts";
import { TradeFault } from "@tradequote/domain";
import {
  DeepSeekProvider,
  ModelSettingsStore,
  PetMemoryStore,
  summarizeQuoteBoard,
} from "@tradequote/infrastructure";
import {
  app,
  BrowserWindow,
  dialog,
  type IpcMainInvokeEvent,
  ipcMain,
  nativeImage,
  safeStorage,
  session,
  utilityProcess,
} from "electron";
import { ModelEvaluationHost } from "./evaluation-host";
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
/**
 * 只读拉取当前工作区报价板，提炼成一段文本上下文供小人对话引用。
 * 不写业务库、不触发任何写命令；worker 未就绪或读取失败时返回 undefined（降级）。
 * 金额仅展示冻结快照中已确定的值；nullable 金额显式标注"待定"（见 summarizeQuoteBoard）。
 */
async function readOnlyQuoteContext(
  worker: BusinessWorker | undefined,
): Promise<string | undefined> {
  if (!worker) return undefined;
  const result = await worker.request({
    schemaVersion: 1,
    requestId: randomUUID(),
    method: "trade.get",
  });
  if (!result.ok) return undefined;
  const board = TradeBoardSchema.safeParse(result.data);
  if (!board.success) return undefined;
  return summarizeQuoteBoard(board.data);
}

const locked = app.requestSingleInstanceLock();
let worker: BusinessWorker | undefined;
let evaluation: ModelEvaluationHost | undefined;
let petMemory: PetMemoryStore | undefined;
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
      evaluation = new ModelEvaluationHost(
        join(app.getPath("userData"), "model-evaluations"),
        () =>
          utilityProcess.fork(join(__dirname, "evaluation.js"), [], {
            serviceName: "TradeQuote Model Evaluation",
            stdio: "ignore",
          }),
        () => settings.getCredentials(),
        fixture,
      );
      let settingsBusy = false;
      worker = new BusinessWorker(
        join(__dirname, "worker.js"),
        join(app.getPath("userData"), "workspaces", "default", "workspace.sqlite"),
        fixture,
      );
      // 虚拟形象记忆：独立 pet-memory.db，与业务 SQLite 完全隔离。
      petMemory = new PetMemoryStore(join(app.getPath("userData"), "pet-memory", "pet-memory.db"));
      // Chromium canonicalizes HTTP root URLs (including the trailing slash).
      // Compare against that same serialization while retaining exact-page checks.
      const rendererUrl = new URL(
        (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) ||
          pathToFileURL(join(__dirname, "../renderer/index.html")).href,
      ).href;
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
      // Only the trusted application main frame may write sanitized clipboard text.
      // Clipboard reads and every other browser permission remain denied.
      const clipboardWriter = (
        contents: Electron.WebContents | null,
        permission: string,
        details: { isMainFrame: boolean; requestingUrl?: string },
      ) =>
        !!window &&
        contents === window.webContents &&
        permission === "clipboard-sanitized-write" &&
        details.isMainFrame &&
        details.requestingUrl?.split("#")[0] === rendererUrl.split("#")[0];
      session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) =>
        clipboardWriter(contents, permission, details),
      );
      session.defaultSession.setPermissionRequestHandler(
        (contents, permission, callback, details) =>
          callback(clipboardWriter(contents, permission, details)),
      );
      for (const channel of [
        "knowledge.wiki",
        "knowledge.maintenance",
        "knowledge.desktop",
      ] as const) {
        ipcMain.handle(channel, (event, input: unknown) => {
          if (!trusted(event)) return failure("ACTION_NOT_ALLOWED", "调用来源不允许");
          const schema =
            channel === "knowledge.wiki"
              ? WikiCommandSchema
              : channel === "knowledge.maintenance"
                ? KnowledgeMaintenanceCommandSchema
                : KnowledgeDesktopCommandSchema;
          const parsed = schema.safeParse(input);
          if (!parsed.success) return failure("VALIDATION_ERROR", "知识请求字段不合法");
          if (
            channel === "knowledge.maintenance" &&
            !["wiki.lint", "wiki.getLintReport", "source.withdraw"].includes(parsed.data.method)
          )
            return failure("CAPABILITY_UNAVAILABLE", "当前桌面仅提供知识检查、报告与来源撤回");
          if (parsed.data.method === "wiki.registerConsumption")
            return failure("ACTION_NOT_ALLOWED", "来源消费仅由业务事务登记");
          if (parsed.data.method === "knowledge.organize" && settingsBusy)
            return failure("CAPABILITY_UNAVAILABLE", "请等待模型设置保存完成");
          return (
            worker?.request(
              parsed.data,
              parsed.data.method === "knowledge.organize" ? settings.getCredentials() : undefined,
            ) ?? failure("CAPABILITY_UNAVAILABLE", "业务进程未启动")
          );
        });
      }
      for (const method of [
        "modelEvaluation.start",
        "modelEvaluation.list",
        "modelEvaluation.cancel",
        "modelEvaluation.export",
      ] as const) {
        ipcMain.handle(method, async (event, input: unknown) => {
          if (!trusted(event)) return failure("ACTION_NOT_ALLOWED", "调用来源不允许");
          const parsed = ModelEvaluationCommandSchema.safeParse(input);
          if (!parsed.success || parsed.data.method !== method)
            return failure("VALIDATION_ERROR", "评估请求字段不合法");
          if (method === "modelEvaluation.start" && settingsBusy)
            return failure("CAPABILITY_UNAVAILABLE", "请等待模型设置保存完成后再启动评估");
          const result =
            evaluation?.execute(parsed.data) ?? failure("CAPABILITY_UNAVAILABLE", "评估宿主未就绪");
          if (!result.ok || result.data.kind !== "export") return result;
          if (!window) return failure("ACTION_NOT_ALLOWED", "窗口已关闭");
          try {
            const selected = await dialog.showSaveDialog(window, {
              title: "保存脱敏评估报告",
              defaultPath: result.data.filename,
              filters: [
                {
                  name:
                    parsed.data.method === "modelEvaluation.export" &&
                    parsed.data.payload.format === "json"
                      ? "JSON"
                      : "Markdown",
                  extensions: [result.data.filename.endsWith(".json") ? "json" : "md"],
                },
              ],
            });
            if (selected.canceled || !selected.filePath)
              return {
                ok: true,
                data: { kind: "saved", saved: false },
                warnings: [],
                evidenceIds: [],
              };
            await writeFile(selected.filePath, result.data.content, { mode: 0o600 });
            return {
              ok: true,
              data: { kind: "saved", saved: true },
              warnings: [],
              evidenceIds: [],
            };
          } catch {
            return failure("STORAGE_ERROR", "脱敏报告保存失败，请重新选择位置");
          }
        });
      }
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
      ipcMain.handle("pet.getState", (event, input: unknown) => {
        if (!trusted(event)) return failure("ACTION_NOT_ALLOWED", "调用来源不允许");
        const parsed = PetCommandSchema.safeParse(input);
        if (!parsed.success || parsed.data.method !== "pet.getState")
          return failure("VALIDATION_ERROR", "虚拟形象请求字段不合法");
        if (!petMemory) return failure("CAPABILITY_UNAVAILABLE", "虚拟形象记忆未就绪");
        try {
          return petMemory.getState();
        } catch (error) {
          return error instanceof TradeFault
            ? failure(error.code, error.message)
            : failure("STORAGE_ERROR", "虚拟形象记忆操作失败，请重试");
        }
      });
      ipcMain.handle("pet.proposePersona", (event, input: unknown) => {
        if (!trusted(event)) return failure("ACTION_NOT_ALLOWED", "调用来源不允许");
        const parsed = PetCommandSchema.safeParse(input);
        if (!parsed.success || parsed.data.method !== "pet.proposePersona")
          return failure("VALIDATION_ERROR", "人设字段不合法");
        if (!petMemory) return failure("CAPABILITY_UNAVAILABLE", "虚拟形象记忆未就绪");
        try {
          return petMemory.proposePersona(parsed.data.payload.content);
        } catch (error) {
          return error instanceof TradeFault
            ? failure(error.code, error.message)
            : failure("STORAGE_ERROR", "人设保存失败，请重试");
        }
      });
      ipcMain.handle("pet.approvePersona", (event, input: unknown) => {
        if (!trusted(event)) return failure("ACTION_NOT_ALLOWED", "调用来源不允许");
        const parsed = PetCommandSchema.safeParse(input);
        if (!parsed.success || parsed.data.method !== "pet.approvePersona")
          return failure("VALIDATION_ERROR", "人设审核字段不合法");
        if (!petMemory) return failure("CAPABILITY_UNAVAILABLE", "虚拟形象记忆未就绪");
        try {
          return petMemory.approvePersona(
            parsed.data.payload.personaId,
            parsed.data.payload.approvedBy,
          );
        } catch (error) {
          return error instanceof TradeFault
            ? failure(error.code, error.message)
            : failure("STORAGE_ERROR", "人设审核失败，请重试");
        }
      });
      ipcMain.handle("pet.chat", async (event, input: unknown) => {
        if (!trusted(event)) return failure("ACTION_NOT_ALLOWED", "调用来源不允许");
        const parsed = PetCommandSchema.safeParse(input);
        if (!parsed.success || parsed.data.method !== "pet.chat")
          return failure("VALIDATION_ERROR", "对话字段不合法");
        const credentials = settings.getCredentials();
        if (!credentials) return failure("MODEL_AUTH_FAILED", "请先在模型设置保存 API Key");
        if (!petMemory) return failure("CAPABILITY_UNAVAILABLE", "虚拟形象记忆未就绪");
        try {
          const persona = petMemory.activePersona();
          const state = petMemory.getState();
          const systemParts: string[] = [];
          if (persona)
            systemParts.push(`你是 TradeQuote 的虚拟形象助手，人设如下：\n${persona.content}`);
          else
            systemParts.push(
              "你是 TradeQuote 询报价工作台的虚拟形象助手，友好、专业、温暖。可回答用户关于产品使用的疑问，也可闲聊。",
            );
          const memoryLines = state.data.memories
            .filter((m) => m.kind === "fact")
            .map((m) => `- ${m.content}`)
            .join("\n");
          if (memoryLines) systemParts.push(`你记得关于用户的这些事：\n${memoryLines}`);
          const summaryLines = state.data.memories
            .filter((m) => m.kind === "summary")
            .map((m) => `- ${m.content}`)
            .join("\n");
          if (summaryLines) systemParts.push(`你对这段关系的长期印象：\n${summaryLines}`);

          // 只读报价上下文：尽力拉取当前工作区报价板，提炼摘要注入，不写业务库。
          const quoteContext = await readOnlyQuoteContext(worker);
          if (quoteContext) systemParts.push(quoteContext);

          const provider = new DeepSeekProvider(credentials, fetch, fixture);
          const messages = [
            { role: "system" as const, content: systemParts.join("\n\n") },
            ...parsed.data.payload.history.map((h) => ({ role: h.role, content: h.content })),
            { role: "user" as const, content: parsed.data.payload.message },
          ];
          const reply = await provider.chat(messages);

          // 会话记忆：记录本次用户提问（免审自动写，有界），必要时压缩为摘要。
          petMemory.appendMemory("fact", `用户说：${parsed.data.payload.message.slice(0, 200)}`);
          await petMemory.maybeSummarize(provider);

          return {
            ok: true,
            data: { reply },
            warnings: [],
            evidenceIds: [],
          };
        } catch (error) {
          return error instanceof TradeFault
            ? failure(error.code, error.message)
            : failure("CAPABILITY_UNAVAILABLE", "对话失败，请稍后重试");
        }
      });
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
        "quote.approve",
        "quote.check",
        "quote.getChecks",
        "agent.understand",
        "agent.revise",
        "agent.read",
        "agent.start",
        "agent.continue",
        "agent.get",
        "agent.list",
        "agent.events",
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
              [
                "agent.read",
                "agent.start",
                "agent.continue",
                "agent.retry",
                "agent.understand",
                "agent.revise",
              ].includes(parsed.data.method)
                ? settings.getCredentials()
                : undefined,
            ) ?? failure("CAPABILITY_UNAVAILABLE", "业务进程未启动")
          );
        });
      }
      const releaseEvents = worker.onRunEvents((signal) => {
        if (
          window &&
          !window.webContents.isDestroyed() &&
          window.webContents.getURL().split("#")[0] === rendererUrl.split("#")[0]
        )
          window.webContents.send("agent.events.signal", signal);
      });
      window.on("closed", () => {
        releaseEvents();
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
    if (workerStopped || (!worker && !evaluation && !petMemory)) return;
    event.preventDefault();
    if (quitting) return;
    quitting = true;
    try {
      petMemory?.close();
    } catch {
      /* best effort */
    }
    void Promise.all([worker?.close(), evaluation?.close()]).then(() => {
      workerStopped = true;
      app.quit();
    });
  });
}
