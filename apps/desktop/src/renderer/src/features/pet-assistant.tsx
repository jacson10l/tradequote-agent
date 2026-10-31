import type { DesktopClient } from "@tradequote/contracts";
import { useEffect, useRef, useState } from "react";
import petAvatar from "../../../../resources/pet-avatar.png";
import { Button } from "../shared/button";

type ChatTurn = { role: "user" | "assistant"; content: string };

export function PetAssistantPage({ client }: { client: DesktopClient }) {
  const [personaText, setPersonaText] = useState("");
  const [personaStatus, setPersonaStatus] = useState<string>("");
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const envelope = {
    schemaVersion: 1 as const,
    requestId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
  };

  async function refresh() {
    const result = await client.getPetState({
      ...envelope,
      method: "pet.getState",
    });
    if (result.ok) {
      setPersonaStatus(result.data.persona?.status ?? "none");
      if (result.data.persona) setPersonaText(result.data.persona.content);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns]);

  async function proposePersona() {
    if (!personaText.trim() || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await client.proposePersona({
        ...envelope,
        method: "pet.proposePersona",
        payload: { content: personaText.trim() },
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setPersonaStatus("candidate");
      setNotice("人设已保存为候选，待人工审核后生效。");
    } catch {
      setError("连接中断，请重试。");
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    const result = await client.getPetState({ ...envelope, method: "pet.getState" });
    if (!result.ok || !result.data.persona || result.data.persona.status !== "candidate") {
      setError("没有待审核的人设候选。");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const approved = await client.approvePersona({
        ...envelope,
        method: "pet.approvePersona",
        payload: { personaId: result.data.persona.id, approvedBy: "本地操作员" },
      });
      if (!approved.ok) {
        setError(approved.error.message);
        return;
      }
      setPersonaStatus("approved");
      setNotice("人设已审核生效。");
    } catch {
      setError("审核连接中断，请重试。");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!message.trim() || busy) return;
    const text = message.trim();
    setMessage("");
    setTurns((prev) => [...prev, { role: "user", content: text }]);
    setBusy(true);
    setError("");
    try {
      const result = await client.petChat({
        ...envelope,
        method: "pet.chat",
        payload: {
          message: text,
          // 传最近 20 轮历史，让对话具备上下文；超出契约上限由主进程截断。
          history: turns.slice(-20),
        },
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setTurns((prev) => [...prev, { role: "assistant", content: result.data.reply }]);
    } catch {
      setError("对话连接中断，请重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="sr-only">报价助手</h1>
      <div className="workbench-grid">
        <section className="panel document space-y-4" aria-label="对话">
          <div className="section-heading">
            <h2 className="flex items-center gap-2">
              <img className="pet-avatar-sm" src={petAvatar} alt="" />
              报价助手 · 对话
            </h2>
          </div>
          <div className="pet-conversation" ref={scrollRef}>
            {turns.length === 0 ? (
              <p className="description">你好，我是 TradeQuote 的报价助手。有什么可以帮你？</p>
            ) : (
              turns.map((t, i) => (
                <div key={i} className={t.role === "user" ? "pet-turn-user" : "pet-turn-assistant"}>
                  <p className="whitespace-pre-wrap">{t.content}</p>
                </div>
              ))
            )}
            {busy && <p role="status">助手正在思考…</p>}
          </div>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <textarea
              rows={2}
              maxLength={4000}
              value={message}
              disabled={busy}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="和助手聊聊，或询问产品使用问题……"
            />
            <Button className="w-full" disabled={busy || !message.trim()}>
              发送
            </Button>
          </form>
          {error && (
            <p role="alert" className="error-box">
              {error}
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
        </section>
        <aside className="agent-panel space-y-4" aria-label="人设与记忆">
          <div className="section-heading">
            <h2>人设与记忆</h2>
          </div>
          <p className="description">
            人设是助手的品牌人格，需人工审核后生效；会话记忆随对话自动积累。
          </p>
          <label htmlFor="pet-persona">人设内容</label>
          <textarea
            id="pet-persona"
            rows={5}
            maxLength={4000}
            value={personaText}
            disabled={busy}
            onChange={(e) => setPersonaText(e.target.value)}
            placeholder="例如：我是 TradeQuote 的报价助手，性格温暖专业，喜欢用橙色的语气和你打招呼……"
          />
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              disabled={busy || !personaText.trim() || personaStatus === "approved"}
              onClick={() => void proposePersona()}
            >
              保存人设候选
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || personaStatus !== "candidate"}
              onClick={() => void approve()}
            >
              审核生效
            </Button>
          </div>
          <p className="description">
            当前人设状态：
            {personaStatus === "approved"
              ? "已生效"
              : personaStatus === "candidate"
                ? "待审核"
                : "未设置"}
          </p>
        </aside>
      </div>
    </div>
  );
}
