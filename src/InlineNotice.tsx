import { X } from "lucide-react";
import type { ReactNode } from "react";

export type NoticeTone = "info" | "success" | "warning" | "danger";

export function InlineNotice({
  tone = "info",
  icon,
  title,
  children,
  action,
  onDismiss,
  dismissLabel = "Dismiss",
  className = "",
}: {
  tone?: NoticeTone;
  icon?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
  className?: string;
}) {
  return <div
    className={["ui-notice", `ui-notice-${tone}`, className].filter(Boolean).join(" ")}
    role={tone === "danger" ? "alert" : "status"}
    aria-live={tone === "danger" ? "assertive" : "polite"}
  >
    {icon}
    <div className="ui-notice-copy">
      {title !== undefined && <strong>{title}</strong>}
      {children !== undefined && <span>{children}</span>}
    </div>
    {action !== undefined && <div className="ui-notice-action">{action}</div>}
    {onDismiss && <button type="button" className="ui-notice-close" onClick={onDismiss} aria-label={dismissLabel}><X size={13} /></button>}
  </div>;
}
