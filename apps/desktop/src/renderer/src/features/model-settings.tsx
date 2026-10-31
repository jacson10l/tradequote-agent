import {
  type DesktopClient,
  type ModelResult,
  type ModelSettingsCommand,
} from "@tradequote/contracts";
import { useEffect, useState } from "react";
import { Button } from "../shared/button";
import { ModelEvaluationPanel } from "./model-evaluation";

// Official API model names checked 2026-10-22: https://api-docs.deepseek.com/
const modelOptions = [
  { id: "deepseek-flash", label: "DeepSeek Flash" },
  { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
];
export function ModelSettingsPage({ client }: { client: DesktopClient }) {
  const [status, setStatus] = useState<Extract<ModelResult, { ok: true }>["data"] | null>(null);
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void client
      .modelSettings({ method: "model.status" })
      .then((result) => {
        if (!active) return;
        if (result.ok) {
          setStatus(result.data);
          setModel(result.data.model);
        } else setError(result.error.message);
      })
      .catch(() => {
        if (active) setError("无法读取模型配置，请重新加载");
      });
    return () => {
      active = false;
    };
  }, [client]);
  async function run(command: ModelSettingsCommand) {
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const result = await client.modelSettings(command);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setStatus(result.data);
      setModel(result.data.model);
      if (command.method === "model.save" || command.method === "model.clear") setKey("");
      setFeedback(
        command.method === "model.test"
          ? "连接与 JSON 测试通过；真实业务效果仍需核对。"
          : command.method === "model.clear"
            ? "本机模型凭据已清除。"
            : "模型配置已保存。",
      );
    } catch {
      setError("连接中断，请重新加载配置后核对。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <h1 className="sr-only">模型设置</h1>
      <section className="panel space-y-4">
        <h2>DeepSeek 连接与凭据</h2>
        <p className="description">接口：api.deepseek.com</p>
        <p>
          API Key 仅发送给
          DeepSeek；系统加密可用时保存到本机，不在界面回显。加密不可用时仅保留到退出应用。
        </p>
        <p className="sample-note">
          运行询盘理解 /
          对话修改会发送询盘、相关商品描述、场景与最近对话；不发送价目表金额和内部成本。请使用已获授权的业务资料。连接测试仅发送合成
          JSON 提示。
        </p>
        {status && (
          <p>
            凭据：{status.hasKey ? "已配置" : "未配置"} · 存储：
            {status.storage === "encrypted" ? "系统加密" : "仅本次会话"} · 本次会话测试：
            {status.verifiedAt ?? "尚未测试"}
          </p>
        )}
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run({ method: "model.save", key, model });
          }}
        >
          <label htmlFor="model-key">DeepSeek API Key（留空保留已配置的 Key）</label>
          <input
            id="model-key"
            type="password"
            autoComplete="off"
            maxLength={4096}
            value={key}
            disabled={busy}
            onChange={(e) => setKey(e.target.value)}
          />
          <label htmlFor="model-id">模型</label>
          <select
            id="model-id"
            required
            value={model}
            disabled={busy}
            onChange={(e) => setModel(e.target.value)}
          >
            <option value="" disabled>
              请选择 DeepSeek 模型
            </option>
            {status?.model && !modelOptions.some((option) => option.id === status.model) && (
              <option value={status.model}>已保存的模型（{status.model}）</option>
            )}
            {modelOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-3">
            <Button disabled={busy || !model}>保存模型设置</Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || !status?.hasKey || key !== "" || model !== status.model}
              onClick={() => void run({ method: "model.test" })}
            >
              测试已保存的连接
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void run({ method: "model.clear" })}
            >
              清除本机凭据
            </Button>
          </div>
        </form>
        {busy && <p role="status">正在处理，连接测试最长约 45 秒…</p>}
        {error && (
          <p role="alert" className="error-box">
            {error}
          </p>
        )}
        {feedback && <p role="status">{feedback}</p>}
      </section>
      <ModelEvaluationPanel
        client={client}
        hasKey={status?.hasKey ?? false}
        savedModel={status?.model ?? ""}
        configDirty={busy || key !== "" || model !== status?.model}
      />
    </div>
  );
}
