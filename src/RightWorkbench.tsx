import { useEffect, type ReactNode } from "react";
import { FolderTree, ListTree, Milestone, Settings, SquareTerminal } from "lucide-react";
import { useUISettings } from "./i18n";
import TerminalPanel from "./TerminalPanel";

const WORKBENCH_MIN_WIDTH = 320;
const WORKBENCH_MAX_WIDTH = 1200;
const WORKBENCH_DEFAULT_RATIO = 0.5;
const WORKBENCH_MIN_MAIN_WIDTH = 560;

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

export type WorkbenchTab = "journey" | "trajectory" | "files" | "terminal";

type RightWorkbenchProps = {
  bridge: ResearchDeskBridge;
  open: boolean;
  theme: "charcoal" | "paper";
  workspace: string;
  width: number;
  activeTab: WorkbenchTab;
  terminalSettings: TerminalSettings | null;
  dirtyFileCount: number;
  files: ReactNode;
  journey: ReactNode;
  trajectory: ReactNode;
  onTabChange: (tab: WorkbenchTab) => void;
  onWidthChange: (width: number) => void;
  onOpenTerminalSettings: () => void;
};

export default function RightWorkbench({ bridge, open, theme, workspace, width, activeTab, terminalSettings, dirtyFileCount, files, journey, trajectory, onTabChange, onWidthChange, onOpenTerminalSettings }: RightWorkbenchProps) {
  const { t } = useUISettings();
  const closeTerminal = () => onTabChange("journey");

  useEffect(() => () => {
    document.body.classList.remove("workbench-resizing");
  }, []);

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

  return <aside className={open ? "right-workbench open" : "right-workbench"} aria-label={t("Workbench")} aria-hidden={!open} inert={!open}>
    <div className="workbench-resize-handle" role="separator" aria-orientation="vertical" aria-label={t("Resize workbench")} aria-valuemin={WORKBENCH_MIN_WIDTH} aria-valuemax={maxWorkbenchWidth()} aria-valuenow={width} tabIndex={0} onPointerDown={startResize} onDoubleClick={() => onWidthChange(defaultWorkbenchWidth())} onKeyDown={handleResizeKey}><span /></div>
    <header className="workbench-header">
      <div className="workbench-tabs" role="tablist" aria-label={t("Workbench panels")}>
        <button className={activeTab === "journey" ? "workbench-tab active" : "workbench-tab"} role="tab" aria-selected={activeTab === "journey"} onClick={() => onTabChange("journey")} title={t("Agent journey")}><Milestone size={13} /><span>Journey</span></button>
        <button className={activeTab === "trajectory" ? "workbench-tab active" : "workbench-tab"} role="tab" aria-selected={activeTab === "trajectory"} onClick={() => onTabChange("trajectory")} title={t("Agent trajectory")}><ListTree size={13} /><span>Trajectory</span></button>
        <button className={activeTab === "files" ? "workbench-tab active" : "workbench-tab"} role="tab" aria-selected={activeTab === "files"} onClick={() => onTabChange("files")} title={t("Files")}><FolderTree size={13} /><span>{t("Files")}</span>{dirtyFileCount > 0 && <i className="workbench-tab-badge" title={`${dirtyFileCount} unsaved file${dirtyFileCount === 1 ? "" : "s"}`}>{dirtyFileCount}</i>}</button>
        <button className={activeTab === "terminal" ? "workbench-tab active" : "workbench-tab"} role="tab" aria-selected={activeTab === "terminal"} onClick={() => onTabChange("terminal")} title={t("Terminal")}><SquareTerminal size={13} /><span>{t("Terminal")}</span></button>
      </div>
      {activeTab === "terminal" && <button className="workbench-action" onClick={onOpenTerminalSettings} title={t("Terminal settings")} aria-label={t("Terminal settings")}><Settings size={14} /></button>}
    </header>
    <div className="workbench-body">
      <div className="workbench-content" hidden={activeTab === "terminal"}>
        <div className="workbench-panel" role="tabpanel" aria-label={t("Agent journey")} hidden={activeTab !== "journey"}>
          {journey}
        </div>
        <div className="workbench-panel" role="tabpanel" aria-label={t("Agent trajectory")} hidden={activeTab !== "trajectory"}>
          {trajectory}
        </div>
        <div className="workbench-panel" role="tabpanel" aria-label={t("Files")} hidden={activeTab !== "files"}>
          {files}
        </div>
      </div>
      <div className="workbench-terminal-panel" hidden={activeTab !== "terminal"}>
        <TerminalPanel bridge={bridge} open={open && activeTab === "terminal"} theme={theme} workspace={workspace} settings={terminalSettings} orientation="right" onClose={closeTerminal} />
      </div>
    </div>
  </aside>;
}
