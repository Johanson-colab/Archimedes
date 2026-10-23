import { useEffect } from "react";
import { SquareTerminal, X } from "lucide-react";
import TerminalPanel from "./TerminalPanel";

const WORKBENCH_MIN_WIDTH = 320;
const WORKBENCH_MAX_WIDTH = 560;
const WORKBENCH_DEFAULT_WIDTH = 380;

type RightWorkbenchProps = {
  bridge: ResearchDeskBridge;
  open: boolean;
  theme: "charcoal" | "paper";
  workspace: string;
  width: number;
  onWidthChange: (width: number) => void;
  onClose: () => void;
};

export default function RightWorkbench({ bridge, open, theme, workspace, width, onWidthChange, onClose }: RightWorkbenchProps) {
  useEffect(() => () => document.body.classList.remove("workbench-resizing"), []);

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
        <button className="workbench-tab active" role="tab" aria-selected="true" title="Terminal"><SquareTerminal size={14} /><span>Terminal</span></button>
      </div>
      <button className="workbench-close" onClick={onClose} title="Close workbench" aria-label="Close workbench"><X size={15} /></button>
    </header>
    <div className="workbench-body">
      <TerminalPanel bridge={bridge} open={open} theme={theme} workspace={workspace} orientation="right" onClose={onClose} />
    </div>
  </aside>;
}
