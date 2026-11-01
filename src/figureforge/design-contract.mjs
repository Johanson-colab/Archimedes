// Design contract: the measurable visual grammar distilled from the chosen
// reference figures. The reference set is the same one the reader sees, so the
// contract is the only place where "learn from these figures" becomes numbers a
// generator can actually follow: panel topology, palette hex, type scale,
// stroke weights and density counts.
//
// `normalizeDesignContract` is shared by the main process (validating model
// output) and the renderer (validating user edits), so neither side can drift.

export const CONTRACT_VERSION = 1;

const HEX = /^#[0-9a-f]{6}$/i;
const MAX_TEXT = 1200;

const EMPTY_PALETTE = () => ({ background: "", primary: "", accent: "", neutral: "", others: [] });
const EMPTY_TYPOGRAPHY = () => ({ title: 0, panelHeader: 0, label: 0, note: 0 });
const EMPTY_STROKES = () => ({ box: 0, arrow: 0, connector: 0 });
const EMPTY_DENSITY = () => ({ panels: 0, modulesPerPanel: 0, connectors: 0 });

export function emptyDesignContract() {
  return {
    version: CONTRACT_VERSION,
    layout: "",
    panels: [],
    elements: "",
    palette: EMPTY_PALETTE(),
    typography: EMPTY_TYPOGRAPHY(),
    strokes: EMPTY_STROKES(),
    density: EMPTY_DENSITY(),
    hierarchy: "",
    caveats: "",
  };
}

function text(value, max = MAX_TEXT) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function hex(value) {
  return typeof value === "string" && HEX.test(value.trim()) ? value.trim().toLowerCase() : "";
}

function integer(value, min, max) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 0;
}

/** A panel is only useful if it has a name or a role; geometry is optional. */
function normalizePanels(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map((panel) => {
    if (!panel || typeof panel !== "object") return null;
    const normalized = {
      name: text(panel.name, 120),
      role: text(panel.role, 240),
      x: integer(panel.x, 0, 1600),
      y: integer(panel.y, 0, 900),
      w: integer(panel.w, 0, 1600),
      h: integer(panel.h, 0, 900),
    };
    return normalized.name || normalized.role ? normalized : null;
  }).filter(Boolean);
}

/**
 * Coerce anything the model returns into a contract with known bounds.
 * Invalid values are dropped rather than rejected: a model that omits the
 * palette should still produce a usable figure plan, not an error dialog.
 */
export function normalizeDesignContract(raw) {
  const base = emptyDesignContract();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const palette = raw.palette && typeof raw.palette === "object" && !Array.isArray(raw.palette) ? raw.palette : {};
  const typography = raw.typography && typeof raw.typography === "object" ? raw.typography : {};
  const strokes = raw.strokes && typeof raw.strokes === "object" ? raw.strokes : {};
  const density = raw.density && typeof raw.density === "object" ? raw.density : {};
  return {
    version: CONTRACT_VERSION,
    layout: text(raw.layout),
    panels: normalizePanels(raw.panels),
    elements: text(raw.elements),
    palette: {
      background: hex(palette.background),
      primary: hex(palette.primary),
      accent: hex(palette.accent),
      neutral: hex(palette.neutral),
      others: Array.isArray(palette.others) ? [...new Set(palette.others.map(hex).filter(Boolean))].slice(0, 6) : [],
    },
    typography: {
      title: integer(typography.title, 8, 96),
      panelHeader: integer(typography.panelHeader, 8, 96),
      label: integer(typography.label, 8, 96),
      note: integer(typography.note, 6, 96),
    },
    strokes: {
      box: integer(strokes.box, 1, 12),
      arrow: integer(strokes.arrow, 1, 12),
      connector: integer(strokes.connector, 1, 12),
    },
    density: {
      panels: integer(density.panels, 1, 12),
      modulesPerPanel: integer(density.modulesPerPanel, 1, 40),
      connectors: integer(density.connectors, 0, 40),
    },
    hierarchy: text(raw.hierarchy),
    caveats: text(raw.caveats),
  };
}

/** Whether the contract carries enough evidence to steer a generation. */
export function contractIsUsable(contract) {
  if (!contract || typeof contract !== "object") return false;
  const hasLayout = typeof contract.layout === "string" && contract.layout.trim().length > 0;
  const hasPalette = Boolean(contract.palette && (contract.palette.primary || contract.palette.accent));
  const hasPanels = Array.isArray(contract.panels) && contract.panels.length > 0;
  return hasLayout && (hasPalette || hasPanels);
}

function paletteLine(palette) {
  if (!palette) return "";
  const named = ["background", "primary", "accent", "neutral"].filter((key) => palette[key]).map((key) => `${key}=${palette[key]}`);
  const others = Array.isArray(palette.others) && palette.others.length ? `others=${palette.others.join(", ")}` : "";
  return [...named, others].filter(Boolean).join(", ");
}

function typeScale(typography) {
  if (!typography) return "";
  return ["title", "panelHeader", "label", "note"].filter((key) => typography[key]).map((key) => `${key} ${typography[key]}px`).join(", ");
}

function strokeScale(strokes) {
  if (!strokes) return "";
  return ["box", "arrow", "connector"].filter((key) => strokes[key]).map((key) => `${key} ${strokes[key]}px`).join(", ");
}

function panelList(panels) {
  if (!Array.isArray(panels) || !panels.length) return "";
  return panels.map((panel, index) => {
    const label = [panel.name, panel.role].filter(Boolean).join(" / ");
    const geometry = panel.w && panel.h ? ` x=${panel.x} y=${panel.y} w=${panel.w} h=${panel.h}` : "";
    return `${index + 1}. ${label}${geometry}`;
  }).join(" | ");
}

function densityLine(density) {
  if (!density) return "";
  const bits = [];
  if (density.panels) bits.push(`${density.panels} panels`);
  if (density.modulesPerPanel) bits.push(`${density.modulesPerPanel} modules per panel`);
  if (density.connectors) bits.push(`${density.connectors} connectors`);
  return bits.join(", ");
}

/**
 * Precise rendering for the SVG path, where every value can be audited against
 * the produced markup. Structure first, then measured values.
 */
export function renderDesignContract(contract) {
  if (!contract) return "";
  const rows = [
    "- layout authority: no single reference is a master. Synthesize the recurring panel divisions, density, element vocabulary, palette, stroke language and hierarchy into a fresh composition.",
  ];
  if (contract.layout) rows.push(`- canvas and panel division: ${contract.layout}`);
  const panels = panelList(contract.panels);
  if (panels) rows.push(`- panel geometry (canvas 1600x900, origin top-left): ${panels}`);
  const palette = paletteLine(contract.palette);
  if (palette) rows.push(`- palette (use these exact hex values): ${palette}`);
  const type = typeScale(contract.typography);
  if (type) rows.push(`- type scale (px on a 1600x900 canvas): ${type}`);
  const strokes = strokeScale(contract.strokes);
  if (strokes) rows.push(`- stroke widths: ${strokes}`);
  const density = densityLine(contract.density);
  if (density) rows.push(`- density targets: ${density}`);
  if (contract.elements) rows.push(`- recurring elements: ${contract.elements}`);
  if (contract.hierarchy) rows.push(`- information hierarchy: ${contract.hierarchy}`);
  if (contract.caveats) rows.push(`- measurement caveats: ${contract.caveats}`);
  rows.push("- composition priority: keep the shared topology and fill every module region; no conspicuous empty panels.");
  return rows.join("\n");
}

/**
 * Prose rendering for the bitmap path. Image models ignore coordinates but do
 * follow panel counts, palette and stroke weight, so this drops geometry and
 * keeps the properties they actually render.
 */
export function renderImageGuide(contract) {
  if (!contract) return "";
  const rows = [
    "Merge the shared visual grammar of the reference figures. Preserve the recurring panel structure, density, palette and stroke language; create a new composition instead of copying one figure.",
  ];
  if (contract.layout) rows.push(`Panel structure: ${contract.layout}`);
  const names = Array.isArray(contract.panels) ? contract.panels.map((panel) => [panel.name, panel.role].filter(Boolean).join(": ")).filter(Boolean) : [];
  if (names.length) rows.push(`Panels: ${names.join(" | ")}`);
  const density = densityLine(contract.density);
  if (density) rows.push(`Density: ${density}.`);
  const palette = paletteLine(contract.palette);
  if (palette) rows.push(`Palette: ${palette}.`);
  const type = typeScale(contract.typography);
  if (type) rows.push(`Type hierarchy, largest to smallest: ${type}.`);
  const strokes = strokeScale(contract.strokes);
  if (strokes) rows.push(`Stroke weights: ${strokes}.`);
  if (contract.elements) rows.push(`Element vocabulary: ${contract.elements}`);
  if (contract.hierarchy) rows.push(`Information hierarchy: ${contract.hierarchy}`);
  if (contract.caveats) rows.push(`Caveats: ${contract.caveats}`);
  return rows.join("\n");
}
