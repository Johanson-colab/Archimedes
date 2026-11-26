import type { ReactNode } from "react";
import { useUISettings } from "./i18n";

export default function SidebarSectionHeader({ id, title, collapsed, onToggle, className = "", actionsClassName = "", children }: {
  id: "apps" | "projects";
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  className?: string;
  actionsClassName?: string;
  children?: ReactNode;
}) {
  const { t } = useUISettings();
  const contentId = `sidebar-section-content-${id}`;
  return <div className={`sidebar-section-heading-row ${className}`}>
    <div
      role="button"
      tabIndex={0}
      className="sidebar-section-toggle"
      aria-expanded={!collapsed}
      aria-controls={contentId}
      title={`${title} · ${t("Click to expand or collapse.")}`}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onToggle();
      }}
    >
      <span>{title}</span>
    </div>
    <div className={`sidebar-section-actions ${actionsClassName}`}>
      {children}
    </div>
  </div>;
}
