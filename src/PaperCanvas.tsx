import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import * as Y from "yjs";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Download,
  FileJson,
  FileText,
  Frame,
  Hand,
  Image as ImageIcon,
  LoaderCircle,
  Lock,
  Maximize2,
  MoreHorizontal,
  MousePointer2,
  PenLine,
  Quote,
  Redo2,
  Square,
  StickyNote,
  Trash2,
  Type,
  Undo2,
  Users,
  X,
  ZoomIn,
  ZoomOut,
  AlertTriangle,
} from "lucide-react";
import { MenuItem, MenuDivider, MenuSurface } from "./Menu";
import { useUISettings } from "./i18n";

export type PaperCanvasVisibility = "private" | "project";
export type PaperCanvasTool = "select" | "hand" | "pen" | "text" | "sticky" | "shape" | "arrow";
export type PaperCanvasShape = "rectangle" | "ellipse";
export type PaperCanvasSource = { page: number; quote?: string; highlightId?: string; caption?: string };

type CanvasElementType = "text" | "sticky" | "quote" | "figure" | "page" | "shape" | "arrow" | "ink" | "frame";

type CanvasPoint = { x: number; y: number };
type CanvasImage = { dataUrl: string; mimeType?: string; width?: number; height?: number };

type CanvasStyle = {
  color?: string;
  fill?: string;
  strokeWidth?: number;
  fontSize?: number;
  shape?: PaperCanvasShape;
};

export type PaperCanvasElement = {
  id: string;
  type: CanvasElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  style: CanvasStyle;
  text?: string;
  points?: CanvasPoint[];
  image?: CanvasImage;
  source?: PaperCanvasSource;
  createdAt: number;
  updatedAt: number;
};

export type PaperCanvasDocument = {
  version: 1;
  title: string;
  visibility: PaperCanvasVisibility;
  elements: PaperCanvasElement[];
  viewport: { x: number; y: number; zoom: number };
  updatedAt: number;
};

export type PaperCanvasInsert =
  | { nonce: number; type: "quote"; page: number; quote: string; highlightId?: string; caption?: string }
  | { nonce: number; type: "figure"; page: number; image: ContextImage; caption?: string }
  | { nonce: number; type: "page"; page: number; image?: ContextImage };

type PaperCanvasProps = {
  bridge: ResearchDeskBridge;
  workspace: string;
  projectId?: string | null;
  paperId: string;
  paperTitle: string;
  currentPage: number;
  active: boolean;
  insertRequest?: PaperCanvasInsert | null;
  onInsertHandled?: (nonce: number) => void;
  onOpenSource: (source: PaperCanvasSource) => void;
};

type SaveState = "loading" | "saving" | "saved" | "error";
type Interaction =
  | {
      mode: "move" | "resize";
      pointerId: number;
      startX: number;
      startY: number;
      elementId: string;
      originX: number;
      originY: number;
      originWidth: number;
      originHeight: number;
      before: PaperCanvasDocument;
      moved: boolean;
    }
  | {
      mode: "pan";
      pointerId: number;
      startX: number;
      startY: number;
      originViewport: PaperCanvasDocument["viewport"];
      before: PaperCanvasDocument;
      moved: boolean;
    }
  | {
      mode: "draw" | "arrow";
      pointerId: number;
      startWorld: CanvasPoint;
      before: PaperCanvasDocument;
      moved: boolean;
    };

const CANVAS_VERSION = 1;
const HISTORY_LIMIT = 50;
const STICKY_TONES = ["#f1e3a7", "#f0d4ca", "#d5e4d7", "#d5dfeb"];
const INK_COLOR = "#b46636";
const TOOL_SHORTCUTS: Record<string, PaperCanvasTool> = {
  v: "select",
  h: "hand",
  p: "pen",
  t: "text",
  s: "sticky",
  r: "shape",
  a: "arrow",
};

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function emptyDocument(title: string): PaperCanvasDocument {
  return {
    version: CANVAS_VERSION,
    title: title ? `${title} map` : "Paper canvas",
    visibility: "private",
    elements: [],
    viewport: { x: 72, y: 72, zoom: 1 },
    updatedAt: Date.now(),
  };
}

function storageKey(workspace: string, projectId: string | null | undefined, paperId: string) {
  return `archimedes.paper-canvas.v1:${encodeURIComponent(workspace || "local")}:${encodeURIComponent(projectId || "local")}:${encodeURIComponent(paperId)}`;
}

function projectDocumentKey(paperId: string) {
  return `canvas:paper:${paperId}`;
}

function normalizeDocument(value: unknown, fallbackTitle: string): PaperCanvasDocument | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PaperCanvasDocument>;
  if (!Array.isArray(candidate.elements)) return null;
  const elements = candidate.elements.filter((element): element is PaperCanvasElement => Boolean(element && typeof element === "object" && typeof (element as PaperCanvasElement).id === "string" && typeof (element as PaperCanvasElement).type === "string"));
  const viewport = candidate.viewport && typeof candidate.viewport === "object"
    ? {
        x: Number.isFinite(candidate.viewport.x) ? candidate.viewport.x : 72,
        y: Number.isFinite(candidate.viewport.y) ? candidate.viewport.y : 72,
        zoom: Math.min(2.6, Math.max(.25, Number.isFinite(candidate.viewport.zoom) ? candidate.viewport.zoom : 1)),
      }
    : { x: 72, y: 72, zoom: 1 };
  return {
    version: CANVAS_VERSION,
    title: typeof candidate.title === "string" ? candidate.title : `${fallbackTitle} map`,
    visibility: candidate.visibility === "project" ? "project" : "private",
    elements,
    viewport,
    updatedAt: Number.isFinite(candidate.updatedAt) ? Number(candidate.updatedAt) : Date.now(),
  };
}

function parseDocument(value: string | null, fallbackTitle: string) {
  if (!value) return null;
  try { return normalizeDocument(JSON.parse(value), fallbackTitle); }
  catch { return null; }
}

function decodeState(value: string | undefined) {
  if (!value) return new Uint8Array();
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeState(value: Uint8Array) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function readProjectDocument(record: SharedDocument | null) {
  if (!record?.state) return null;
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, decodeState(record.state));
    const text = doc.getText("canvas").toString();
    if (!text) return null;
    return normalizeDocument(JSON.parse(text), "Paper canvas");
  } catch {
    return null;
  } finally {
    doc.destroy();
  }
}

function elementLabel(element: PaperCanvasElement) {
  const text = String(element.text || "").replace(/\s+/g, " ").trim();
  if (text) return text.slice(0, 92);
  if (element.type === "figure") return "Figure from paper";
  if (element.type === "page") return `Page ${element.source?.page ?? ""}`.trim();
  if (element.type === "shape") return element.style.shape === "ellipse" ? "Ellipse" : "Rectangle";
  if (element.type === "arrow") return "Arrow";
  if (element.type === "ink") return "Ink";
  if (element.type === "frame") return "Frame";
  return "Canvas item";
}

function cardHeight(text: string) {
  return Math.min(244, Math.max(124, 92 + Math.ceil(text.length / 42) * 18));
}

function imageSize(image: CanvasImage) {
  const maxWidth = 340;
  const ratio = image.width && image.height ? image.width / image.height : 4 / 3;
  const width = Math.min(maxWidth, Math.max(190, image.width || 300));
  return { width, height: Math.min(300, Math.max(150, Math.round(width / ratio))) };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function safeFilename(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "paper-canvas";
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (context.measureText(candidate).width <= maxWidth) line = candidate;
      else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export default function PaperCanvas({ bridge, workspace, projectId, paperId, paperTitle, currentPage, active, insertRequest, onInsertHandled, onOpenSource }: PaperCanvasProps) {
  const { t } = useUISettings();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const visibilityButtonRef = useRef<HTMLButtonElement>(null);
  const docRef = useRef<PaperCanvasDocument>(emptyDocument(paperTitle));
  const undoRef = useRef<PaperCanvasDocument[]>([]);
  const redoRef = useRef<PaperCanvasDocument[]>([]);
  const interactionRef = useRef<Interaction | null>(null);
  const projectDocRef = useRef<Y.Doc | null>(null);
  const saveSequenceRef = useRef(0);
  const projectSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const handledInsertRef = useRef<number | null>(null);
  const [doc, setDoc] = useState<PaperCanvasDocument>(() => emptyDocument(paperTitle));
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [saveError, setSaveError] = useState("");
  const [tool, setTool] = useState<PaperCanvasTool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [previewPoints, setPreviewPoints] = useState<CanvasPoint[] | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [outlineOpen, setOutlineOpen] = useState(false);

  const localKey = storageKey(workspace, projectId, paperId);
  const sharedKey = projectDocumentKey(paperId);
  const selectedElement = doc.elements.find((element) => element.id === selectedId) ?? null;
  const visibility = doc.visibility;
  const canShareProject = Boolean(projectId) && typeof bridge.getSharedDocument === "function" && typeof bridge.applySharedDocumentUpdate === "function";
  const sortedElements = useMemo(() => [...doc.elements].sort((left, right) => left.z - right.z), [doc.elements]);

  useEffect(() => { docRef.current = doc; }, [doc]);

  useEffect(() => {
    if (active) return;
    interactionRef.current = null;
    setPreviewPoints(null);
    setSpaceDown(false);
  }, [active]);

  useEffect(() => {
    let cancelled = false;
    const local = parseDocument(window.localStorage.getItem(localKey), paperTitle);
    setDoc(local || emptyDocument(paperTitle));
    setLoaded(true);
    setSaveState("saved");
    setSaveError("");
    undoRef.current = [];
    redoRef.current = [];
    projectDocRef.current = null;
    if (cancelled) return;
    return () => { cancelled = true; };
  }, [localKey, paperTitle]);

  // Every edit lands locally first. Project visibility is an additional synced
  // copy, not the source of truth for a private canvas.
  useEffect(() => {
    if (!loaded) return;
    const sequence = ++saveSequenceRef.current;
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      const persisted = { ...docRef.current, updatedAt: Date.now() };
      const serialized = JSON.stringify(persisted);
      if (serialized.length > 4_500_000) {
        if (sequence === saveSequenceRef.current) {
          setSaveState("error");
          setSaveError(t("This canvas is too large to save. Remove a large figure or split the map."));
        }
        return;
      }
      window.localStorage.setItem(localKey, serialized);
      if (persisted.visibility !== "project") {
        if (sequence === saveSequenceRef.current) setSaveState("saved");
        return;
      }
      if (!projectId || typeof bridge.applySharedDocumentUpdate !== "function") {
        if (sequence === saveSequenceRef.current) {
          setSaveState("error");
          setSaveError(t("Sign in to sync this canvas with the project."));
        }
        return;
      }
      const save = async () => {
        let projectDoc = projectDocRef.current;
        if (!projectDoc) {
          projectDoc = new Y.Doc();
          projectDocRef.current = projectDoc;
          const record = await bridge.getSharedDocument(projectId, sharedKey).catch(() => null);
          if (record?.state) {
            Y.applyUpdate(projectDoc, decodeState(record.state));
            projectDocRef.current = projectDoc;
          }
        }
        const text = projectDoc.getText("canvas");
        projectDoc.transact(() => {
          if (text.length) text.delete(0, text.length);
          text.insert(0, JSON.stringify(persisted));
        });
        const update = encodeState(Y.encodeStateAsUpdate(projectDoc));
        await bridge.applySharedDocumentUpdate(projectId, sharedKey, update);
      };
      projectSaveQueueRef.current = projectSaveQueueRef.current.then(save, save);
      void projectSaveQueueRef.current.then(() => {
        if (sequence === saveSequenceRef.current) {
          setSaveState("saved");
          setSaveError("");
        }
      }).catch((error) => {
        if (sequence === saveSequenceRef.current) {
          setSaveState("error");
          setSaveError(error instanceof Error ? error.message : String(error));
        }
      });
    }, 360);
    return () => window.clearTimeout(timer);
  }, [bridge, doc, loaded, localKey, projectId, sharedKey, t]);

  function pushUndo(snapshot: PaperCanvasDocument) {
    undoRef.current.push(snapshot);
    if (undoRef.current.length > HISTORY_LIMIT) undoRef.current.shift();
    redoRef.current = [];
  }

  function commit(updater: (current: PaperCanvasDocument) => PaperCanvasDocument, snapshot = true) {
    const current = docRef.current;
    const next = updater(current);
    if (next === current) return;
    if (snapshot) pushUndo(current);
    docRef.current = next;
    setDoc(next);
  }

  function updateElement(id: string, patch: Partial<PaperCanvasElement>, snapshot = false) {
    commit((current) => ({
      ...current,
      elements: current.elements.map((element) => element.id === id ? { ...element, ...patch, updatedAt: Date.now() } : element),
    }), snapshot);
  }

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => current === message ? "" : current), 2_600);
  }

  const viewport = doc.viewport;
  function worldPoint(clientX: number, clientY: number) {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (clientX - rect.left - viewport.x) / viewport.zoom, y: (clientY - rect.top - viewport.y) / viewport.zoom };
  }

  function centerWorld() {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (rect.width / 2 - viewport.x) / viewport.zoom, y: (rect.height / 2 - viewport.y) / viewport.zoom };
  }

  function createElementAt(type: CanvasElementType, x: number, y: number, overrides: Partial<PaperCanvasElement> = {}) {
    const now = Date.now();
    const defaults: Record<CanvasElementType, Partial<PaperCanvasElement>> = {
      text: { width: 250, height: 92, text: "", style: { fontSize: 15 } },
      sticky: { width: 214, height: 150, text: "", style: { fill: STICKY_TONES[0], fontSize: 15 } },
      quote: { width: 310, height: 174, text: "", style: { fontSize: 14 } },
      figure: { width: 300, height: 240, style: {} },
      page: { width: 218, height: 288, style: {} },
      shape: { width: 230, height: 136, text: "", style: { shape: "rectangle", strokeWidth: 2 } },
      arrow: { width: 100, height: 2, style: { strokeWidth: 2 }, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
      ink: { width: 100, height: 100, style: { strokeWidth: 3, color: INK_COLOR }, points: [{ x: 0, y: 0 }] },
      frame: { width: 520, height: 340, text: "Frame", style: {} },
    };
    const { style: overrideStyle, ...rest } = overrides;
    const base = defaults[type];
    const width = overrides.width ?? base.width ?? 220;
    const height = overrides.height ?? base.height ?? 140;
    return {
      id: newId(type),
      type,
      x: Math.round(x - width / 2),
      y: Math.round(y - height / 2),
      width,
      height,
      z: docRef.current.elements.reduce((maximum, element) => Math.max(maximum, element.z), 0) + 1,
      style: { ...(base.style || {}), ...(overrideStyle || {}) },
      text: overrides.text ?? base.text,
      points: overrides.points ?? base.points,
      image: overrides.image,
      source: overrides.source,
      createdAt: now,
      updatedAt: now,
      ...rest,
    } as PaperCanvasElement;
  }

  function addElement(element: PaperCanvasElement) {
    commit((current) => ({ ...current, elements: [...current.elements, element] }));
    setSelectedId(element.id);
    if (element.type === "text" || element.type === "sticky") setEditingId(element.id);
    return element;
  }

  function addElementAtCenter(type: CanvasElementType, overrides: Partial<PaperCanvasElement> = {}) {
    const center = centerWorld();
    return addElement(createElementAt(type, center.x, center.y, overrides));
  }

  useEffect(() => {
    if (!insertRequest) return;
    if (handledInsertRef.current === insertRequest.nonce) return;
    handledInsertRef.current = insertRequest.nonce;
    const center = centerWorld();
    if (insertRequest.type === "quote") {
      const height = cardHeight(insertRequest.quote);
      const element = createElementAt("quote", center.x, center.y, {
        width: 330,
        height,
        text: insertRequest.quote,
        source: { page: insertRequest.page, quote: insertRequest.quote, highlightId: insertRequest.highlightId, caption: insertRequest.caption },
      });
      addElement(element);
      showNotice(t("Added to Canvas · Quote card · p.{page}", { page: insertRequest.page }));
    } else if (insertRequest.type === "figure") {
      const image = insertRequest.image;
      const size = imageSize(image);
      const element = createElementAt("figure", center.x, center.y, {
        width: Math.max(size.width, 250),
        height: size.height + 48,
        image: { dataUrl: image.dataUrl, mimeType: image.mimeType, width: image.width, height: image.height },
        text: insertRequest.caption || "",
        source: { page: insertRequest.page, caption: insertRequest.caption },
      });
      addElement(element);
      showNotice(t("Added to Canvas · Figure card · p.{page}", { page: insertRequest.page }));
    } else {
      const element = createElementAt("page", center.x, center.y, {
        image: insertRequest.image ? { dataUrl: insertRequest.image.dataUrl, mimeType: insertRequest.image.mimeType, width: insertRequest.image.width, height: insertRequest.image.height } : undefined,
        source: { page: insertRequest.page },
      });
      addElement(element);
      showNotice(t("Added to Canvas · Page card · p.{page}", { page: insertRequest.page }));
    }
    onInsertHandled?.(insertRequest.nonce);
    // The request is consumed once; the user's next selection creates a new nonce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insertRequest]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!active) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      if (event.code === "Space") {
        event.preventDefault();
        setSpaceDown(true);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d" && selectedId) {
        event.preventDefault();
        duplicateSelected();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (!selectedId || editingId) return;
        event.preventDefault();
        deleteSelected();
        return;
      }
      if (event.key === "Escape") {
        setSelectedId(null);
        setEditingId(null);
        setTool("select");
        return;
      }
      if (event.key.startsWith("Arrow") && selectedId) {
        const amount = event.shiftKey ? 20 : 2;
        const delta = { x: event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0, y: event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0 };
        event.preventDefault();
        const selected = docRef.current.elements.find((element) => element.id === selectedId);
        if (selected) updateElement(selectedId, { x: selected.x + delta.x, y: selected.y + delta.y }, true);
        return;
      }
      const shortcut = TOOL_SHORTCUTS[event.key.toLowerCase()];
      if (shortcut && !event.metaKey && !event.ctrlKey && !event.altKey) setTool(shortcut);
    }
    function onKeyUp(event: KeyboardEvent) {
      if (event.code === "Space") setSpaceDown(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  });

  useEffect(() => {
    function onMove(event: PointerEvent) {
      const interaction = interactionRef.current;
      if (!interaction || interaction.pointerId !== event.pointerId) return;
      if (interaction.mode === "pan") {
        const dx = event.clientX - interaction.startX;
        const dy = event.clientY - interaction.startY;
        interaction.moved = interaction.moved || Math.abs(dx) + Math.abs(dy) > 2;
        const next = { ...interaction.originViewport, x: interaction.originViewport.x + dx, y: interaction.originViewport.y + dy };
        setDoc((current) => ({ ...current, viewport: next }));
      } else if (interaction.mode === "move") {
        const dx = (event.clientX - interaction.startX) / docRef.current.viewport.zoom;
        const dy = (event.clientY - interaction.startY) / docRef.current.viewport.zoom;
        interaction.moved = interaction.moved || Math.abs(dx) + Math.abs(dy) > 1;
        setDoc((current) => ({
          ...current,
          elements: current.elements.map((element) => element.id === interaction.elementId ? { ...element, x: interaction.originX + dx, y: interaction.originY + dy } : element),
        }));
      } else if (interaction.mode === "resize") {
        const dx = (event.clientX - interaction.startX) / docRef.current.viewport.zoom;
        const dy = (event.clientY - interaction.startY) / docRef.current.viewport.zoom;
        interaction.moved = interaction.moved || Math.abs(dx) + Math.abs(dy) > 1;
        setDoc((current) => ({
          ...current,
          elements: current.elements.map((element) => element.id === interaction.elementId ? { ...element, width: Math.max(80, interaction.originWidth + dx), height: Math.max(48, interaction.originHeight + dy) } : element),
        }));
      } else {
        const drawing = interaction as Extract<Interaction, { mode: "draw" | "arrow" }>;
        const start = drawing.startWorld;
        const currentPoint = worldPoint(event.clientX, event.clientY);
        const points = drawing.mode === "arrow" ? [start, currentPoint] : [...(previewPoints || [start]), currentPoint];
        drawing.moved = true;
        setPreviewPoints(points);
      }
    }
    function onUp(event: PointerEvent) {
      const interaction = interactionRef.current;
      if (!interaction || interaction.pointerId !== event.pointerId) return;
      interactionRef.current = null;
      if ((interaction.mode === "move" || interaction.mode === "resize") && interaction.moved) {
        pushUndo(interaction.before);
      }
      if ((interaction.mode === "draw" || interaction.mode === "arrow") && interaction.moved && previewPoints) {
        const points = interaction.mode === "arrow" ? previewPoints : (previewPoints.length > 1 ? previewPoints : [interaction.startWorld, interaction.startWorld]);
        const xs = points.map((point) => point.x);
        const ys = points.map((point) => point.y);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const width = Math.max(1, Math.max(...xs) - minX);
        const height = Math.max(1, Math.max(...ys) - minY);
        const relative = points.map((point) => ({ x: point.x - minX, y: point.y - minY }));
        const element = {
          ...createElementAt(interaction.mode === "arrow" ? "arrow" : "ink", 0, 0),
          x: minX,
          y: minY,
          width,
          height,
          points: relative,
          style: interaction.mode === "arrow" ? { strokeWidth: 2, color: "var(--accent)" } : { strokeWidth: 3, color: INK_COLOR },
        };
        addElement(element);
      }
      setPreviewPoints(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [previewPoints]);

  function beginPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.button !== 1) return;
    interactionRef.current = {
      mode: "pan",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originViewport: docRef.current.viewport,
      before: docRef.current,
      moved: false,
    };
  }

  function beginMove(event: ReactPointerEvent<HTMLDivElement>, element: PaperCanvasElement) {
    if (event.button !== 0 || editingId === element.id) return;
    if ((event.target as HTMLElement).closest("button, textarea, input, a")) return;
    setSelectedId(element.id);
    interactionRef.current = {
      mode: "move",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      elementId: element.id,
      originX: element.x,
      originY: element.y,
      originWidth: element.width,
      originHeight: element.height,
      before: docRef.current,
      moved: false,
    };
    event.preventDefault();
    event.stopPropagation();
  }

  function beginResize(event: ReactPointerEvent<HTMLButtonElement>, element: PaperCanvasElement) {
    event.preventDefault();
    event.stopPropagation();
    interactionRef.current = {
      mode: "resize",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      elementId: element.id,
      originX: element.x,
      originY: element.y,
      originWidth: element.width,
      originHeight: element.height,
      before: docRef.current,
      moved: false,
    };
  }

  function beginDrawing(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const point = worldPoint(event.clientX, event.clientY);
    interactionRef.current = {
      mode: tool === "arrow" ? "arrow" : "draw",
      pointerId: event.pointerId,
      startWorld: point,
      before: docRef.current,
      moved: false,
    };
    setPreviewPoints([point]);
    event.preventDefault();
  }

  function onSurfacePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest(".paper-canvas-element, .paper-canvas-overlay, .paper-canvas-toolrail, .paper-canvas-pills, .paper-canvas-zoom")) return;
    setSelectedId(null);
    setEditingId(null);
    if (tool === "hand" || spaceDown || event.button === 1) {
      beginPan(event);
      return;
    }
    if (tool === "pen" || tool === "arrow") {
      beginDrawing(event);
      return;
    }
    if (tool === "text" || tool === "sticky" || tool === "shape") {
      const point = worldPoint(event.clientX, event.clientY);
      const type = tool === "text" ? "text" : tool === "sticky" ? "sticky" : "shape";
      addElement(createElementAt(type, point.x, point.y));
      setTool("select");
      event.preventDefault();
      return;
    }
    if (event.button === 0) beginPan(event);
  }

  function onSurfaceDoubleClick(event: ReactMouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest(".paper-canvas-element, .paper-canvas-overlay, .paper-canvas-toolrail, .paper-canvas-pills, .paper-canvas-zoom")) return;
    const point = worldPoint(event.clientX, event.clientY);
    addElement(createElementAt("text", point.x, point.y));
    setTool("select");
  }

  function zoomAround(nextZoom: number, clientX?: number, clientY?: number) {
    const surface = surfaceRef.current;
    if (!surface) return;
    const rect = surface.getBoundingClientRect();
    const x = (clientX ?? rect.left + rect.width / 2) - rect.left;
    const y = (clientY ?? rect.top + rect.height / 2) - rect.top;
    const current = docRef.current.viewport;
    const zoom = Math.min(2.6, Math.max(.25, nextZoom));
    const worldX = (x - current.x) / current.zoom;
    const worldY = (y - current.y) / current.zoom;
    setDoc((value) => ({ ...value, viewport: { zoom, x: x - worldX * zoom, y: y - worldY * zoom } }));
  }

  function onWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      zoomAround(docRef.current.viewport.zoom * (event.deltaY < 0 ? 1.1 : .91), event.clientX, event.clientY);
      return;
    }
    event.preventDefault();
    setDoc((current) => ({ ...current, viewport: { ...current.viewport, x: current.viewport.x - event.deltaX, y: current.viewport.y - event.deltaY } }));
  }

  function fitToCanvas() {
    const surface = surfaceRef.current;
    if (!surface || !doc.elements.length) return;
    const rect = surface.getBoundingClientRect();
    const xs = doc.elements.flatMap((element) => [element.x, element.x + element.width]);
    const ys = doc.elements.flatMap((element) => [element.y, element.y + element.height]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const width = Math.max(1, Math.max(...xs) - minX);
    const height = Math.max(1, Math.max(...ys) - minY);
    const zoom = Math.min(1.35, Math.max(.25, Math.min((rect.width - 180) / width, (rect.height - 180) / height)));
    setDoc((current) => ({
      ...current,
      viewport: { zoom, x: (rect.width - width * zoom) / 2 - minX * zoom, y: (rect.height - height * zoom) / 2 - minY * zoom },
    }));
  }

  function deleteSelected() {
    if (!selectedId) return;
    commit((current) => ({ ...current, elements: current.elements.filter((element) => element.id !== selectedId) }));
    setSelectedId(null);
    setEditingId(null);
  }

  function duplicateSelected() {
    const element = docRef.current.elements.find((item) => item.id === selectedId);
    if (!element) return;
    const now = Date.now();
    addElement({ ...element, id: newId(element.type), x: element.x + 24, y: element.y + 24, z: element.z + 1, createdAt: now, updatedAt: now });
  }

  function undo() {
    const previous = undoRef.current.pop();
    if (!previous) return;
    redoRef.current.push(docRef.current);
    setDoc(previous);
    setSelectedId(null);
    setEditingId(null);
  }

  function redo() {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(docRef.current);
    setDoc(next);
    setSelectedId(null);
    setEditingId(null);
  }

  function applyTemplate(template: "map" | "method" | "experiment" | "claim") {
    const center = centerWorld();
    const now = Date.now();
    const make = (type: CanvasElementType, x: number, y: number, width: number, height: number, text: string, style: CanvasStyle = {}, extra: Partial<PaperCanvasElement> = {}) => ({
      ...createElementAt(type, x + width / 2, y + height / 2, { width, height, text, style }),
      z: now + Math.random(),
      ...extra,
    });
    const accent = "var(--accent)";
    let elements: PaperCanvasElement[] = [];
    if (template === "map") {
      elements = [
        make("sticky", center.x - 390, center.y - 154, 226, 148, "Research question\nWhat exactly is being claimed?", { fill: STICKY_TONES[0] }),
        make("sticky", center.x - 112, center.y - 200, 226, 148, "Method\nWhat mechanism makes it work?", { fill: STICKY_TONES[2] }),
        make("sticky", center.x + 168, center.y - 116, 226, 148, "Evidence\nWhich figure or table supports it?", { fill: STICKY_TONES[3] }),
        make("text", center.x - 112, center.y + 22, 506, 104, "Claim → mechanism → evidence\nWrite the reading path here.", { fontSize: 17 }),
      ];
    } else if (template === "method") {
      elements = [
        make("shape", center.x - 390, center.y - 80, 210, 110, "Input", { shape: "rectangle", strokeWidth: 2 }),
        make("shape", center.x - 100, center.y - 80, 210, 110, "Core module", { shape: "rectangle", strokeWidth: 2 }),
        make("shape", center.x + 190, center.y - 80, 210, 110, "Output", { shape: "rectangle", strokeWidth: 2 }),
        make("arrow", center.x - 164, center.y - 24, 54, 2, "", { color: accent, strokeWidth: 2 }, { points: [{ x: 0, y: 0 }, { x: 54, y: 0 }] }),
        make("arrow", center.x + 126, center.y - 24, 54, 2, "", { color: accent, strokeWidth: 2 }, { points: [{ x: 0, y: 0 }, { x: 54, y: 0 }] }),
        make("text", center.x - 100, center.y + 90, 420, 70, "Note the tensor shapes, losses, and assumptions.", { fontSize: 14 }),
      ];
    } else if (template === "experiment") {
      elements = [
        make("sticky", center.x - 390, center.y - 154, 218, 148, "Baseline\nWhat result are we comparing?", { fill: STICKY_TONES[1] }),
        make("sticky", center.x - 112, center.y - 154, 218, 148, "Intervention\nWhat changes in our run?", { fill: STICKY_TONES[0] }),
        make("sticky", center.x + 166, center.y - 154, 218, 148, "Metric\nWhat would falsify the claim?", { fill: STICKY_TONES[2] }),
        make("text", center.x - 112, center.y + 44, 500, 88, "Decision rule\nRecord the threshold before running the experiment.", { fontSize: 15 }),
      ];
    } else {
      elements = [
        make("shape", center.x - 380, center.y - 170, 230, 100, "Claim", { shape: "rectangle", strokeWidth: 2 }),
        make("shape", center.x - 90, center.y - 170, 230, 100, "Evidence", { shape: "rectangle", strokeWidth: 2 }),
        make("shape", center.x + 200, center.y - 170, 230, 100, "Status", { shape: "rectangle", strokeWidth: 2 }),
        make("text", center.x - 380, center.y + 12, 430, 126, "Use p. badges on quote and figure cards to jump back to the PDF."),
        make("sticky", center.x + 112, center.y + 26, 230, 132, "Open question\nWhat evidence is missing?", { fill: STICKY_TONES[3] }),
      ];
    }
    commit((current) => ({ ...current, elements: [...current.elements, ...elements] }));
    setSelectedId(elements[0]?.id ?? null);
    setNotice(t("Template added"));
  }

  function addPageCard() {
    addElementAtCenter("page", { source: { page: currentPage } });
    setMoreOpen(false);
  }

  function addFrame() {
    addElementAtCenter("frame", { text: "Frame", style: {} });
    setMoreOpen(false);
  }

  function addEllipse() {
    addElementAtCenter("shape", { style: { shape: "ellipse", strokeWidth: 2 } });
    setMoreOpen(false);
  }

  function exportJson() {
    downloadBlob(new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }), `${safeFilename(paperTitle)}-canvas.json`);
    setMoreOpen(false);
  }

  async function exportPng() {
    const surface = surfaceRef.current;
    if (!surface) return;
    setMoreOpen(false);
    const elements = [...doc.elements].sort((left, right) => left.z - right.z);
    if (!elements.length) return;
    const pad = 72;
    const minX = Math.min(...elements.map((element) => element.x));
    const minY = Math.min(...elements.map((element) => element.y));
    const maxX = Math.max(...elements.map((element) => element.x + element.width));
    const maxY = Math.max(...elements.map((element) => element.y + element.height));
    const width = maxX - minX + pad * 2;
    const height = maxY - minY + pad * 2;
    const scale = Math.min(2, 4_000 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(width * scale));
    canvas.height = Math.max(1, Math.ceil(height * scale));
    const context = canvas.getContext("2d");
    if (!context) return;
    const styles = window.getComputedStyle(surface);
    const paper = styles.getPropertyValue("--canvas-paper").trim() || styles.backgroundColor || "var(--surface-canvas)";
    const ink = styles.getPropertyValue("--text-primary").trim() || styles.color || "var(--text-primary)";
    context.scale(scale, scale);
    context.translate(-minX + pad, -minY + pad);
    context.fillStyle = paper;
    context.fillRect(minX - pad, minY - pad, width, height);
    for (const element of elements) {
      context.save();
      context.globalAlpha = 1;
      const radius = Math.min(14, Math.max(6, element.width * .04));
      if (element.type === "shape") {
        context.beginPath();
        if (element.style.shape === "ellipse") context.ellipse(element.x + element.width / 2, element.y + element.height / 2, element.width / 2, element.height / 2, 0, 0, Math.PI * 2);
        else context.roundRect(element.x, element.y, element.width, element.height, radius);
        context.strokeStyle = element.style.color || ink;
        context.lineWidth = element.style.strokeWidth || 2;
        context.stroke();
        if (element.text) {
          context.fillStyle = ink;
          context.font = `${element.style.fontSize || 15}px -apple-system, BlinkMacSystemFont, sans-serif`;
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillText(element.text, element.x + element.width / 2, element.y + element.height / 2);
        }
      } else if (element.type === "arrow" || element.type === "ink") {
        const points = element.points || [];
        if (points.length > 1) {
          context.beginPath();
          context.moveTo(element.x + points[0].x, element.y + points[0].y);
          for (const point of points.slice(1)) context.lineTo(element.x + point.x, element.y + point.y);
          context.strokeStyle = element.style.color || ink;
          context.lineWidth = element.style.strokeWidth || 2;
          context.stroke();
        }
      } else if (element.type === "frame") {
        context.beginPath();
        context.roundRect(element.x, element.y, element.width, element.height, radius);
        context.fillStyle = "rgba(170,150,110,.08)";
        context.fill();
        context.strokeStyle = "rgba(120,100,70,.45)";
        context.setLineDash([8, 6]);
        context.stroke();
        context.setLineDash([]);
        context.fillStyle = ink;
        context.font = "600 14px -apple-system, BlinkMacSystemFont, sans-serif";
        context.fillText(element.text || "Frame", element.x + 14, element.y + 22);
      } else {
        context.beginPath();
        context.roundRect(element.x, element.y, element.width, element.height, radius);
        context.fillStyle = element.style.fill || paper;
        context.fill();
        context.strokeStyle = "rgba(120,110,95,.32)";
        context.lineWidth = 1;
        context.stroke();
        if (element.image?.dataUrl) {
          try {
            const image = await new Promise<HTMLImageElement>((resolve, reject) => {
              const image = new Image();
              image.onload = () => resolve(image);
              image.onerror = reject;
              image.src = element.image?.dataUrl || "";
            });
            context.drawImage(image, element.x + 10, element.y + 10, element.width - 20, element.height - 42);
          } catch { /* keep the card frame when an image cannot be exported */ }
        }
        const text = element.text || "";
        if (text) {
          context.fillStyle = ink;
          context.font = `${element.style.fontSize || 14}px -apple-system, BlinkMacSystemFont, sans-serif`;
          context.textAlign = "left";
          context.textBaseline = "top";
          const lines = wrapText(context, text, element.width - 28).slice(0, 12);
          lines.forEach((line, index) => context.fillText(line, element.x + 14, element.y + 16 + index * 20));
        }
        if (element.source?.page) {
          context.fillStyle = "rgba(90,95,88,.72)";
          context.font = "600 10px -apple-system, BlinkMacSystemFont, sans-serif";
          context.textAlign = "right";
          context.fillText(`p.${element.source.page}`, element.x + element.width - 12, element.y + element.height - 14);
        }
      }
      context.restore();
    }
    canvas.toBlob((blob) => { if (blob) downloadBlob(blob, `${safeFilename(paperTitle)}-canvas.png`); }, "image/png");
  }

  async function changeVisibility(next: PaperCanvasVisibility) {
    setVisibilityOpen(false);
    if (next === visibility) return;
    if (next === "project" && !canShareProject) {
      setSaveState("error");
      setSaveError(t("Sign in to share this canvas with the project."));
      return;
    }
    if (next === "project" && projectId) {
      setSaveState("saving");
      try {
        const record = await bridge.getSharedDocument(projectId, sharedKey);
        const remote = readProjectDocument(record);
        if (remote?.elements.length) {
          setDoc({ ...remote, visibility: "project" });
          projectDocRef.current = null;
          showNotice(t("Loaded the shared project canvas"));
          return;
        }
        projectDocRef.current = null;
        setDoc((current) => ({ ...current, visibility: "project" }));
        showNotice(t("Shared with project members"));
      } catch (error) {
        setSaveState("error");
        setSaveError(error instanceof Error ? error.message : String(error));
      }
      return;
    }
    setDoc((current) => ({ ...current, visibility: next }));
    showNotice(next === "private" ? t("Canvas is private") : t("Shared with project members"));
  }

  function selectFromOutline(id: string) {
    setSelectedId(id);
    setEditingId(null);
    setOutlineOpen(false);
  }

  function renderElement(element: PaperCanvasElement) {
    const selected = element.id === selectedId;
    const editing = element.id === editingId;
    const commonProps = {
      "data-canvas-element": element.id,
      "aria-label": elementLabel(element),
      onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => beginMove(event, element),
      onDoubleClick: (event: ReactMouseEvent<HTMLDivElement>) => {
        if (element.type === "text" || element.type === "sticky") {
          event.stopPropagation();
          setSelectedId(element.id);
          setEditingId(element.id);
        }
      },
      style: {
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        zIndex: Math.round(element.z),
        ...(element.type === "sticky" ? { background: element.style.fill || STICKY_TONES[0], color: "#2f2a20" } : {}),
      } as React.CSSProperties,
    };
    const sourceButton = element.source ? <button type="button" className="paper-canvas-source" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onOpenSource(element.source!); }} title={t("Open source in original paper")}><span>p.{element.source.page}</span><ArrowUpRight size={11} /></button> : null;
    if (element.type === "arrow" || element.type === "ink") {
      const points = element.points || [];
      const path = points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
      return <div key={element.id} {...commonProps} className={`paper-canvas-element paper-canvas-${element.type}${selected ? " selected" : ""}`} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedId(element.id); }}>
        <svg width={Math.max(1, element.width)} height={Math.max(1, element.height)} viewBox={`0 0 ${Math.max(1, element.width)} ${Math.max(1, element.height)}`} aria-hidden="true">
          <path d={path} fill="none" stroke={element.style.color || "var(--accent)"} strokeWidth={element.style.strokeWidth || 2} strokeLinecap="round" strokeLinejoin="round" />
          {element.type === "arrow" && points.length > 1 && <path d={`M ${points[points.length - 1].x - 9} ${points[points.length - 1].y - 6} L ${points[points.length - 1].x} ${points[points.length - 1].y} L ${points[points.length - 1].x - 9} ${points[points.length - 1].y + 6}`} fill="none" stroke={element.style.color || "var(--accent)"} strokeWidth={element.style.strokeWidth || 2} strokeLinecap="round" strokeLinejoin="round" />}
        </svg>
        {selected && <button type="button" className="paper-canvas-resize" onPointerDown={(event) => beginResize(event, element)} title={t("Resize")} aria-label={t("Resize")} />}
      </div>;
    }
    if (element.type === "text" || element.type === "sticky") {
      const sticky = element.type === "sticky";
      return <div key={element.id} {...commonProps} className={`paper-canvas-element paper-canvas-${element.type}${selected ? " selected" : ""}`} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(element.id); setEditingId(element.id); } }}>
        {sticky && <span className="paper-canvas-sticky-dot" aria-hidden="true" />}
        {editing ? <textarea autoFocus value={element.text || ""} onChange={(event) => updateElement(element.id, { text: event.target.value })} onBlur={() => setEditingId(null)} onKeyDown={(event) => { if (event.key === "Escape") { event.currentTarget.blur(); } }} aria-label={elementLabel(element)} /> : <div className="paper-canvas-copy">{element.text || (sticky ? t("Write a question or hypothesis…") : t("Double-click to edit"))}</div>}
        {selected && <button type="button" className="paper-canvas-resize" onPointerDown={(event) => beginResize(event, element)} title={t("Resize")} aria-label={t("Resize")} />}
      </div>;
    }
    if (element.type === "quote") {
      return <div key={element.id} {...commonProps} className={`paper-canvas-element paper-canvas-quote${selected ? " selected" : ""}`} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedId(element.id); }}>
        <header><span className="paper-canvas-card-kind"><Quote size={12} />{t("Quote")}</span>{sourceButton}</header>
        <blockquote>{element.text}</blockquote>
        {element.source?.caption && <small>{element.source.caption}</small>}
        {selected && <button type="button" className="paper-canvas-resize" onPointerDown={(event) => beginResize(event, element)} title={t("Resize")} aria-label={t("Resize")} />}
      </div>;
    }
    if (element.type === "figure") {
      return <div key={element.id} {...commonProps} className={`paper-canvas-element paper-canvas-figure${selected ? " selected" : ""}`} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedId(element.id); }}>
        <header><span className="paper-canvas-card-kind"><ImageIcon size={12} />{t("Figure")}</span>{sourceButton}</header>
        {element.image?.dataUrl ? <img src={element.image.dataUrl} alt={element.text || t("Figure from paper")} draggable={false} /> : <div className="paper-canvas-figure-empty"><ImageIcon size={20} />{t("Figure crop")}</div>}
        {element.text && <p>{element.text}</p>}
        {selected && <button type="button" className="paper-canvas-resize" onPointerDown={(event) => beginResize(event, element)} title={t("Resize")} aria-label={t("Resize")} />}
      </div>;
    }
    if (element.type === "page") {
      return <div key={element.id} {...commonProps} className={`paper-canvas-element paper-canvas-page${selected ? " selected" : ""}`} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedId(element.id); }}>
        <header><span className="paper-canvas-card-kind"><FileText size={12} />{t("Page {page}", { page: element.source?.page || currentPage })}</span>{sourceButton}</header>
        {element.image?.dataUrl ? <img src={element.image.dataUrl} alt={t("Page {page}", { page: element.source?.page || currentPage })} draggable={false} /> : <div className="paper-canvas-page-lines" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div>}
        {selected && <button type="button" className="paper-canvas-resize" onPointerDown={(event) => beginResize(event, element)} title={t("Resize")} aria-label={t("Resize")} />}
      </div>;
    }
    if (element.type === "frame") {
      return <div key={element.id} {...commonProps} className={`paper-canvas-element paper-canvas-frame${selected ? " selected" : ""}`} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedId(element.id); }}>
        <span>{element.text || t("Frame")}</span>
        {selected && <button type="button" className="paper-canvas-resize" onPointerDown={(event) => beginResize(event, element)} title={t("Resize")} aria-label={t("Resize")} />}
      </div>;
    }
    const shape = element.style.shape || "rectangle";
    return <div key={element.id} {...commonProps} className={`paper-canvas-element paper-canvas-shape ${shape}${selected ? " selected" : ""}`} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedId(element.id); }}>
      <span>{element.text || (shape === "ellipse" ? t("Ellipse") : t("Rectangle"))}</span>
      {selected && <button type="button" className="paper-canvas-resize" onPointerDown={(event) => beginResize(event, element)} title={t("Resize")} aria-label={t("Resize")} />}
    </div>;
  }

  const toolDefinitions: Array<{ id: PaperCanvasTool; label: string; icon: React.ReactNode }> = [
    { id: "select", label: t("Select"), icon: <MousePointer2 size={17} /> },
    { id: "hand", label: t("Pan"), icon: <Hand size={17} /> },
    { id: "pen", label: t("Pen"), icon: <PenLine size={17} /> },
    { id: "text", label: t("Text"), icon: <Type size={17} /> },
    { id: "sticky", label: t("Sticky"), icon: <StickyNote size={17} /> },
    { id: "shape", label: t("Shape"), icon: <Square size={17} /> },
    { id: "arrow", label: t("Arrow"), icon: <ArrowUpRight size={17} /> },
  ];

  return <section className="paper-canvas-shell" aria-label={t("Paper canvas")}>
    <div
      ref={surfaceRef}
      className={`paper-canvas-surface tool-${tool}${spaceDown ? " space-pan" : ""}${tool === "hand" ? " hand" : ""}`}
      onPointerDown={onSurfacePointerDown}
      onDoubleClick={onSurfaceDoubleClick}
      onWheel={onWheel}
      style={{
        "--canvas-zoom": String(viewport.zoom),
        backgroundSize: `${24 * viewport.zoom}px ${24 * viewport.zoom}px, ${24 * viewport.zoom}px ${24 * viewport.zoom}px, ${120 * viewport.zoom}px ${120 * viewport.zoom}px, ${120 * viewport.zoom}px ${120 * viewport.zoom}px`,
        backgroundPosition: `${viewport.x}px ${viewport.y}px, ${viewport.x}px ${viewport.y}px, ${viewport.x}px ${viewport.y}px, ${viewport.x}px ${viewport.y}px`,
      } as React.CSSProperties}
    >
      <div className="paper-canvas-world" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}>
        {sortedElements.map(renderElement)}
        {previewPoints && <svg className="paper-canvas-preview" aria-hidden="true"><path d={previewPoints.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ")} fill="none" stroke={tool === "pen" ? INK_COLOR : "var(--accent)"} strokeWidth={tool === "pen" ? 3 : 2} strokeDasharray={tool === "arrow" ? "5 5" : undefined} /></svg>}
      </div>

      {!doc.elements.length && <div className="paper-canvas-empty paper-canvas-overlay">
        <span className="paper-canvas-empty-icon"><Frame size={24} /></span>
        <strong>{t("Map the paper spatially")}</strong>
        <p>{t("Place the question, method, evidence, and open problems on one canvas. Select text in the PDF and send it here as a quote card.")}</p>
        <div className="paper-canvas-templates">
          <button type="button" onClick={() => applyTemplate("map")}><span>{t("Paper map")}</span><small>{t("Question · method · evidence")}</small></button>
          <button type="button" onClick={() => applyTemplate("method")}><span>{t("Method diagram")}</span><small>{t("Inputs · modules · outputs")}</small></button>
          <button type="button" onClick={() => applyTemplate("experiment")}><span>{t("Experiment plan")}</span><small>{t("Baseline · metric · decision")}</small></button>
          <button type="button" onClick={() => applyTemplate("claim")}><span>{t("Claim → evidence")}</span><small>{t("Track support and gaps")}</small></button>
        </div>
      </div>}

      <div className="paper-canvas-pills paper-canvas-overlay">
        <div className="paper-canvas-pill" title={visibility === "private" ? t("Only you can see this canvas") : t("Project members can open this canvas")}>
          <Users size={13} />
          <span>{visibility === "private" ? t("Only you") : t("Project members")}</span>
        </div>
        <button ref={visibilityButtonRef} type="button" className={`paper-canvas-pill paper-canvas-visibility${saveState === "error" ? " has-error" : ""}`} onClick={() => setVisibilityOpen((open) => !open)} aria-haspopup="menu" aria-expanded={visibilityOpen} title={t("Canvas visibility and save status")}>
          {visibility === "private" ? <Lock size={13} /> : <Users size={13} />}
          <span>{visibility === "private" ? t("Private") : t("Project")}</span>
          <i aria-hidden="true" />
          <span className="paper-canvas-save-state">
            {saveState === "loading" ? <LoaderCircle className="spin" size={12} /> : saveState === "saving" ? <LoaderCircle className="spin" size={12} /> : saveState === "error" ? <AlertTriangle size={12} /> : <Check size={12} />}
            {saveState === "loading" ? t("Loading") : saveState === "saving" ? t("Saving") : saveState === "error" ? t("Save failed") : t("Saved")}
          </span>
          <ChevronDown size={12} />
        </button>
        <button ref={moreButtonRef} type="button" className="paper-canvas-more" onClick={() => setMoreOpen((open) => !open)} aria-haspopup="menu" aria-expanded={moreOpen} title={t("More canvas actions")}><MoreHorizontal size={17} /></button>
      </div>

      <div className="paper-canvas-toolrail paper-canvas-overlay" role="toolbar" aria-label={t("Canvas tools")}>
        {toolDefinitions.map((definition) => <button key={definition.id} type="button" className={tool === definition.id ? "active" : ""} onClick={() => { setTool(definition.id); if (definition.id !== "select") setSelectedId(null); }} title={`${definition.label} · ${definition.id === "sticky" ? "S" : definition.id === "shape" ? "R" : definition.id[0].toUpperCase()}`} aria-label={definition.label} aria-pressed={tool === definition.id}>{definition.icon}</button>)}
      </div>

      {outlineOpen && <aside className="paper-canvas-outline paper-canvas-overlay" aria-label={t("Canvas element outline")}>
        <header><strong>{t("Elements")}</strong><button type="button" onClick={() => setOutlineOpen(false)} title={t("Close")} aria-label={t("Close")}><X size={14} /></button></header>
        {doc.elements.length ? <div>{[...doc.elements].sort((left, right) => left.z - right.z).map((element) => <button key={element.id} type="button" className={element.id === selectedId ? "active" : ""} onClick={() => selectFromOutline(element.id)}><span>{element.type}</span><small>{elementLabel(element)}</small></button>)}</div> : <p>{t("No elements yet.")}</p>}
      </aside>}

      <div className="paper-canvas-zoom paper-canvas-overlay" aria-label={t("Canvas zoom")}>
        <button type="button" onClick={() => zoomAround(doc.viewport.zoom - .1)} title={t("Zoom out")} aria-label={t("Zoom out")}><ZoomOut size={15} /></button>
        <button type="button" className="paper-canvas-zoom-value" onClick={() => zoomAround(1)} title={t("Reset zoom")}>{Math.round(doc.viewport.zoom * 100)}%</button>
        <button type="button" onClick={() => zoomAround(doc.viewport.zoom + .1)} title={t("Zoom in")} aria-label={t("Zoom in")}><ZoomIn size={15} /></button>
        <span aria-hidden="true" />
        <button type="button" onClick={fitToCanvas} title={t("Fit canvas")} aria-label={t("Fit canvas")}><Maximize2 size={15} /></button>
        <button type="button" onClick={undo} disabled={!undoRef.current.length} title={t("Undo")} aria-label={t("Undo")}><Undo2 size={15} /></button>
        <button type="button" onClick={redo} disabled={!redoRef.current.length} title={t("Redo")} aria-label={t("Redo")}><Redo2 size={15} /></button>
      </div>

      {notice && <div className="paper-canvas-toast paper-canvas-overlay" role="status">{notice}</div>}
      {saveError && saveState === "error" && <div className="paper-canvas-save-error paper-canvas-overlay" role="alert"><AlertTriangle size={13} />{saveError}<button type="button" onClick={() => setSaveError("")} aria-label={t("Dismiss")}><X size={12} /></button></div>}
    </div>

    <MenuSurface open={visibilityOpen} onClose={() => setVisibilityOpen(false)} anchorRef={visibilityButtonRef} placement="bottom-end" width={250} ariaLabel={t("Canvas visibility")}>
      <MenuItem checked={visibility === "private"} icon={<Lock size={15} />} onClick={() => void changeVisibility("private")}>{t("Private")}<small className="paper-canvas-menu-hint">{t("Only you can open this canvas")}</small></MenuItem>
      <MenuItem checked={visibility === "project"} icon={<Users size={15} />} disabled={!canShareProject} onClick={() => void changeVisibility("project")}>{t("Project")}<small className="paper-canvas-menu-hint">{canShareProject ? t("Project members can open and edit") : t("Sign in and publish the project to share")}</small></MenuItem>
    </MenuSurface>

    <MenuSurface open={moreOpen} onClose={() => setMoreOpen(false)} anchorRef={moreButtonRef} placement="bottom-end" width={224} ariaLabel={t("More canvas actions")}>
      <MenuItem icon={<Square size={15} />} onClick={() => { addEllipse(); }}>{t("Ellipse")}</MenuItem>
      <MenuItem icon={<Frame size={15} />} onClick={() => { addFrame(); }}>{t("Frame")}</MenuItem>
      <MenuItem icon={<FileText size={15} />} onClick={addPageCard}>{t("Page card")}</MenuItem>
      <MenuItem icon={<FileText size={15} />} onClick={() => { setOutlineOpen((open) => !open); setMoreOpen(false); }}>{t("Element outline")}</MenuItem>
      <MenuDivider />
      <MenuItem icon={<FileJson size={15} />} onClick={exportJson}>{t("Export JSON")}</MenuItem>
      <MenuItem icon={<Download size={15} />} onClick={() => void exportPng()}>{t("Export PNG")}</MenuItem>
      <MenuItem danger icon={<Trash2 size={15} />} disabled={!selectedId} onClick={() => { deleteSelected(); setMoreOpen(false); }}>{t("Delete selection")}</MenuItem>
    </MenuSurface>
  </section>;
}
