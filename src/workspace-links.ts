function normalizePath(value: string) {
  const parts: string[] = [];
  for (const part of value.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(part);
  }
  return `${value.startsWith("/") ? "/" : ""}${parts.join("/")}`;
}

// Convert model-produced links to workspace-relative paths. The desktop file
// bridge additionally checks the real path, including symlinks, before reading.
export function workspaceFileLink(href: string, workspace: string): string | null {
  if (!href || !workspace || /^[#?]/.test(href) || /[\u0000-\u001f\u007f]/.test(href)) return null;
  let requested = href;
  if (/^file:/i.test(requested)) {
    try {
      const url = new URL(requested);
      if (url.protocol !== "file:" || (url.hostname && url.hostname !== "localhost")) return null;
      requested = url.pathname;
    } catch { return null; }
  } else requested = requested.split(/[?#]/, 1)[0];
  try { requested = decodeURIComponent(requested); } catch { return null; }
  requested = requested.replaceAll("\\", "/");
  let root = workspace.replaceAll("\\", "/");
  if (/^\/[a-z]:\//i.test(requested)) requested = requested.slice(1);
  if (/^\/[a-z]:\//i.test(root)) root = root.slice(1);
  if (!requested || /[\u0000-\u001f\u007f]/.test(requested) || requested.startsWith("//")) return null;
  const windows = /^[a-z]:\//i.test(root);
  if (/^[a-z][a-z0-9+.-]*:/i.test(requested) && !/^[a-z]:\//i.test(requested)) return null;
  root = normalizePath(root) || "";
  if (!root || (!root.startsWith("/") && !windows)) return null;
  const absolute = requested.startsWith("/") || /^[a-z]:\//i.test(requested);
  const target = normalizePath(absolute ? requested : `${root}/${requested}`);
  if (!target) return null;
  const prefix = root.endsWith("/") ? root : `${root}/`;
  if (!(windows ? target.toLowerCase().startsWith(prefix.toLowerCase()) : target.startsWith(prefix))) return null;
  return target.slice(prefix.length) || null;
}
