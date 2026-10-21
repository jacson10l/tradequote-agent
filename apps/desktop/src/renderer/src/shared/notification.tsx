import { CircleAlert, X } from "lucide-react";
import { useId } from "react";
import { createPortal } from "react-dom";
import { Button } from "./button";

/** Persistent, actionable feedback. The owner removes it once the issue is resolved. */
export function Notification({
  title,
  description,
  action,
  onClose,
}: {
  title: string;
  description: string;
  action: { label: string; onClick: () => void; pending?: boolean };
  onClose?: () => void;
}) {
  const titleId = useId();
  return createPortal(
    <aside className="notification feedback-error" aria-labelledby={titleId}>
      <CircleAlert size={20} aria-hidden="true" />
      <div className="notification-content">
        <div role="alert" aria-atomic="true">
          <h2 id={titleId}>{title}</h2>
          <p>{description}</p>
        </div>
        <Button type="button" variant="outline" disabled={action.pending} onClick={action.onClick}>
          {action.pending ? "正在加载…" : action.label}
        </Button>
      </div>
      {onClose && (
        <button className="feedback-close" type="button" aria-label="关闭通知" onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </aside>,
    document.body,
  );
}
