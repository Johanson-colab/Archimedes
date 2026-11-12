// Lexical display/classification only. Filesystem access still needs the main
// process's real-path checks (including symlinks and junctions).
function windowsPath(value: string) {
  return /^[a-z]:[\\/]/i.test(value) || /^(?:\\\\|\/\/)/.test(value);
}

function normalizeAbsolute(value: string, windows: boolean): string | null {
  if (!value || /[\u0000-\u001f]/.test(value)) return null;
  let text = windows ? value.replaceAll("\\", "/") : value;
  let root: string;
  if (windows) {
    if (/^\/\/\?\/UNC\//i.test(text)) text = `//${text.slice(8)}`;
    else if (/^\/\/\?\/[a-z]:\//i.test(text)) text = text.slice(4);
    if (/^[a-z]:\//i.test(text)) {
      root = text.slice(0, 3);
      text = text.slice(3);
    } else {
      const unc = /^\/\/([^/?]+)\/([^/]+)(?:\/|$)/.exec(text);
      if (!unc || unc[1] === ".") return null;
      root = `//${unc[1]}/${unc[2]}/`;
      text = text.slice(unc[0].length);
    }
  } else {
    if (!text.startsWith("/")) return null;
    root = "/";
    text = text.slice(1);
  }
  const parts: string[] = [];
  for (const part of text.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(part);
  }
  return root + parts.join("/");
}

export function isWorkspacePath(workspace: string, target: string): boolean {
  const windows = windowsPath(workspace);
  const root = normalizeAbsolute(workspace, windows);
  const file = normalizeAbsolute(target, windows);
  if (!root || !file) return false;
  const parent = windows ? root.toLowerCase() : root;
  const child = windows ? file.toLowerCase() : file;
  const prefix = parent.endsWith("/") ? parent : `${parent}/`;
  return child === parent || child.startsWith(prefix);
}

export function workspacePathName(workspace: string, fallback = "Workspace"): string {
  const windows = windowsPath(workspace);
  const normalized = normalizeAbsolute(workspace, windows);
  if (!normalized) return workspace || fallback;
  const name = normalized.split("/").filter(Boolean).at(-1);
  if (windows && /^[a-z]:\/$/i.test(normalized)) return normalized.replace("/", "\\");
  return name || normalized;
}
