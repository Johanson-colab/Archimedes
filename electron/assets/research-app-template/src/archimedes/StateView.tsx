import type { ReactNode } from "react";

export type StateViewTone = "empty" | "loading" | "error" | "unavailable";

export function StateView({
  tone = "empty",
  icon,
  title,
  description,
  action,
  className = "",
  compact = false,
}: {
  tone?: StateViewTone;
  icon?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return <div
    className={["ui-state", `ui-state-${tone}`, compact ? "ui-state-compact" : "", className].filter(Boolean).join(" ")}
    role={tone === "error" ? "alert" : tone === "loading" ? "status" : undefined}
    aria-live={tone === "loading" ? "polite" : undefined}
    aria-busy={tone === "loading" ? true : undefined}
  >
    {icon}
    {title !== undefined && <strong className="ui-state-title">{title}</strong>}
    {description !== undefined && <span className="ui-state-description">{description}</span>}
    {action !== undefined && <div className="ui-state-action">{action}</div>}
  </div>;
}
