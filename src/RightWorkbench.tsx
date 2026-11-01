import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Ellipsis } from "lucide-react";
import { useUISettings } from "./i18n";
import { Tabs, Tab } from "./Tabs";
import { MenuDivider, MenuItem, MenuLabel, MenuSurface } from "./Menu";
import {
  moveWorkbenchTab,
  moveWorkbenchTabByOffset,
  setWorkbenchTabVisibility,
  visibleWorkbenchTabs,
  workbenchTabDefinition,
  type WorkbenchTabId,
  type WorkbenchTabPreferences,
} from "./workbench-tabs";

const WORKBENCH_MIN_WIDTH = 320;
const WORKBENCH_MAX_WIDTH = 1200;
const WORKBENCH_DEFAULT_RATIO = 0.5;
const WORKBENCH_MIN_MAIN_WIDTH = 560;
const COMPACT_TABS_WIDTH = 680;

export function maxWorkbenchWidth() {
  const viewport = typeof window === "undefined" ? 1440 : window.innerWidth;
  return Math.max(WORKBENCH_MIN_WIDTH, Math.min(WORKBENCH_MAX_WIDTH, viewport - WORKBENCH_MIN_MAIN_WIDTH));
}

export function clampWorkbenchWidth(width: number) {
  return Math.min(maxWorkbenchWidth(), Math.max(WORKBENCH_MIN_WIDTH, Math.round(width)));
}

export function defaultWorkbenchWidth() {
  const viewport = typeof window === "undefined" ? 1440 : window.innerWidth;
  return clampWorkbenchWidth(viewport * WORKBENCH_DEFAULT_RATIO);
}

type RightWorkbenchProps = {
  open: boolean;
  width: number;
  activeTab: WorkbenchTabId;
  panels: Record<WorkbenchTabId, ReactNode>;
  preferences: WorkbenchTabPreferences;
  badges?: Partial<Record<WorkbenchTabId, number>>;
  onTabChange: (tab: WorkbenchTabId) => void;
  onPreferencesChange: (preferences: WorkbenchTabPreferences) => void;
  onOpenSettings: () => void;
  onWidthChange: (width: number) => void;
};

type TabMenu = { id: WorkbenchTabId; x: number; y: number };

function tabBadge(count: number | undefined) {
  if (!count || count <= 0) return null;
  return <i className="workbench-tab-badge" title={`${count} ${count === 1 ? "item" : "items"}`}>{count > 99 ? "99+" : count}</i>;
}

export default function RightWorkbench({ open, width, activeTab, panels, preferences, badges = {}, onTabChange, onPreferencesChange, onOpenSettings, onWidthChange }: RightWorkbenchProps) {
  const { t } = useUISettings();
  const visibleTabs = useMemo(() => visibleWorkbenchTabs(preferences), [preferences]);
  const hiddenTabs = useMemo(() => preferences.order.filter((id) => preferences.hidden.includes(id)), [preferences]);
  const [dragging, setDragging] = useState<WorkbenchTabId | null>(null);
  const [dropTarget, setDropTarget] = useState<WorkbenchTabId | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const [contextMenu, setContextMenu] = useState<TabMenu | null>(null);
  const [visited, setVisited] = useState<Set<WorkbenchTabId>>(() => new Set([activeTab]));

  useEffect(() => () => {
    document.body.classList.remove("workbench-resizing");
  }, []);

  useEffect(() => {
    setVisited((current) => {
      if (current.has(activeTab)) return current;
      const next = new Set(current);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  useEffect(() => {
    if (!open || visibleTabs.includes(activeTab) || !visibleTabs.length) return;
    onTabChange(visibleTabs[0]);
  }, [activeTab, onTabChange, open, visibleTabs]);

  useEffect(() => {
    if (!open) return;
    function handleShortcut(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.key.length !== 1) return;
      const index = Number(event.key) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= visibleTabs.length) return;
      event.preventDefault();
      onTabChange(visibleTabs[index]);
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [onTabChange, open, visibleTabs]);

  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const onPointerMove = (pointerEvent: PointerEvent) => {
      onWidthChange(clampWorkbenchWidth(startWidth + startX - pointerEvent.clientX));
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      document.body.classList.remove("workbench-resizing");
    };
    document.body.classList.add("workbench-resizing");
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  function handleResizeKey(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onWidthChange(clampWorkbenchWidth(width + 16));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      onWidthChange(clampWorkbenchWidth(width - 16));
    } else if (event.key === "Home") {
      event.preventDefault();
      onWidthChange(defaultWorkbenchWidth());
    }
  }

  function hideTab(id: WorkbenchTabId) {
    const next = setWorkbenchTabVisibility(preferences, id, false);
    if (next === preferences) return;
    onPreferencesChange(next);
    if (activeTab === id) onTabChange(visibleWorkbenchTabs(next)[0]);
  }

  function showTab(id: WorkbenchTabId) {
    onPreferencesChange(setWorkbenchTabVisibility(preferences, id, true));
    onTabChange(id);
    setMoreOpen(false);
  }

  function finishDrag() {
    setDragging(null);
    setDropTarget(null);
  }

  return <aside className={`${open ? "right-workbench open" : "right-workbench"}${width < COMPACT_TABS_WIDTH ? " compact-tabs" : ""}`} aria-label={t("Workbench")} aria-hidden={!open} inert={!open}>
    <div className="workbench-resize-handle" role="separator" aria-orientation="vertical" aria-label={t("Resize workbench")} aria-valuemin={WORKBENCH_MIN_WIDTH} aria-valuemax={maxWorkbenchWidth()} aria-valuenow={width} tabIndex={0} onPointerDown={startResize} onDoubleClick={() => onWidthChange(defaultWorkbenchWidth())} onKeyDown={handleResizeKey}><span /></div>
    <header className="workbench-header">
      <Tabs value={activeTab} onChange={(value) => onTabChange(value as WorkbenchTabId)} label={t("Workbench panels")} className="workbench-tabs">
        {visibleTabs.map((id) => {
          const tab = workbenchTabDefinition(id);
          const count = badges[id];
          return <Tab
            key={id}
            value={id}
            controls={`workbench-panel-${id}`}
            icon={tab.icon}
            badge={count && count > 0 ? (count > 99 ? "99+" : count) : undefined}
            className={`workbench-tab${dragging === id ? " dragging" : ""}${dropTarget === id && dragging && dragging !== id ? " drop-target" : ""}`}
            draggable
            onContextMenu={(event) => {
              event.preventDefault();
              setContextMenu({ id, x: event.clientX, y: event.clientY });
              setMoreOpen(false);
            }}
            onKeyDown={(event) => {
              if (!event.altKey || !event.shiftKey || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
              event.preventDefault();
              onPreferencesChange(moveWorkbenchTabByOffset(preferences, id, event.key === "ArrowLeft" ? -1 : 1));
            }}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", id);
              setDragging(id);
              setContextMenu(null);
              setMoreOpen(false);
            }}
            onDragOver={(event) => {
              if (!dragging || dragging === id) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setDropTarget(id);
            }}
            onDragLeave={() => setDropTarget((current) => current === id ? null : current)}
            onDrop={(event) => {
              event.preventDefault();
              if (dragging && dragging !== id) onPreferencesChange(moveWorkbenchTab(preferences, dragging, id));
              finishDrag();
            }}
            onDragEnd={finishDrag}
            title={`${t(tab.labelKey)} · ${t("Drag to reorder")}`}
          >{t(tab.labelKey)}</Tab>;
        })}
      </Tabs>
      <button
        ref={moreButtonRef}
          className="workbench-tab-more"
          onClick={() => { setMoreOpen((current) => !current); setContextMenu(null); }}
          title={t("More tabs")}
          aria-label={t("More tabs")}
          aria-haspopup="menu"
          aria-expanded={moreOpen}
      ><Ellipsis size={15} /></button>

      <MenuSurface open={moreOpen} onClose={() => setMoreOpen(false)} anchorRef={moreButtonRef} placement="bottom-end" width={260} className="workbench-menu workbench-more-menu" ariaLabel={t("Workbench tabs")}>
        {hiddenTabs.length > 0 && <>
          <MenuLabel>{t("Hidden tabs")}</MenuLabel>
          {hiddenTabs.map((id) => {
            const tab = workbenchTabDefinition(id);
            return <MenuItem key={id} onClick={() => showTab(id)}>{t(tab.labelKey)}</MenuItem>;
          })}
          <MenuDivider />
        </>}
        <MenuItem onClick={() => { setMoreOpen(false); onOpenSettings(); }}>{t("Customize tabs…")}</MenuItem>
      </MenuSurface>
    </header>

    <MenuSurface open={Boolean(contextMenu)} onClose={() => setContextMenu(null)} cursor={contextMenu ? { x: contextMenu.x, y: contextMenu.y } : null} placement="bottom-start" width={240} className="workbench-menu workbench-context-menu" ariaLabel={t("Tab options")}>
      {contextMenu && <>
        <MenuItem disabled={visibleTabs.length <= 1} onClick={() => { hideTab(contextMenu.id); setContextMenu(null); }}>{t("Hide tab")}</MenuItem>
        <MenuItem disabled={visibleTabs.indexOf(contextMenu.id) <= 0} onClick={() => { onPreferencesChange(moveWorkbenchTabByOffset(preferences, contextMenu.id, -1)); setContextMenu(null); }}>{t("Move left")}</MenuItem>
        <MenuItem disabled={visibleTabs.indexOf(contextMenu.id) >= visibleTabs.length - 1} onClick={() => { onPreferencesChange(moveWorkbenchTabByOffset(preferences, contextMenu.id, 1)); setContextMenu(null); }}>{t("Move right")}</MenuItem>
        <MenuDivider />
        <MenuItem onClick={() => { setContextMenu(null); onOpenSettings(); }}>{t("Customize tabs…")}</MenuItem>
      </>}
    </MenuSurface>

    <div className="workbench-body">
      <div className="workbench-content">
        {preferences.order.filter((id) => visited.has(id)).map((id) => {
          const tab = workbenchTabDefinition(id);
          return <div className={`workbench-panel${id === "terminal" ? " workbench-terminal-panel" : ""}`} id={`workbench-panel-${id}`} role="tabpanel" aria-label={t(tab.labelKey)} hidden={activeTab !== id} key={id}>
            {panels[id]}
          </div>;
        })}
      </div>
    </div>
  </aside>;
}
