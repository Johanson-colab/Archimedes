import { Fragment, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Ellipsis } from "lucide-react";
import { useUISettings } from "./i18n";
import { Tabs, Tab } from "./Tabs";
import { MenuDivider, MenuItem, MenuLabel, MenuSurface } from "./Menu";
import {
  MAX_WORKBENCH_PANES,
  MIN_WORKBENCH_PANE_PERCENT,
  closeWorkbenchPane,
  focusWorkbenchPane,
  focusedWorkbenchPane,
  moveWorkbenchPaneTab,
  moveWorkbenchTabByPaneOffset,
  moveWorkbenchTabToPane,
  resizeWorkbenchPanes,
  setWorkbenchTabVisibility,
  showWorkbenchTab,
  splitWorkbenchTab,
  workbenchTabDefinition,
  type WorkbenchDropPlacement,
  type WorkbenchPane,
  type WorkbenchPaneOrientation,
  type WorkbenchTabId,
  type WorkbenchTabPreferences,
} from "./workbench-tabs";

const WORKBENCH_MIN_WIDTH = 320;
const WORKBENCH_MAX_WIDTH = 1200;
const WORKBENCH_DEFAULT_RATIO = 0.5;
const WORKBENCH_MIN_MAIN_WIDTH = 560;
const COMPACT_TABS_WIDTH = 680;
/** A pane needs roughly this much width before tab labels stop fitting. */
const PANE_COMPACT_TABS_WIDTH = 460;
/** Splitting horizontally widens the workbench so each pane keeps a usable width. */
const SPLIT_ROW_MIN_WIDTH = 900;
/** A side-by-side split may not shrink below this, or the tabs stop fitting. */
const SPLIT_ROW_MIN_WORKBENCH_WIDTH = 640;
const PANE_DIVIDER_WIDTH = 7;
const EDGE_DROP_RATIO = 0.24;
/** Tall panes would otherwise turn half the body into a top/bottom split zone. */
const EDGE_DROP_MAX_PIXELS = 110;

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

/** Side-by-side panes need more room than a single pane before the tabs collapse. */
function clampWorkbenchWidthForLayout(width: number, panes: number, orientation: WorkbenchPaneOrientation) {
  const min = panes > 1 && orientation === "row" ? Math.min(SPLIT_ROW_MIN_WORKBENCH_WIDTH, maxWorkbenchWidth()) : WORKBENCH_MIN_WIDTH;
  return Math.min(maxWorkbenchWidth(), Math.max(min, Math.round(width)));
}

type RightWorkbenchProps = {
  open: boolean;
  width: number;
  preferences: WorkbenchTabPreferences;
  panels: Record<WorkbenchTabId, ReactNode>;
  badges?: Partial<Record<WorkbenchTabId, number>>;
  onTabChange: (tab: WorkbenchTabId) => void;
  onPreferencesChange: (preferences: WorkbenchTabPreferences) => void;
  onOpenSettings: () => void;
  onWidthChange: (width: number) => void;
};

type DragTab = { tab: WorkbenchTabId; fromPane: string };
type DropZone = "tabs" | "center" | "left" | "right" | "top" | "bottom";
type DropState = { paneId: string; zone: DropZone; target?: WorkbenchTabId; after?: boolean };
type TabMenu = { paneId: string; tab: WorkbenchTabId; x: number; y: number };

function edgeDropZone(rect: DOMRect, x: number, y: number, allowSplit: boolean): DropZone {
  if (!allowSplit) return "center";
  const horizontalDistance = Math.min(x - rect.left, rect.right - x);
  const verticalDistance = Math.min(y - rect.top, rect.bottom - y);
  const horizontalEdge = Math.min(EDGE_DROP_MAX_PIXELS, rect.width * EDGE_DROP_RATIO);
  const verticalEdge = Math.min(EDGE_DROP_MAX_PIXELS, rect.height * EDGE_DROP_RATIO);
  if (horizontalDistance > horizontalEdge && verticalDistance > verticalEdge) return "center";
  const horizontalRatio = horizontalDistance / Math.max(1, rect.width);
  const verticalRatio = verticalDistance / Math.max(1, rect.height);
  if (horizontalRatio < verticalRatio) return x < rect.left + rect.width / 2 ? "left" : "right";
  return y < rect.top + rect.height / 2 ? "top" : "bottom";
}

function zoneOrientation(zone: DropZone): WorkbenchPaneOrientation {
  return zone === "left" || zone === "right" ? "row" : "column";
}

function zonePlacement(zone: DropZone): WorkbenchDropPlacement {
  return zone === "left" || zone === "top" ? "before" : "after";
}

type WorkbenchPaneViewProps = {
  pane: WorkbenchPane;
  focused: boolean;
  preferences: WorkbenchTabPreferences;
  panels: Record<WorkbenchTabId, ReactNode>;
  badges: Partial<Record<WorkbenchTabId, number>>;
  drag: DragTab | null;
  drop: DropState | null;
  canSplit: boolean;
  paneCount: number;
  onFocus: () => void;
  onTabChange: (tab: WorkbenchTabId) => void;
  onTabMoveByOffset: (tab: WorkbenchTabId, offset: -1 | 1) => void;
  onTabMenu: (event: React.MouseEvent<HTMLButtonElement>, tab: WorkbenchTabId) => void;
  onShowTab: (tab: WorkbenchTabId) => void;
  onSplitActive: (orientation: WorkbenchPaneOrientation) => void;
  onClosePane: () => void;
  onOpenSettings: () => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>, tab: WorkbenchTabId) => void;
  onDragEnd: () => void;
  onTabDragOver: (event: DragEvent<HTMLButtonElement>, tab: WorkbenchTabId) => void;
  onTabDrop: (event: DragEvent<HTMLButtonElement>, tab: WorkbenchTabId) => void;
  onPaneDragOver: (event: DragEvent<HTMLElement>) => void;
  onPaneDragLeave: (event: DragEvent<HTMLElement>) => void;
  onPaneDrop: (event: DragEvent<HTMLElement>) => void;
};

function WorkbenchPaneView({
  pane,
  focused,
  preferences,
  panels,
  badges,
  drag,
  drop,
  canSplit,
  paneCount,
  onFocus,
  onTabChange,
  onTabMoveByOffset,
  onTabMenu,
  onShowTab,
  onSplitActive,
  onClosePane,
  onOpenSettings,
  onDragStart,
  onDragEnd,
  onTabDragOver,
  onTabDrop,
  onPaneDragOver,
  onPaneDragLeave,
  onPaneDrop,
}: WorkbenchPaneViewProps) {
  const { t } = useUISettings();
  const [paneWidth, setPaneWidth] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const paneRef = useRef<HTMLElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const hiddenTabs = useMemo(() => preferences.order.filter((id) => preferences.hidden.includes(id)), [preferences.hidden, preferences.order]);
  const compact = paneWidth > 0 && paneWidth < PANE_COMPACT_TABS_WIDTH;

  useEffect(() => {
    const node = paneRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      setPaneWidth(entries[0]?.contentRect.width ?? node.clientWidth);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return <section
    ref={paneRef}
    className={`workbench-pane${focused ? " focused" : ""}${compact ? " compact-tabs" : ""}${drop?.paneId === pane.id && drop.zone === "center" ? " drop-into" : ""}`}
    aria-label={t("Workbench pane")}
    onPointerDownCapture={() => { if (!focused) onFocus(); }}
    onDragOver={onPaneDragOver}
    onDragLeave={onPaneDragLeave}
    onDrop={onPaneDrop}
  >
    <header className="workbench-header">
      <Tabs value={pane.active} onChange={(value) => onTabChange(value as WorkbenchTabId)} label={t("Workbench panels")} className="workbench-tabs">
        {pane.tabs.map((id) => {
          const tab = workbenchTabDefinition(id);
          const count = badges[id];
          const isDragging = drag?.fromPane === pane.id && drag.tab === id;
          const isDropTarget = drop?.paneId === pane.id && drop.zone === "tabs" && drop.target === id;
          return <Tab
            key={id}
            value={id}
            controls={`workbench-panel-${pane.id}-${id}`}
            icon={tab.icon}
            badge={count && count > 0 ? (count > 99 ? "99+" : count) : undefined}
            className={`workbench-tab${isDragging ? " dragging" : ""}${isDropTarget ? " drop-target" : ""}${isDropTarget && drop?.after ? " drop-after" : ""}`}
            draggable
            onContextMenu={(event) => {
              event.preventDefault();
              onTabMenu(event, id);
              setMoreOpen(false);
            }}
            onKeyDown={(event) => {
              if (!event.altKey || !event.shiftKey || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
              event.preventDefault();
              onTabMoveByOffset(id, event.key === "ArrowLeft" ? -1 : 1);
            }}
            onDragStart={(event) => onDragStart(event, id)}
            onDragOver={(event) => onTabDragOver(event, id)}
            onDrop={(event) => onTabDrop(event, id)}
            onDragEnd={onDragEnd}
            title={`${t(tab.labelKey)} · ${t("Drag to reorder")}`}
          >{t(tab.labelKey)}</Tab>;
        })}
      </Tabs>
      {focused && <button
        ref={moreButtonRef}
        className="workbench-tab-more"
        onClick={() => setMoreOpen((current) => !current)}
        title={t("More tabs")}
        aria-label={t("More tabs")}
        aria-haspopup="menu"
        aria-expanded={moreOpen}
      ><Ellipsis size={15} /></button>}

      <MenuSurface open={moreOpen} onClose={() => setMoreOpen(false)} anchorRef={moreButtonRef} placement="bottom-end" width={260} className="workbench-menu workbench-more-menu" ariaLabel={t("Workbench tabs")}>
        {hiddenTabs.length > 0 && <>
          <MenuLabel>{t("Hidden tabs")}</MenuLabel>
          {hiddenTabs.map((id) => {
            const tab = workbenchTabDefinition(id);
            return <MenuItem key={id} onClick={() => { setMoreOpen(false); onShowTab(id); }}>{t(tab.labelKey)}</MenuItem>;
          })}
          <MenuDivider />
        </>}
        <MenuItem disabled={!canSplit || pane.tabs.length <= 1} onClick={() => { setMoreOpen(false); onSplitActive("row"); }}>{t("Split right")}</MenuItem>
        <MenuItem disabled={!canSplit || pane.tabs.length <= 1} onClick={() => { setMoreOpen(false); onSplitActive("column"); }}>{t("Split down")}</MenuItem>
        {paneCount > 1 ? <MenuItem onClick={() => { setMoreOpen(false); onClosePane(); }}>{t("Close pane")}</MenuItem> : null}
        <MenuDivider />
        <MenuItem onClick={() => { setMoreOpen(false); onOpenSettings(); }}>{t("Customize tabs…")}</MenuItem>
      </MenuSurface>
    </header>

    <div className="workbench-body">
      <div className="workbench-content">
        {pane.tabs.map((id) => {
          const tab = workbenchTabDefinition(id);
          return <div
            className={`workbench-panel${id === "terminal" ? " workbench-terminal-panel" : ""}`}
            id={`workbench-panel-${pane.id}-${id}`}
            role="tabpanel"
            aria-label={t(tab.labelKey)}
            hidden={pane.active !== id}
            key={id}
          >
            {panels[id]}
          </div>;
        })}
      </div>
    </div>

    {drop?.paneId === pane.id && drop.zone !== "tabs" && drop.zone !== "center" ? <div className={`workbench-drop-preview ${drop.zone}`} aria-hidden="true" /> : null}
  </section>;
}

export default function RightWorkbench({ open, width, preferences, panels, badges = {}, onTabChange, onPreferencesChange, onOpenSettings, onWidthChange }: RightWorkbenchProps) {
  const { t } = useUISettings();
  const layout = preferences.layout;
  const panes = layout.panes;
  const focused = focusedWorkbenchPane(layout);
  const [drag, setDrag] = useState<DragTab | null>(null);
  const [drop, setDrop] = useState<DropState | null>(null);
  const [contextMenu, setContextMenu] = useState<TabMenu | null>(null);
  const [liveSizes, setLiveSizes] = useState<number[] | null>(null);
  const panesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => {
    document.body.classList.remove("workbench-resizing", "workbench-panes-resizing-row", "workbench-panes-resizing-column");
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleShortcut(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.key.length !== 1) return;
      const index = Number(event.key) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= focused.tabs.length) return;
      event.preventDefault();
      onTabChange(focused.tabs[index]);
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [focused, onTabChange, open]);

  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const onPointerMove = (pointerEvent: PointerEvent) => {
      onWidthChange(clampWorkbenchWidthForLayout(startWidth + startX - pointerEvent.clientX, panes.length, layout.orientation));
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
      onWidthChange(clampWorkbenchWidthForLayout(width + 16, panes.length, layout.orientation));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      onWidthChange(clampWorkbenchWidthForLayout(width - 16, panes.length, layout.orientation));
    } else if (event.key === "Home") {
      event.preventDefault();
      onWidthChange(defaultWorkbenchWidth());
    }
  }

  function hideTab(id: WorkbenchTabId) {
    const next = setWorkbenchTabVisibility(preferences, id, false);
    if (next !== preferences) onPreferencesChange(next);
  }

  function focusPane(paneId: string) {
    if (preferences.layout.focused === paneId) return;
    onPreferencesChange(focusWorkbenchPane(preferences, paneId));
  }

  function finishDrag() {
    setDrag(null);
    setDrop(null);
  }

  function applyDrop(zone: DropZone, paneId: string, current: DragTab) {
    if (zone === "tabs" || zone === "center") {
      if (current.fromPane !== paneId) onPreferencesChange(moveWorkbenchTabToPane(preferences, current.tab, paneId));
      else onTabChange(current.tab);
      return;
    }
    const orientation = zoneOrientation(zone);
    const next = splitWorkbenchTab(preferences, current.tab, paneId, zonePlacement(zone), orientation);
    if (next === preferences) return;
    onPreferencesChange(next);
    if (orientation === "row") onWidthChange(clampWorkbenchWidthForLayout(Math.max(width, SPLIT_ROW_MIN_WIDTH), 2, "row"));
  }

  function startDrag(event: DragEvent<HTMLButtonElement>, paneId: string, tab: WorkbenchTabId) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", tab);
    setDrag({ tab, fromPane: paneId });
    setDrop(null);
    setContextMenu(null);
  }

  function tabDragOver(event: DragEvent<HTMLButtonElement>, paneId: string, target: WorkbenchTabId) {
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const after = event.clientX > rect.left + rect.width / 2;
    setDrop({ paneId, zone: "tabs", target, after });
  }

  function tabDrop(event: DragEvent<HTMLButtonElement>, paneId: string, target: WorkbenchTabId) {
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const after = event.clientX > rect.left + rect.width / 2;
    if (drag.fromPane === paneId) {
      onPreferencesChange(moveWorkbenchPaneTab(preferences, paneId, drag.tab, target));
    } else {
      const pane = preferences.layout.panes.find((entry) => entry.id === paneId);
      const index = pane ? pane.tabs.indexOf(target) : -1;
      const before = pane && after ? pane.tabs[index + 1] : target;
      onPreferencesChange(moveWorkbenchTabToPane(preferences, drag.tab, paneId, before));
    }
    finishDrag();
  }

  function paneDragOver(event: DragEvent<HTMLElement>, paneId: string) {
    if (!drag) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const zone = edgeDropZone(rect, event.clientX, event.clientY, preferences.layout.panes.length < MAX_WORKBENCH_PANES);
    setDrop((current) => current?.paneId === paneId && current.zone === zone ? current : { paneId, zone });
  }

  function paneDragLeave(event: DragEvent<HTMLElement>, paneId: string) {
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    setDrop((current) => current?.paneId === paneId ? null : current);
  }

  function paneDrop(event: DragEvent<HTMLElement>, paneId: string) {
    if (!drag) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const zone = edgeDropZone(rect, event.clientX, event.clientY, preferences.layout.panes.length < MAX_WORKBENCH_PANES);
    applyDrop(zone, paneId, drag);
    finishDrag();
  }

  function startPaneResize(event: React.PointerEvent<HTMLDivElement>, index: number) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const container = panesRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const horizontal = preferences.layout.orientation === "row";
    const total = Math.max(1, (horizontal ? rect.width : rect.height) - PANE_DIVIDER_WIDTH);
    const start = preferences.layout.panes.map((pane) => pane.size);
    let latest = start.slice();
    const onPointerMove = (pointerEvent: PointerEvent) => {
      const position = (horizontal ? pointerEvent.clientX - rect.left : pointerEvent.clientY - rect.top) - PANE_DIVIDER_WIDTH / 2;
      const pair = start[index] + start[index + 1];
      const next = Math.min(pair - MIN_WORKBENCH_PANE_PERCENT, Math.max(MIN_WORKBENCH_PANE_PERCENT, (position / total) * 100));
      latest = start.map((size, paneIndex) => paneIndex === index ? next : paneIndex === index + 1 ? pair - next : size);
      setLiveSizes(latest);
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      document.body.classList.remove("workbench-panes-resizing-row", "workbench-panes-resizing-column");
      setLiveSizes(null);
      if (latest.some((size, paneIndex) => Math.abs(size - start[paneIndex]) > 0.1)) {
        onPreferencesChange(resizeWorkbenchPanes(preferences, latest));
      }
    };
    document.body.classList.add(horizontal ? "workbench-panes-resizing-row" : "workbench-panes-resizing-column");
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  function resetPaneSizes() {
    onPreferencesChange(resizeWorkbenchPanes(preferences, preferences.layout.panes.map(() => 100 / preferences.layout.panes.length)));
  }

  function handlePaneResizeKey(event: React.KeyboardEvent<HTMLDivElement>, index: number) {
    const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -4
      : event.key === "ArrowRight" || event.key === "ArrowDown" ? 4
        : 0;
    if (!delta) {
      if (event.key === "Home") resetPaneSizes();
      return;
    }
    event.preventDefault();
    const sizes = preferences.layout.panes.map((pane) => pane.size);
    const pair = sizes[index] + sizes[index + 1];
    const next = Math.min(pair - MIN_WORKBENCH_PANE_PERCENT, Math.max(MIN_WORKBENCH_PANE_PERCENT, sizes[index] + delta));
    sizes[index] = next;
    sizes[index + 1] = pair - next;
    onPreferencesChange(resizeWorkbenchPanes(preferences, sizes));
  }

  function splitFromMenu(paneId: string, tab: WorkbenchTabId, orientation: WorkbenchPaneOrientation) {
    const next = splitWorkbenchTab(preferences, tab, paneId, "after", orientation);
    if (next === preferences) return;
    onPreferencesChange(next);
    if (orientation === "row") onWidthChange(clampWorkbenchWidthForLayout(Math.max(width, SPLIT_ROW_MIN_WIDTH), 2, "row"));
  }

  function moveToOtherPane(paneId: string, tab: WorkbenchTabId) {
    const other = preferences.layout.panes.find((pane) => pane.id !== paneId);
    if (other) onPreferencesChange(moveWorkbenchTabToPane(preferences, tab, other.id));
  }

  function toggleOrientation() {
    const orientation = preferences.layout.orientation === "row" ? "column" : "row";
    onPreferencesChange({
      ...preferences,
      layout: { ...preferences.layout, orientation },
    });
    if (orientation === "row" && preferences.layout.panes.length > 1) {
      onWidthChange(clampWorkbenchWidthForLayout(Math.max(width, SPLIT_ROW_MIN_WIDTH), 2, "row"));
    }
  }

  const sizes = liveSizes ?? panes.map((pane) => pane.size);
  const template = sizes.length > 1
    ? sizes.map((size) => `minmax(0, ${size}fr)`).join(` ${PANE_DIVIDER_WIDTH}px `)
    : "minmax(0, 1fr)";
  const gridStyle = preferences.layout.orientation === "row"
    ? { gridTemplateColumns: template }
    : { gridTemplateRows: template };
  const menuPane = contextMenu ? preferences.layout.panes.find((pane) => pane.id === contextMenu.paneId) : undefined;
  const canSplit = preferences.layout.panes.length < MAX_WORKBENCH_PANES;

  return <aside className={`${open ? "right-workbench open" : "right-workbench"}${width < COMPACT_TABS_WIDTH ? " compact-tabs" : ""}`} aria-label={t("Workbench")} aria-hidden={!open} inert={!open}>
    <div className="workbench-resize-handle" role="separator" aria-orientation="vertical" aria-label={t("Resize workbench")} aria-valuemin={panes.length > 1 && layout.orientation === "row" ? Math.min(SPLIT_ROW_MIN_WORKBENCH_WIDTH, maxWorkbenchWidth()) : WORKBENCH_MIN_WIDTH} aria-valuemax={maxWorkbenchWidth()} aria-valuenow={width} tabIndex={0} onPointerDown={startResize} onDoubleClick={() => onWidthChange(defaultWorkbenchWidth())} onKeyDown={handleResizeKey}><span /></div>

    <div ref={panesRef} className={`workbench-panes ${preferences.layout.orientation}`} style={gridStyle}>
      {panes.map((pane, index) => <Fragment key={pane.id}>
        {index > 0 && <div
          className="workbench-pane-divider"
          role="separator"
          aria-orientation={preferences.layout.orientation === "row" ? "vertical" : "horizontal"}
          aria-label={t("Resize panes")}
          aria-valuemin={MIN_WORKBENCH_PANE_PERCENT}
          aria-valuemax={100 - MIN_WORKBENCH_PANE_PERCENT}
          aria-valuenow={Math.round(sizes[index - 1] ?? 50)}
          tabIndex={0}
          onPointerDown={(event) => startPaneResize(event, index - 1)}
          onDoubleClick={resetPaneSizes}
          onKeyDown={(event) => handlePaneResizeKey(event, index - 1)}
        ><span /></div>}
        <WorkbenchPaneView
          pane={pane}
          focused={pane.id === preferences.layout.focused}
          preferences={preferences}
          panels={panels}
          badges={badges}
          drag={drag}
          drop={drop}
          canSplit={canSplit}
          paneCount={preferences.layout.panes.length}
          onFocus={() => focusPane(pane.id)}
          onSplitActive={(orientation) => splitFromMenu(pane.id, pane.active, orientation)}
          onClosePane={() => onPreferencesChange(closeWorkbenchPane(preferences, pane.id))}
          onTabChange={(tab) => onTabChange(tab)}
          onTabMoveByOffset={(tab, offset) => onPreferencesChange(moveWorkbenchTabByPaneOffset(preferences, pane.id, tab, offset))}
          onTabMenu={(event, tab) => setContextMenu({ paneId: pane.id, tab, x: event.clientX, y: event.clientY })}
          onShowTab={(tab) => onPreferencesChange(showWorkbenchTab(preferences, tab, pane.id))}
          onOpenSettings={onOpenSettings}
          onDragStart={(event, tab) => startDrag(event, pane.id, tab)}
          onDragEnd={finishDrag}
          onTabDragOver={(event, tab) => tabDragOver(event, pane.id, tab)}
          onTabDrop={(event, tab) => tabDrop(event, pane.id, tab)}
          onPaneDragOver={(event) => paneDragOver(event, pane.id)}
          onPaneDragLeave={(event) => paneDragLeave(event, pane.id)}
          onPaneDrop={(event) => paneDrop(event, pane.id)}
        />
      </Fragment>)}
    </div>

    <MenuSurface open={Boolean(contextMenu)} onClose={() => setContextMenu(null)} cursor={contextMenu ? { x: contextMenu.x, y: contextMenu.y } : null} placement="bottom-start" width={250} className="workbench-menu workbench-context-menu" ariaLabel={t("Tab options")}>
      {contextMenu && <>
        <MenuItem disabled={preferences.order.filter((id) => !preferences.hidden.includes(id)).length <= 1} onClick={() => { hideTab(contextMenu.tab); setContextMenu(null); }}>{t("Hide tab")}</MenuItem>
        <MenuItem disabled={(menuPane?.tabs.indexOf(contextMenu.tab) ?? 0) <= 0} onClick={() => { onPreferencesChange(moveWorkbenchTabByPaneOffset(preferences, contextMenu.paneId, contextMenu.tab, -1)); setContextMenu(null); }}>{t("Move left")}</MenuItem>
        <MenuItem disabled={(menuPane?.tabs.indexOf(contextMenu.tab) ?? 0) >= (menuPane?.tabs.length ?? 1) - 1} onClick={() => { onPreferencesChange(moveWorkbenchTabByPaneOffset(preferences, contextMenu.paneId, contextMenu.tab, 1)); setContextMenu(null); }}>{t("Move right")}</MenuItem>
        {preferences.layout.panes.length > 1 ? <MenuItem onClick={() => { moveToOtherPane(contextMenu.paneId, contextMenu.tab); setContextMenu(null); }}>{t("Move to other pane")}</MenuItem> : null}
        <MenuDivider />
        <MenuItem disabled={!canSplit || (menuPane?.tabs.length ?? 0) <= 1} onClick={() => { splitFromMenu(contextMenu.paneId, contextMenu.tab, "row"); setContextMenu(null); }}>{t("Split right")}</MenuItem>
        <MenuItem disabled={!canSplit || (menuPane?.tabs.length ?? 0) <= 1} onClick={() => { splitFromMenu(contextMenu.paneId, contextMenu.tab, "column"); setContextMenu(null); }}>{t("Split down")}</MenuItem>
        {preferences.layout.panes.length > 1 ? <MenuItem onClick={() => { toggleOrientation(); setContextMenu(null); }}>{preferences.layout.orientation === "row" ? t("Stacked") : t("Side by side")}</MenuItem> : null}
        {preferences.layout.panes.length > 1 ? <MenuItem onClick={() => { onPreferencesChange(closeWorkbenchPane(preferences, contextMenu.paneId)); setContextMenu(null); }}>{t("Close pane")}</MenuItem> : null}
        <MenuDivider />
        <MenuItem onClick={() => { setContextMenu(null); onOpenSettings(); }}>{t("Customize tabs…")}</MenuItem>
      </>}
    </MenuSurface>
  </aside>;
}
