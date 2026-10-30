import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

export type AgentPanelId = "proactive" | "research";

type PanelLayout = { x: number; y: number; w: number; h: number };
type LayerLayout = Partial<Record<AgentPanelId, PanelLayout>>;

const STORAGE_KEY = "archimedes-agent-layer-v1";
const MIN_WIDTH = 340;
const MIN_HEIGHT = 220;
const EDGE = 12;
const DEFAULT_PROACTIVE = { w: 440, h: 300 };
const DEFAULT_RESEARCH = { w: 560, h: 220 };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampLayout(layout: PanelLayout, size: { width: number; height: number }): PanelLayout {
  const maxWidth = Math.max(MIN_WIDTH, size.width - EDGE * 2);
  const maxHeight = Math.max(MIN_HEIGHT, size.height - EDGE * 2);
  const w = clamp(layout.w, MIN_WIDTH, maxWidth);
  const h = clamp(layout.h, MIN_HEIGHT, maxHeight);
  return {
    x: clamp(layout.x, EDGE, Math.max(EDGE, size.width - w - EDGE)),
    y: clamp(layout.y, EDGE, Math.max(EDGE, size.height - h - EDGE)),
    w,
    h,
  };
}

function defaultLayout(id: AgentPanelId, size: { width: number; height: number }): PanelLayout {
  if (id === "research") {
    return clampLayout({ x: EDGE + 4, y: EDGE, ...DEFAULT_RESEARCH }, size);
  }
  return clampLayout({
    x: size.width - DEFAULT_PROACTIVE.w - 20,
    y: size.height - DEFAULT_PROACTIVE.h - 210,
    ...DEFAULT_PROACTIVE,
  }, size);
}

function readLayout(): LayerLayout {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as LayerLayout | null;
    const next: LayerLayout = {};
    for (const id of ["proactive", "research"] as const) {
      const panel = parsed?.[id];
      if (!panel) continue;
      if ([panel.x, panel.y, panel.w, panel.h].every((value) => typeof value === "number" && Number.isFinite(value))) {
        // The first floating panel shipped at 400×220, which is too tight for
        // the current type scale. Grow only the untouched default.
        if (id === "proactive" && panel.w === 400 && panel.h === 220) {
          next[id] = { x: panel.x, y: panel.y, ...DEFAULT_PROACTIVE };
          continue;
        }
        next[id] = { x: panel.x, y: panel.y, w: panel.w, h: panel.h };
      }
    }
    return next;
  } catch {
    return {};
  }
}

export default function AgentLayer({
  proactiveOpen,
  researchOpen,
  proactive,
  research,
}: {
  proactiveOpen: boolean;
  researchOpen: boolean;
  proactive: ReactNode;
  research: ReactNode;
}) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [layout, setLayout] = useState<LayerLayout>(readLayout);
  const [active, setActive] = useState<AgentPanelId>("proactive");
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const element = layerRef.current;
    if (!element) return;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (size.width <= 0 || size.height <= 0) return;
    setLayout((current) => {
      const next: LayerLayout = {};
      for (const id of ["proactive", "research"] as const) {
        next[id] = clampLayout(current[id] ?? defaultLayout(id, size), size);
      }
      return next;
    });
  }, [size.width, size.height]);

  useEffect(() => {
    if (size.width <= 0 || dragging) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {
      // Layout persistence is best-effort.
    }
  }, [dragging, layout, size.width]);

  function startDrag(event: ReactPointerEvent<HTMLDivElement>, id: AgentPanelId) {
    if (event.button !== 0) return;
    setActive(id);
    const target = event.target as HTMLElement;
    if (target.closest("button,input,textarea,select,a,[contenteditable='true']")) return;
    if (!target.closest(".agent-proactive-head, .agent-path-head")) return;
    const start = layout[id];
    if (!start) return;
    event.preventDefault();
    setDragging(true);
    const startX = event.clientX;
    const startY = event.clientY;
    const move = (moveEvent: PointerEvent) => {
      setLayout((current) => ({
        ...current,
        [id]: clampLayout({
          ...start,
          x: start.x + moveEvent.clientX - startX,
          y: start.y + moveEvent.clientY - startY,
        }, size),
      }));
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      setDragging(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  function startResize(event: ReactPointerEvent<HTMLSpanElement>, id: AgentPanelId) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const start = layout[id];
    if (!start) return;
    setActive(id);
    setDragging(true);
    const startX = event.clientX;
    const startY = event.clientY;
    const move = (moveEvent: PointerEvent) => {
      setLayout((current) => ({
        ...current,
        [id]: clampLayout({
          ...start,
          w: start.w + moveEvent.clientX - startX,
          h: start.h + moveEvent.clientY - startY,
        }, size),
      }));
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      setDragging(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>, id: AgentPanelId) {
    const target = event.target as HTMLElement;
    if (target.closest("button,input,textarea,select,a,[contenteditable='true']")) return;
    const step = event.shiftKey ? 16 : 8;
    const current = layout[id];
    if (!current) return;
    if (!event.key.startsWith("Arrow")) return;
    event.preventDefault();
    const next = { ...current };
    if (event.key === "ArrowLeft") {
      if (event.shiftKey) next.w -= step; else next.x -= step;
    } else if (event.key === "ArrowRight") {
      if (event.shiftKey) next.w += step; else next.x += step;
    } else if (event.key === "ArrowUp") {
      if (event.shiftKey) next.h -= step; else next.y -= step;
    } else if (event.key === "ArrowDown") {
      if (event.shiftKey) next.h += step; else next.y += step;
    }
    setLayout((layer) => ({ ...layer, [id]: clampLayout(next, size) }));
  }

  const ready = size.width > 0 && size.height > 0;
  const panels: Array<{ id: AgentPanelId; open: boolean; content: ReactNode; label: string }> = [
    { id: "research", open: researchOpen, content: research, label: "Research path" },
    { id: "proactive", open: proactiveOpen, content: proactive, label: "Proactive agent" },
  ];

  return <div className="agent-layer" ref={layerRef} aria-label="Floating agent panels" data-surface="agent">
    {ready && panels.filter((panel) => panel.open && layout[panel.id]).map((panel) => {
      const panelLayout = layout[panel.id]!;
      return <div
        key={panel.id}
        className={active === panel.id ? "agent-float-panel active" : "agent-float-panel"}
        style={{ left: panelLayout.x, top: panelLayout.y, width: panelLayout.w, height: panelLayout.h }}
        role="region"
        aria-label={panel.label}
        tabIndex={0}
        onPointerDown={(event) => startDrag(event, panel.id)}
        onFocus={() => setActive(panel.id)}
        onKeyDown={(event) => handleKeyDown(event, panel.id)}
      >
        {panel.content}
        <span className="agent-float-resize" onPointerDown={(event) => startResize(event, panel.id)} aria-hidden="true" />
      </div>;
    })}
  </div>;
}
