export type FileTextSizeAction = "increase" | "decrease" | "reset";

export type FileTextShortcuts = Record<FileTextSizeAction, string>;

export const FILE_TEXT_SIZE_DEFAULT = 13;
export const FILE_TEXT_SIZE_MIN = 9;
export const FILE_TEXT_SIZE_MAX = 26;

export const DEFAULT_FILE_TEXT_SHORTCUTS: FileTextShortcuts = {
  increase: "Mod+=",
  decrease: "Mod+-",
  reset: "Mod+0",
};

export const FILE_TEXT_SIZE_ACTIONS: FileTextSizeAction[] = ["increase", "decrease", "reset"];

export function clampFileTextSize(size: number) {
  if (!Number.isFinite(size)) return FILE_TEXT_SIZE_DEFAULT;
  return Math.min(FILE_TEXT_SIZE_MAX, Math.max(FILE_TEXT_SIZE_MIN, Math.round(size)));
}

function normalizeShortcutKey(key: string) {
  if (key === "+" || key === "Add") return "=";
  if (key === "_" || key === "Subtract") return "-";
  if (key.length === 1) return key.toLowerCase();
  return key;
}

/** Turns a keydown event into a stable binding such as "Mod+=" or "Mod+Shift+K". */
export function shortcutFromEvent(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">) {
  const key = normalizeShortcutKey(event.key);
  if (!key || ["control", "meta", "alt", "shift"].includes(key.toLowerCase())) return null;
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("Mod");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey && key !== "=" && key !== "-") parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}

export function shortcutMatches(event: KeyboardEvent, shortcut: string) {
  return shortcutFromEvent(event) === shortcut;
}

/** Formats a stored binding for the current platform. */
export function formatFileTextShortcut(shortcut: string, isMac: boolean) {
  if (!shortcut) return "";
  const parts = shortcut.split("+");
  const key = parts.pop() ?? "";
  const mod = parts.includes("Mod");
  const alt = parts.includes("Alt");
  const shift = parts.includes("Shift");
  const labels: string[] = [];
  if (mod) labels.push(isMac ? "⌘" : "Ctrl");
  if (alt) labels.push(isMac ? "⌥" : "Alt");
  if (shift) labels.push(isMac ? "⇧" : "Shift");
  labels.push(key.length === 1 ? key.toUpperCase() : key);
  return labels.join(isMac ? "" : "+");
}
