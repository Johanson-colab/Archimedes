import { useEffect, type ReactNode } from "react";
import { FolderTree, ListTree, Milestone, Settings, SquareTerminal } from "lucide-react";
import TerminalPanel from "./TerminalPanel";

const WORKBENCH_MIN_WIDTH = 320;
const WORKBENCH_MAX_WIDTH = 560;
const WORKBENCH_DEFAULT_WIDTH = 380;

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
      const maximum = Math.max(WORKBENCH_MIN_WIDTH, Math.min(WORKBENCH_MAX_WIDTH, window.innerWidth - 720));
      onWidthChange(Math.max(WORKBENCH_MIN_WIDTH, Math.min(maximum, startWidth + startX - pointerEvent.clientX)));
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
      onWidthChange(Math.min(WORKBENCH_MAX_WIDTH, width + 16));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      onWidthChange(Math.max(WORKBENCH_MIN_WIDTH, width - 16));
    } else if (event.key === "Home") {
      event.preventDefault();
      onWidthChange(WORKBENCH_DEFAULT_WIDTH);
    }
  }

  return <aside className={open ? "right-workbench open" : "right-workbench"} aria-label="Workbench" aria-hidden={!open} inert={!open}>
    <div className="workbench-resize-handle" role="separator" aria-orientation="vertical" aria-label="Resize workbench" aria-valuemin={WORKBENCH_MIN_WIDTH} aria-valuemax={WORKBENCH_MAX_WIDTH} aria-valuenow={width} tabIndex={0} onPointerDown={startResize} onDoubleClick={() => onWidthChange(WORKBENCH_DEFAULT_WIDTH)} onKeyDown={handleResizeKey}><span /></div>
    <header className="workbench-header">
      <div className="workbench-tabs" role="tablist" aria-label="Workbench panels">
        <button className={activeTab === "journey" ? "workbench-tab active" : "workbench-tab"} role="tab" aria-selected={activeTab === "journey"} onClick={() => onTabChange("journey")} title="Agent journey"><Milestone size={13} /><span>Journey</span></button>
        <button className={activeTab === "trajectory" ? "workbench-tab active" : "workbench-tab"} role="tab" aria-selected={activeTab === "trajectory"} onClick={() => onTabChange("trajectory")} title="Agent trajectory"><ListTree size={13} /><span>Trajectory</span></button>
        <button className={activeTab === "files" ? "workbench-tab active" : "workbench-tab"} role="tab" aria-selected={activeTab === "files"} onClick={() => onTabChange("files")} title="Files"><FolderTree size={13} /><span>Files</span>{dirtyFileCount > 0 && <i className="workbench-tab-badge" title={`${dirtyFileCount} unsaved file${dirtyFileCount === 1 ? "" : "s"}`}>{dirtyFileCount}</i>}</button>
        <button className={activeTab === "terminal" ? "workbench-tab active" : "workbench-tab"} role="tab" aria-selected={activeTab === "terminal"} onClick={() => onTabChange("terminal")} title="Terminal"><SquareTerminal size={13} /><span>Terminal</span></button>
      </div>
      {activeTab === "terminal" && <button className="workbench-action" onClick={onOpenTerminalSettings} title="Terminal settings" aria-label="Terminal settings"><Settings size={14} /></button>}
    </header>
    <div className="workbench-body">
      <div className="workbench-content" hidden={activeTab === "terminal"}>
        <div className="workbench-panel" role="tabpanel" aria-label="Agent journey" hidden={activeTab !== "journey"}>
          {journey}
        </div>
        <div className="workbench-panel" role="tabpanel" aria-label="Agent trajectory" hidden={activeTab !== "trajectory"}>
          {trajectory}
        </div>
        <div className="workbench-panel" role="tabpanel" aria-label="Files" hidden={activeTab !== "files"}>
          {files}
        </div>
      </div>
      <div className="workbench-terminal-panel" hidden={activeTab !== "terminal"}>
        <TerminalPanel bridge={bridge} open={open && activeTab === "terminal"} theme={theme} workspace={workspace} settings={terminalSettings} orientation="right" onClose={closeTerminal} />
      </div>
    </div>
  </aside>;
}
