import { createContext, useContext, useId, type ReactNode } from "react";

type TabsVariant = "page" | "segmented" | "editor";
type TabsOrientation = "horizontal" | "vertical";

interface TabsContextValue {
  value: string;
  onChange: (value: string) => void;
  orientation: TabsOrientation;
  idBase: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) throw new Error("Tab must be rendered inside Tabs.");
  return context;
}

export function Tabs({ value, onChange, label, variant = "page", orientation = "horizontal", className = "", children }: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  variant?: TabsVariant;
  orientation?: TabsOrientation;
  className?: string;
  children: ReactNode;
}) {
  const generatedId = useId().replaceAll(":", "");
  const idBase = `tabs-${generatedId}`;

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)')];
    if (!tabs.length) return;
    const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
    const previousKey = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
    const nextKey = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
    let nextIndex = -1;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === previousKey) nextIndex = index <= 0 ? tabs.length - 1 : index - 1;
    else if (event.key === nextKey) nextIndex = index >= tabs.length - 1 ? 0 : index + 1;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const next = tabs[nextIndex];
    next.focus();
    if (next.dataset.value) onChange(next.dataset.value);
  }

  return <TabsContext.Provider value={{ value, onChange, orientation, idBase }}>
    <div
      className={`ui-tabs ui-tabs--${variant} ui-tabs--${orientation} ${className}`.trim()}
      role="tablist"
      aria-label={label}
      aria-orientation={orientation}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  </TabsContext.Provider>;
}

export function Tab({ value, id, children, icon, badge, disabled, className = "", controls, title, draggable, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd, onContextMenu, onKeyDown, onClose, closeLabel }: {
  value: string;
  id?: string;
  children: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
  className?: string;
  controls?: string;
  title?: string;
  draggable?: boolean;
  onDragStart?: React.DragEventHandler<HTMLButtonElement>;
  onDragOver?: React.DragEventHandler<HTMLButtonElement>;
  onDragLeave?: React.DragEventHandler<HTMLButtonElement>;
  onDrop?: React.DragEventHandler<HTMLButtonElement>;
  onDragEnd?: React.DragEventHandler<HTMLButtonElement>;
  onContextMenu?: React.MouseEventHandler<HTMLButtonElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLButtonElement>;
  onClose?: () => void;
  closeLabel?: string;
}) {
  const { value: activeValue, onChange, idBase } = useTabsContext();
  const active = activeValue === value;
  const button = <button
    type="button"
    role="tab"
    id={id || `${idBase}-tab-${value}`}
    aria-selected={active}
    aria-controls={controls}
    tabIndex={active ? 0 : -1}
    data-value={value}
    className={`ui-tab${active ? " active" : ""} ${className}`.trim()}
    disabled={disabled}
    title={title}
    draggable={draggable}
    onDragStart={onDragStart}
    onDragOver={onDragOver}
    onDragLeave={onDragLeave}
    onDrop={onDrop}
    onDragEnd={onDragEnd}
    onContextMenu={onContextMenu}
    onKeyDown={onKeyDown}
    onClick={() => onChange(value)}
  >
    {icon && <span className="ui-tab-icon">{icon}</span>}
    <span className="ui-tab-label">{children}</span>
    {badge !== undefined && badge !== null && badge !== false && <i className="ui-tab-badge">{badge}</i>}
  </button>;

  if (!onClose) return <>{button}</>;
  return <div className={`ui-tab-closable${active ? " active" : ""} ${className}`.trim()} data-active={active ? "true" : "false"}>
    {button}
    <button type="button" className="ui-tab-close" onClick={(event) => { event.stopPropagation(); onClose(); }} aria-label={closeLabel || `Close ${String(children)}`} title={closeLabel || `Close ${String(children)}`}>×</button>
  </div>;
}

export function FilterGroup({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
  return <div className={`ui-filter-group ${className}`.trim()} role="group" aria-label={label}>{children}</div>;
}

export function FilterButton({ active, onClick, disabled, title, children }: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: ReactNode;
}) {
  return <button type="button" className={active ? "ui-filter-button active" : "ui-filter-button"} aria-pressed={active} disabled={disabled} title={title} onClick={onClick}>{children}</button>;
}
