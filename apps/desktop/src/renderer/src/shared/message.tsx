import { CircleAlert, CircleCheck, X } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";

type MessageKind = "error" | "success";
type MessageEntry = { id: number; content: string; kind: MessageKind };
type MessageApi = Record<MessageKind, (content: string) => void>;
const MessageContext = createContext<MessageApi | null>(null);

export function MessageProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<MessageEntry[]>([]);
  const dismiss = useCallback((id: number) => {
    setEntries((current) => current.filter((entry) => entry.id !== id));
  }, []);
  const message = useMemo<MessageApi>(() => {
    let sequence = 0;
    const show = (kind: MessageKind, content: string) => {
      const entry = { id: ++sequence, kind, content };
      // Repeated failures refresh the timer instead of filling the viewport.
      setEntries((current) => [
        ...current.filter((item) => item.content !== content || item.kind !== kind).slice(-2),
        entry,
      ]);
    };
    return {
      error: (content) => show("error", content),
      success: (content) => show("success", content),
    };
  }, []);
  return (
    <MessageContext.Provider value={message}>
      {children}
      {createPortal(
        <div className="message-stack" aria-label="操作提示">
          {entries.map((entry) => (
            <MessageItem key={entry.id} entry={entry} dismiss={dismiss} />
          ))}
        </div>,
        document.body,
      )}
    </MessageContext.Provider>
  );
}

export function useMessage(): MessageApi {
  const message = useContext(MessageContext);
  if (!message) throw new Error("MessageProvider is required");
  return message;
}

function MessageItem({ entry, dismiss }: { entry: MessageEntry; dismiss: (id: number) => void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (hovered || focused) return;
    const timer = window.setTimeout(() => dismiss(entry.id), entry.kind === "error" ? 6000 : 4000);
    return () => window.clearTimeout(timer);
  }, [entry.id, entry.kind, dismiss, hovered, focused]);
  const Icon = entry.kind === "error" ? CircleAlert : CircleCheck;
  return (
    <div
      className={`message feedback-${entry.kind}`}
      role={entry.kind === "error" ? "alert" : "status"}
      aria-atomic="true"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <Icon size={18} aria-hidden="true" />
      <span>{entry.content}</span>
      <button
        className="feedback-close"
        type="button"
        aria-label="关闭提示"
        onClick={() => dismiss(entry.id)}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
