const SVG_NS = "http://www.w3.org/2000/svg";
const ALLOWED_ELEMENTS = new Set(["svg", "g", "defs", "title", "desc", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "tspan", "linearGradient", "radialGradient", "stop", "marker", "clipPath", "mask", "pattern"]);
const ALLOWED_ATTRIBUTES = new Set(["id", "viewBox", "width", "height", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "d", "points", "fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "opacity", "transform", "font-family", "font-size", "font-weight", "font-style", "text-anchor", "dominant-baseline", "offset", "stop-color", "stop-opacity", "gradientUnits", "gradientTransform", "markerWidth", "markerHeight", "markerUnits", "refX", "refY", "orient", "marker-start", "marker-mid", "marker-end", "clip-path", "mask", "preserveAspectRatio"]);

/** Strip all active/external content before rendering or saving model output. */
export function sanitizeFigureSvg(input) {
  if (input.length > 1_000_000 || /<!DOCTYPE|<!ENTITY/i.test(input)) throw new Error("Unsafe SVG document.");
  const parsed = new DOMParser().parseFromString(input, "image/svg+xml");
  if (parsed.querySelector("parsererror") || parsed.documentElement.localName !== "svg" || parsed.documentElement.namespaceURI !== SVG_NS) throw new Error("The generated SVG is invalid.");
  for (const element of Array.from(parsed.querySelectorAll("*"))) {
    if (element.namespaceURI !== SVG_NS || !ALLOWED_ELEMENTS.has(element.localName)) { element.remove(); continue; }
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name === "xmlns" && element === parsed.documentElement) continue;
      const value = attribute.value;
      if (!ALLOWED_ATTRIBUTES.has(attribute.name) || /(?:https?:|file:|data:|javascript:|\\|@import|expression\s*\()/i.test(value) || (/url\s*\(/i.test(value) && !/^url\(#[A-Za-z_][\w:.-]*\)$/.test(value))) element.removeAttribute(attribute.name);
    }
  }
  return new XMLSerializer().serializeToString(parsed.documentElement);
}
