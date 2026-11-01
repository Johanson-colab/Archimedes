const MAX_NODES = 1000;
const TYPES = new Set(["rect", "ellipse", "line", "text", "polyline", "path", "image"]);
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (n, min, max) => Math.max(min, Math.min(max, number(n)));
const xml = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const color = (value, fallback) => /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(String(value)) || value === "none" ? value : fallback;

/** Normalize untrusted model output; images must be real cropped source regions. */
export async function normalizeReconstruction(raw, cropImage) {
  const width = Number(raw?.width), height = Number(raw?.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 40_000_000 || !Array.isArray(raw.nodes) || raw.nodes.length > MAX_NODES) throw new Error("Invalid reconstructed scene.");
  const nodes = [];
  for (const source of raw.nodes) {
    if (!source || !TYPES.has(source.type)) continue;
    const x = clamp(source.x, 0, width), y = clamp(source.y, 0, height);
    const w = clamp(source.w, 0, width - x), h = clamp(source.h, 0, height - y);
    const node = { type: source.type, x, y, w, h, fill: color(source.fill, "none"), stroke: color(source.stroke, "none"), strokeWidth: clamp(source.strokeWidth, 0, 50), rotation: clamp(source.rotation, -360, 360) };
    if (source.type === "text") {
      node.text = String(source.text ?? "").slice(0, 5000);
      node.fontSize = clamp(source.fontSize || 16, 4, 200);
      node.bold = Boolean(source.bold); node.italic = Boolean(source.italic);
      node.fill = color(source.fill, "#000000");
      if (!node.text.trim() || !w || !h) continue;
    } else if (source.type === "line") {
      node.x2 = clamp(source.x2, 0, width); node.y2 = clamp(source.y2, 0, height);
      node.arrow = Boolean(source.arrow); node.stroke = color(source.stroke, "#000000");
    } else if (source.type === "polyline") {
      node.points = String(source.points ?? "").slice(0, 20_000);
      if (!/^[\d.,\s+\-]+$/.test(node.points)) continue;
      node.closed = Boolean(source.closed);
    } else if (source.type === "path") {
      node.d = String(source.d ?? "").slice(0, 30_000);
      if (!/^[MmLlHhVvCcSsQqTtAaZz\d.,\s+\-eE]+$/.test(node.d)) continue;
    } else if (!w || !h) continue;
    if (source.type === "image") {
      if (w * h > width * height * 0.55 || typeof cropImage !== "function") continue;
      node.href = await cropImage({ x, y, w, h });
      if (!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(node.href)) continue;
    }
    nodes.push(node);
  }
  if (nodes.filter((node) => node.type !== "image").length < 6) throw new Error("Reconstruction identified fewer than six editable objects; retry with a stronger vision model.");
  return { canvas: { width, height }, nodes };
}

export function sceneToSvg(scene) {
  const { width, height } = scene.canvas;
  const body = scene.nodes.map((n) => {
    const common = `fill="${xml(n.fill)}" stroke="${xml(n.stroke)}" stroke-width="${number(n.strokeWidth)}"`;
    const transform = n.rotation ? ` transform="rotate(${n.rotation} ${n.x + n.w / 2} ${n.y + n.h / 2})"` : "";
    if (n.type === "text") {
      const lines = String(n.text).split(/\r?\n/).map((line, index) => `<tspan x="${n.x}" dy="${index ? '1.2em' : '0'}">${xml(line)}</tspan>`).join("");
      return `<text x="${n.x}" y="${n.y + n.fontSize}" font-size="${n.fontSize}" font-family="${xml(n.fontFamily || 'Arial')}" font-weight="${n.bold ? 'bold' : 'normal'}" font-style="${n.italic ? 'italic' : 'normal'}" fill="${xml(n.fill)}"${transform}>${lines}</text>`;
    }
    if (n.type === "rect") return `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" ${common}${transform}/>`;
    if (n.type === "ellipse") return `<ellipse cx="${n.x + n.w / 2}" cy="${n.y + n.h / 2}" rx="${n.w / 2}" ry="${n.h / 2}" ${common}${transform}/>`;
    if (n.type === "line") {
      const angle = Math.atan2(n.y2 - n.y, n.x2 - n.x), size = Math.max(6, number(n.strokeWidth) * 4);
      const arrow = n.arrow && (n.x !== n.x2 || n.y !== n.y2) ? `<path d="M ${n.x2} ${n.y2} L ${n.x2 - size * Math.cos(angle - Math.PI / 6)} ${n.y2 - size * Math.sin(angle - Math.PI / 6)} L ${n.x2 - size * Math.cos(angle + Math.PI / 6)} ${n.y2 - size * Math.sin(angle + Math.PI / 6)} Z" fill="${xml(n.stroke)}"/>` : "";
      return `<line x1="${n.x}" y1="${n.y}" x2="${n.x2}" y2="${n.y2}" ${common}/>${arrow}`;
    }
    if (n.type === "polyline") return `<${n.closed ? "polygon" : "polyline"} points="${xml(n.points)}" ${common}${transform}/>`;
    if (n.type === "path") return `<path d="${xml(n.d)}" ${common}${transform}/>`;
    if (n.type === "image") return `<image x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" href="${xml(n.href)}"/>`;
    return "";
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}
