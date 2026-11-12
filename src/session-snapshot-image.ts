import { snapshotMarkdown, type SnapshotExport } from "./session-snapshot";

export function downloadSnapshotBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  // Downloads may start asynchronously in Electron/Chromium.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Full selected transcript, not a crop of the currently visible scroll area. */
export async function snapshotImagePages(snapshot: SnapshotExport, width: number, signal?: AbortSignal): Promise<Blob[]> {
  await document.fonts.ready;
  const content = snapshotMarkdown(snapshot);
  if (content.length > 2_000_000) throw new Error("The selection is too large for image export. Choose fewer turns or download Markdown.");
  const probe = document.createElement("canvas");
  const context = probe.getContext("2d");
  if (!context) throw new Error("Image export is unavailable in this browser.");
  const safeWidth = Math.max(600, Math.min(1200, width));
  const padding = 40;
  context.font = "16px system-ui";
  const lines: string[] = [];
  for (const paragraph of content.split("\n")) {
    let line = "";
    for (const char of Array.from(paragraph)) {
      if (signal?.aborted) throw new DOMException("Image export cancelled.", "AbortError");
      if (line && context.measureText(line + char).width > safeWidth - padding * 2) {
        lines.push(line); line = char;
        if (lines.length % 100 === 0) await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
      else line += char;
    }
    lines.push(line);
  }
  const lineHeight = 26;
  const perPage = 550; // Under common 16k canvas limits, with no silent truncation.
  if (lines.length > perPage * 40) throw new Error("The selection is too large for image export. Choose fewer turns or download Markdown.");
  const colorProbe = document.createElement("span");
  colorProbe.style.cssText = "position:fixed;visibility:hidden;background:var(--mono-canvas);color:var(--night-ink)";
  document.body.appendChild(colorProbe);
  const colors = getComputedStyle(colorProbe);
  const background = colors.backgroundColor;
  const foreground = colors.color;
  colorProbe.remove();
  const pages: Blob[] = [];
  for (let offset = 0; offset < lines.length; offset += perPage) {
    if (signal?.aborted) throw new DOMException("Image export cancelled.", "AbortError");
    const page = lines.slice(offset, offset + perPage);
    const canvas = document.createElement("canvas");
    canvas.width = safeWidth; canvas.height = padding * 2 + page.length * lineHeight + 28;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image export is unavailable in this browser.");
    ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = foreground; ctx.font = "16px system-ui"; ctx.textBaseline = "top";
    page.forEach((line, index) => ctx.fillText(line, padding, padding + index * lineHeight));
    ctx.font = "12px system-ui";
    ctx.fillText(`Archimedes · ${Math.floor(offset / perPage) + 1}/${Math.ceil(lines.length / perPage)}`, padding, canvas.height - padding);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not create the image.")), "image/png"));
    pages.push(blob);
    canvas.width = 0; canvas.height = 0;
  }
  return pages;
}
