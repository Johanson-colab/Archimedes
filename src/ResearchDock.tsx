import { Fragment, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

export type DockPanelId = "research" | "proactive";

type DockLayout = {
  order: DockPanelId[];
  split: number;
};

const DOCK_LAYOUT_KEY = "archimedes-research-dock-v1";
const DEFAULT_LAYOUT: DockLayout = { order: ["research", "proactive"], split: 0.56 };
const MIN_SPLIT = 0.3;
const MAX_SPLIT = 0.72;

function clampSplit(value: number): number {
  return Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, value));
}

function readLayout(): DockLayout {
  try {
    const raw = window.localStorage.getItem(DOCK_LAYOUT_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<DockLayout>;
    const order = Array.isArray(parsed.order)
      ? parsed.order.filter((id): id is DockPanelId => id === "research" || id === "proactive")
      : DEFAULT_LAYOUT.order;
    return {
      order: order.length === 2 ? order : DEFAULT_LAYOUT.order,
      split: typeof parsed.split === "number" ? clampSplit(parsed.split) : DEFAULT_LAYOUT.split,
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

/**
 * The top dock is global. It never auto-opens: a queued suggestion only lights
 * the toolbar badge. When open, panels share one row and can be reordered or
 * resized; the layout is persisted per workspace.
 */
export default function ResearchDock({
  researchOpen,
  proactiveOpen,
  research,
  proactive,
}: {
  researchOpen: boolean;
  proactiveOpen: boolean;
  research: ReactNode;
  proactive: ReactNode;
}) {
  const [layout, setLayout] = useState<DockLayout>(readLayout);
  const [dragging, setDragging] = useState<DockPanelId | null>(null);
  const [dropTarget, setDropTarget] = useState<DockPanelId | null>(null);
  const draggingRef = useRef<DockPanelId | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const resizeRef = useRef(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(DOCK_LAYOUT_KEY, JSON.stringify(layout));
    } catch {
      // Layout persistence is best-effort.
    }
  }, [layout]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!resizeRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const split = clampSplit((event.clientX - rect.left) / rect.width);
      setLayout((current) => ({ ...current, split }));
    };
    const stop = () => {
      if (!resizeRef.current) return;
      resizeRef.current = false;
      document.body.classList.remove("research-dock-resizing");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, []);

  const openIds = layout.order.filter((id) => (id === "research" ? researchOpen : proactiveOpen));
  if (!openIds.length) return null;
  const bothOpen = openIds.length === 2;

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    resizeRef.current = true;
    document.body.classList.add("research-dock-resizing");
  };

  const reorder = (dragId: DockPanelId | null, target: DockPanelId | null) => {
    if (!dragId || !target || dragId === target) {
      setDragging(null);
      setDropTarget(null);
      draggingRef.current = null;
      return;
    }
    setLayout((current) => {
      const from = current.order.indexOf(dragId);
      const to = current.order.indexOf(target);
      const next = current.order.filter((id) => id !== dragId);
      const index = next.indexOf(target);
      next.splice(index < 0 ? next.length : to > from ? index + 1 : index, 0, dragId);
      return { ...current, order: next };
    });
    setDragging(null);
    setDropTarget(null);
    draggingRef.current = null;
  };

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>, id: DockPanelId) => {
    event.preventDefault();
    event.stopPropagation();
    draggingRef.current = id;
    setDragging(id);
    setDropTarget(null);
    const handleMove = (moveEvent: PointerEvent) => {
      const element = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest<HTMLElement>(".research-dock-panel");
      const target = element?.dataset.panel;
      setDropTarget(target === "research" || target === "proactive" ? target : null);
    };
    const handleUp = (upEvent: PointerEvent) => {
      const element = document.elementFromPoint(upEvent.clientX, upEvent.clientY)?.closest<HTMLElement>(".research-dock-panel");
      const target = element?.dataset.panel;
      reorder(draggingRef.current, target === "research" || target === "proactive" ? target : null);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
  };

  return <section
    className={`research-dock${bothOpen ? " split" : ""}`}
    aria-label="Research dock"
    ref={containerRef}
    style={{ "--dock-split": `${layout.split * 100}%` } as React.CSSProperties}
  >
    <div className="research-dock-panels">
      {openIds.map((id, index) => {
        const isResearch = id === "research";
        return <Fragment key={id}>
          {bothOpen && index === 1 && <div
            className="research-dock-divider"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize dock panels"
            onPointerDown={startResize}
            onDoubleClick={() => setLayout((current) => ({ ...current, split: DEFAULT_LAYOUT.split }))}
            title="Drag to resize · double-click to reset"
          ><span /></div>}
          <div
            className={`research-dock-panel${dropTarget === id && dragging && dragging !== id ? " drop-target" : ""}`}
            data-panel={id}
          >
            <button
              className="dock-grip"
              onPointerDown={(event) => startDrag(event, id)}
              title="Drag to reorder"
              aria-label={`Drag ${isResearch ? "Research path" : "Proactive agent"}`}
            >
              <span /><span /><span /><span /><span /><span />
            </button>
            {isResearch ? research : proactive}
          </div>
        </Fragment>;
      })}
    </div>
  </section>;
}
