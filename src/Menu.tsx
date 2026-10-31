import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Check } from "lucide-react";

export type MenuPlacement = "bottom-start" | "bottom-end" | "top-start" | "top-end";
type RectLike = { left: number; top: number; right: number; bottom: number; width: number; height: number };
type MenuRole = "menu" | "listbox" | "dialog" | "group";

type MenuSurfaceProps = {
  open: boolean;
  onClose: () => void;
  anchorRef?: RefObject<HTMLElement | null>;
  anchorRect?: RectLike | null;
  cursor?: { x: number; y: number } | null;
  placement?: MenuPlacement;
  width?: number | "anchor";
  minWidth?: number;
  maxWidth?: number | string;
  maxHeight?: number;
  role?: MenuRole;
  ariaLabel: string;
  className?: string;
  id?: string;
  focus?: "first" | "none";
  children: ReactNode;
};

const VIEWPORT_PAD = 8;
const ANCHOR_GAP = 6;

function elementRect(element: HTMLElement | null): RectLike | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
}

function cursorRect(point: { x: number; y: number }): RectLike {
  return { left: point.x, top: point.y, right: point.x, bottom: point.y, width: 0, height: 0 };
}

/**
 * Shared floating menu surface.
 *
 * Owns the behaviours that used to be copy-pasted into every menu: portal,
 * viewport-aware positioning (flip + shift), outside pointer close, Escape,
 * scroll/resize re-positioning, focus return, roving focus and typeahead.
 * Visuals live in the `.menu-*` rules in styles.css and the `--menu-*` tokens.
 */
export function MenuSurface({
  open,
  onClose,
  anchorRef,
  anchorRect,
  cursor,
  placement = "bottom-start",
  width,
  minWidth = 260,
  maxWidth,
  maxHeight = 480,
  role = "menu",
  ariaLabel,
  className = "",
  id,
  focus = "first",
  children,
}: MenuSurfaceProps) {
  const generatedId = useId();
  const menuId = id ?? `menu-${generatedId.replace(/:/g, "")}`;
  const panelRef = useRef<HTMLDivElement>(null);
  const pointerOutsideRef = useRef(false);
  const typeaheadRef = useRef({ text: "", at: 0 });
  const [position, setPosition] = useState<{ left: number; top: number; width?: number } | null>(null);
  const [ready, setReady] = useState(false);

  const anchorElement = useCallback(() => anchorRef?.current ?? null, [anchorRef]);

  const updatePosition = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const anchor = anchorRect ?? elementRect(anchorElement()) ?? (cursor ? cursorRect(cursor) : null);
    if (!anchor) return;
    const panelRect = panel.getBoundingClientRect();
    const panelWidth = width === "anchor" ? Math.max(minWidth, anchor.width) : panelRect.width;
    const panelHeight = panelRect.height;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const preferTop = placement.startsWith("top");
    const alignEnd = placement.endsWith("end");

    let left = alignEnd ? anchor.right - panelWidth : anchor.left;
    if (cursor) left = cursor.x;

    let top = preferTop ? anchor.top - panelHeight - ANCHOR_GAP : anchor.bottom + ANCHOR_GAP;
    if (cursor) top = cursor.y;

    if (!preferTop && top + panelHeight > viewportHeight - VIEWPORT_PAD) {
      const above = anchor.top - panelHeight - ANCHOR_GAP;
      top = above >= VIEWPORT_PAD || anchor.top > viewportHeight - anchor.bottom ? above : viewportHeight - panelHeight - VIEWPORT_PAD;
    }
    if (preferTop && top < VIEWPORT_PAD) {
      const below = anchor.bottom + ANCHOR_GAP;
      top = below + panelHeight <= viewportHeight - VIEWPORT_PAD || anchor.bottom < viewportHeight / 2 ? below : VIEWPORT_PAD;
    }

    const maxLeft = Math.max(VIEWPORT_PAD, viewportWidth - panelWidth - VIEWPORT_PAD);
    const maxTop = Math.max(VIEWPORT_PAD, viewportHeight - panelHeight - VIEWPORT_PAD);
    left = Math.min(Math.max(VIEWPORT_PAD, left), maxLeft);
    top = Math.min(Math.max(VIEWPORT_PAD, top), maxTop);
    const resolvedWidth = width === "anchor" ? Math.max(minWidth, anchor.width) : undefined;
    setPosition((current) => (current && current.left === left && current.top === top && current.width === resolvedWidth ? current : { left, top, width: resolvedWidth }));
    setReady(true);
  }, [anchorRect, anchorElement, cursor, minWidth, placement, width]);

  useLayoutEffect(() => {
    if (!open) {
      setReady(false);
      setPosition(null);
      return;
    }
    setReady(false);
    setPosition(null);
    updatePosition();
    const frame = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(frame);
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const observer = new ResizeObserver(() => updatePosition());
    observer.observe(panel);
    const onScroll = () => updatePosition();
    const onResize = () => updatePosition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (anchorElement()?.contains(target)) return;
      pointerOutsideRef.current = true;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, anchorElement]);

  useEffect(() => {
    if (!open) return;
    const anchor = anchorElement();
    return () => {
      if (pointerOutsideRef.current) {
        pointerOutsideRef.current = false;
        return;
      }
      const active = document.activeElement;
      const panel = panelRef.current;
      if (active === document.body || active === null || panel?.contains(active)) anchor?.focus();
    };
  }, [open, anchorElement]);

  const menuItems = useCallback((): HTMLElement[] => {
    const panel = panelRef.current;
    if (!panel) return [];
    return [...panel.querySelectorAll<HTMLElement>("[data-menu-item]:not([disabled]):not([aria-disabled='true'])")];
  }, []);

  const moveFocus = useCallback((direction: 1 | -1) => {
    const items = menuItems();
    if (!items.length) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = index === -1 ? (direction === 1 ? 0 : items.length - 1) : (index + direction + items.length) % items.length;
    items[next]?.focus();
  }, [menuItems]);

  useEffect(() => {
    if (!open || focus === "none" || !ready) return;
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      if (role === "menu" || role === "listbox") {
        menuItems()[0]?.focus();
        return;
      }
      for (const item of menuItems()) item.tabIndex = 0;
      const target = panel.querySelector<HTMLElement>(
        "input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [data-menu-item]:not([disabled]), button:not([disabled]), a[href]",
      );
      target?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open, focus, ready, role, menuItems]);

  useEffect(() => {
    if (!open || role !== "menu") return;
    const panel = panelRef.current;
    if (!panel) return;
    const sync = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.matches("[data-menu-item]")) return;
      for (const item of menuItems()) item.tabIndex = item === target ? 0 : -1;
    };
    panel.addEventListener("focusin", sync);
    return () => panel.removeEventListener("focusin", sync);
  }, [open, role, menuItems]);

  if (!open) return null;

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (role !== "menu" && role !== "listbox") return;
    if (event.key === "Tab") {
      onClose();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const items = menuItems();
      if (!items.length) return;
      if (event.key === "Home") items[0]?.focus();
      else if (event.key === "End") items.at(-1)?.focus();
      else moveFocus(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const now = Date.now();
      const state = typeaheadRef.current;
      const text = (now - state.at > 600 ? "" : state.text) + event.key.toLowerCase();
      typeaheadRef.current = { text, at: now };
      const items = menuItems();
      const start = Math.max(0, items.indexOf(document.activeElement as HTMLElement));
      const ordered = [...items.slice(start + 1), ...items.slice(0, start + 1)];
      ordered.find((item) => (item.textContent ?? "").toLowerCase().trim().startsWith(text))?.focus();
    }
  };

  const style = {
    left: position?.left ?? 0,
    top: position?.top ?? 0,
    width: width === "anchor" ? position?.width : width,
    maxWidth: maxWidth ?? "calc(100vw - 16px)",
    maxHeight: Math.min(maxHeight, typeof window === "undefined" ? maxHeight : window.innerHeight - 16),
    visibility: ready ? "visible" : "hidden",
  } as CSSProperties;

  return createPortal(
    <div
      ref={panelRef}
      id={menuId}
      role={role}
      aria-label={ariaLabel}
      aria-orientation={role === "menu" ? "vertical" : undefined}
      data-menu-surface=""
      className={`menu-surface ${className}`.trim()}
      style={style}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>,
    document.body,
  );
}

type MenuItemProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  hint?: ReactNode;
  shortcut?: string;
  danger?: boolean;
  checked?: boolean;
};

export function MenuItem({ icon, hint, shortcut, danger, checked, className = "", children, ...rest }: MenuItemProps) {
  return (
    <button
      type="button"
      role={checked === undefined ? "menuitem" : "menuitemradio"}
      aria-checked={checked === undefined ? undefined : checked}
      data-menu-item=""
      data-danger={danger ? "" : undefined}
      tabIndex={-1}
      className={`menu-item ${className}`.trim()}
      {...rest}
    >
      {icon && <span className="menu-item-icon" aria-hidden="true">{icon}</span>}
      <span className="menu-item-body">{children}</span>
      {hint && <span className="menu-item-hint">{hint}</span>}
      {shortcut && <span className="menu-item-shortcut">{shortcut}</span>}
      {checked !== undefined && <span className="menu-item-check" aria-hidden="true">{checked ? <Check size={15} strokeWidth={2} /> : null}</span>}
    </button>
  );
}

export function MenuDivider() {
  return <span className="menu-divider" role="separator" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <span className="menu-label">{children}</span>;
}
