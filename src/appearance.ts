export type AppTheme = "charcoal" | "paper";
export type ThemePreset = AppTheme | "system";

export type Density = "compact" | "comfortable" | "spacious";
export type SurfaceScope = "reader" | "writing" | "agent";
export const SURFACE_SCOPES: readonly SurfaceScope[] = ["reader", "writing", "agent"];

/** Accent and surface overrides that apply to one surface subtree. */
export type SurfaceAppearance = {
  accent?: string;
  surface?: string;
  surfaceDepth?: number;
};

export type ButtonStyle = "solid" | "soft" | "outline" | "ghost";
export type DialogStyle = "elevated" | "flat" | "outlined" | "glass";
export type ShapeStyle = "sharp" | "soft" | "rounded";
export type ShadowStyle = "default" | "none" | "subtle" | "deep";

export type AppearanceStyles = {
  button?: ButtonStyle;
  dialog?: DialogStyle;
  shape?: ShapeStyle;
  shadow?: ShadowStyle;
};

export type AppearanceOverrides = {
  /** Optional accent override. Semantic tokens are derived from it. */
  accent?: string;
  /** Optional base surface color. The surface ladder is derived from it. */
  surface?: string;
  /** Elevation depth of the derived surface ladder, 20–80. */
  surfaceDepth?: number;
  /** Control corner radius in pixels. */
  controlRadius?: number;
  /** Spacing density for controls, settings rows, and navigation. */
  density?: Density;
};

export type AppearanceSettings = {
  version: 1;
  preset: ThemePreset;
  overrides: AppearanceOverrides;
  surfaces?: Partial<Record<SurfaceScope, SurfaceAppearance>>;
  styles?: AppearanceStyles;
};

export const APPEARANCE_STORAGE_KEY = "archimedes-appearance-v2";
export const LEGACY_THEME_STORAGE_KEY = "archimedes-theme";

export const ACCENT_DEFAULT: Record<AppTheme, string> = {
  charcoal: "#c9a227",
  paper: "#8a5a24",
};

export const CONTROL_RADIUS_DEFAULT = 6;
export const CONTROL_RADIUS_MIN = 0;
export const CONTROL_RADIUS_MAX = 14;

export const SURFACE_DEFAULT: Record<AppTheme, string> = {
  charcoal: "#141110",
  paper: "#faf7f2",
};
export const SURFACE_DEPTH_DEFAULT = 50;
export const SURFACE_DEPTH_MIN = 20;
export const SURFACE_DEPTH_MAX = 80;
export const DENSITY_DEFAULT: Density = "comfortable";

/** CSS variables owned by the appearance layer. */
export const APPEARANCE_VARIABLES = [
  "--accent",
  "--accent-hover",
  "--focus-ring",
  "--resizer-accent",
  "--text-on-accent",
  "--accent-ink",
  "--radius-control",
  "--button-radius",
  "--button-secondary-radius",
  "--button-shadow",
  "--button-primary-bg",
  "--button-primary-ink",
  "--button-primary-border",
  "--button-primary-border-width",
  "--button-primary-hover-bg",
  "--button-secondary-bg",
  "--button-secondary-ink",
  "--button-secondary-border",
  "--button-secondary-border-width",
  "--button-secondary-hover-bg",
  "--button-secondary-hover-ink",
  "--button-secondary-hover-border",
  "--dialog-radius-lg",
  "--dialog-radius-md",
  "--dialog-radius-sm",
  "--dialog-shadow-lg",
  "--dialog-shadow-md",
  "--dialog-shadow-sm",
  "--dialog-border",
  "--dialog-border-strong",
  "--dialog-backdrop",
  "--dialog-bg",
  "--dialog-backdrop-filter",
  "--control-height",
  "--density-row-pad",
  "--density-row-min",
  "--density-nav-height",
  "--density-settings-nav-height",
  "--surface-ground",
  "--surface-canvas",
  "--surface-sidebar",
  "--surface-panel",
  "--surface-raised",
  "--surface-soft",
  "--surface-control",
  "--surface-control-active",
  "--border-default",
  "--border-soft",
  "--border-strong",
  "--text-primary",
  "--text-secondary",
  "--text-muted",
  "--text-faint",
  "--selected",
  "--selected-row",
  "--mono-canvas",
  "--mono-sidebar",
  "--mono-surface",
  "--mono-surface-raised",
  "--mono-control",
  "--mono-control-active",
  "--mono-border",
  "--mono-border-strong",
  "--mono-text",
  "--mono-text-soft",
  "--mono-text-muted",
] as const;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function defaultAppearance(): AppearanceSettings {
  return { version: 1, preset: "system", overrides: {} };
}

export function isAppTheme(value: unknown): value is AppTheme {
  return value === "charcoal" || value === "paper";
}

export function isThemePreset(value: unknown): value is ThemePreset {
  return isAppTheme(value) || value === "system";
}

export function normalizeAccent(value: unknown): string | undefined {
  return typeof value === "string" && HEX_COLOR.test(value) ? value.toLowerCase() : undefined;
}

export function clampControlRadius(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(CONTROL_RADIUS_MAX, Math.max(CONTROL_RADIUS_MIN, Math.round(value)));
}

export function clampSurfaceDepth(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(SURFACE_DEPTH_MAX, Math.max(SURFACE_DEPTH_MIN, Math.round(value)));
}

export function isDensity(value: unknown): value is Density {
  return value === "compact" || value === "comfortable" || value === "spacious";
}

export function isSurfaceScope(value: unknown): value is SurfaceScope {
  return value === "reader" || value === "writing" || value === "agent";
}

export function isButtonStyle(value: unknown): value is ButtonStyle {
  return value === "solid" || value === "soft" || value === "outline" || value === "ghost";
}

export function isDialogStyle(value: unknown): value is DialogStyle {
  return value === "elevated" || value === "flat" || value === "outlined" || value === "glass";
}

export function isShapeStyle(value: unknown): value is ShapeStyle {
  return value === "sharp" || value === "soft" || value === "rounded";
}

export function isShadowStyle(value: unknown): value is ShadowStyle {
  return value === "default" || value === "none" || value === "subtle" || value === "deep";
}

function normalizeStyles(input: unknown): AppearanceStyles | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = input as AppearanceStyles;
  const styles: AppearanceStyles = {
    ...(isButtonStyle(value.button) ? { button: value.button } : {}),
    ...(isDialogStyle(value.dialog) ? { dialog: value.dialog } : {}),
    ...(isShapeStyle(value.shape) ? { shape: value.shape } : {}),
    ...(isShadowStyle(value.shadow) ? { shadow: value.shadow } : {}),
  };
  return Object.keys(styles).length ? styles : undefined;
}

function normalizeSurfaceAppearance(input: unknown): SurfaceAppearance | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = input as Partial<SurfaceAppearance>;
  const normalized: SurfaceAppearance = {
    ...(normalizeAccent(value.accent) ? { accent: normalizeAccent(value.accent) } : {}),
    ...(normalizeAccent(value.surface) ? { surface: normalizeAccent(value.surface) } : {}),
    ...(clampSurfaceDepth(value.surfaceDepth) !== undefined ? { surfaceDepth: clampSurfaceDepth(value.surfaceDepth) } : {}),
  };
  return Object.keys(normalized).length ? normalized : undefined;
}

function normalizeSurfaces(input: unknown): Partial<Record<SurfaceScope, SurfaceAppearance>> | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = input as Record<string, unknown>;
  const surfaces: Partial<Record<SurfaceScope, SurfaceAppearance>> = {};
  for (const scope of SURFACE_SCOPES) {
    const normalized = normalizeSurfaceAppearance(value[scope]);
    if (normalized) surfaces[scope] = normalized;
  }
  return Object.keys(surfaces).length ? surfaces : undefined;
}

/**
 * Normalizes persisted or imported appearance settings. Invalid fields fall
 * back to the preset default instead of breaking the interface.
 */
export function normalizeAppearance(input: unknown, fallback: AppearanceSettings = defaultAppearance()): AppearanceSettings {
  if (!input || typeof input !== "object") return fallback;
  const value = input as Partial<AppearanceSettings> & { overrides?: unknown };
  const overrides = value.overrides && typeof value.overrides === "object"
    ? value.overrides as Partial<AppearanceOverrides>
    : {};
  const surfaces = normalizeSurfaces((value as AppearanceSettings).surfaces);
  const styles = normalizeStyles((value as AppearanceSettings).styles);
  return {
    version: 1,
    preset: isThemePreset(value.preset) ? value.preset : fallback.preset,
    overrides: {
      ...(normalizeAccent(overrides.accent) ? { accent: normalizeAccent(overrides.accent) } : {}),
      ...(normalizeAccent(overrides.surface) ? { surface: normalizeAccent(overrides.surface) } : {}),
      ...(clampSurfaceDepth(overrides.surfaceDepth) !== undefined
        ? { surfaceDepth: clampSurfaceDepth(overrides.surfaceDepth) }
        : {}),
      ...(clampControlRadius(overrides.controlRadius) !== undefined
        ? { controlRadius: clampControlRadius(overrides.controlRadius) }
        : {}),
      ...(isDensity(overrides.density) ? { density: overrides.density } : {}),
    },
    ...(surfaces ? { surfaces } : {}),
    ...(styles ? { styles } : {}),
  };
}

/** Reads the v2 setting, migrating the single legacy theme key if needed. */
export function readAppearance(storage: Pick<Storage, "getItem"> | undefined = typeof window === "undefined" ? undefined : window.localStorage): AppearanceSettings {
  if (!storage) return defaultAppearance();
  const raw = storage.getItem(APPEARANCE_STORAGE_KEY);
  if (raw) {
    try {
      return normalizeAppearance(JSON.parse(raw));
    } catch {
      // fall through to the legacy key
    }
  }
  const legacy = storage.getItem(LEGACY_THEME_STORAGE_KEY);
  return { version: 1, preset: isThemePreset(legacy) ? legacy : "system", overrides: {} };
}

export function writeAppearance(settings: AppearanceSettings, storage: Pick<Storage, "setItem"> | undefined = typeof window === "undefined" ? undefined : window.localStorage): void {
  if (!storage) return;
  const normalized = normalizeAppearance(settings);
  storage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(normalized));
  // Keep the legacy key in sync for downgrades and older tests.
  storage.setItem(LEGACY_THEME_STORAGE_KEY, normalized.preset);
}

export function resolveTheme(preset: ThemePreset, systemTheme: AppTheme): AppTheme {
  return preset === "system" ? systemTheme : preset;
}

type Rgb = [number, number, number];

function parseHexColor(value: string): Rgb | null {
  const hex = value.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  return [0, 2, 4].map((offset) => parseInt(hex.slice(1 + offset, 3 + offset), 16)) as Rgb;
}

function srgbToLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(channel: number): number {
  const value = channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(value * 255)));
}

function rgbToOklab([red, green, blue]: Rgb): Rgb {
  const r = srgbToLinear(red);
  const g = srgbToLinear(green);
  const b = srgbToLinear(blue);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb([lightness, a, b]: Rgb): Rgb {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const COLOR_MIX = /^color-mix\(in oklab,\s*(#[0-9a-fA-F]{6})\s+([\d.]+)%,\s*(#[0-9a-fA-F]{6})\s+([\d.]+)%\)$/;

/** Resolves the hex and two-stop OKLab color-mix values the token layer emits. */
export function resolveColor(value: string): Rgb | null {
  const hex = parseHexColor(value);
  if (hex) return hex;
  const match = value.match(COLOR_MIX);
  if (!match) return null;
  const first = parseHexColor(match[1]);
  const second = parseHexColor(match[3]);
  if (!first || !second) return null;
  const firstWeight = Number(match[2]);
  const secondWeight = Number(match[4]);
  const total = firstWeight + secondWeight;
  if (!Number.isFinite(total) || total <= 0) return null;
  const a = rgbToOklab(first);
  const b = rgbToOklab(second);
  const mix = a.map((channel, index) => (channel * firstWeight + b[index] * secondWeight) / total) as Rgb;
  return oklabToRgb(mix);
}

export function relativeLuminance(value: string): number {
  const rgb = resolveColor(value);
  if (!rgb) return 0;
  const channels = rgb.map((channel) => srgbToLinear(channel));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(left: string, right: string): number {
  const values = [relativeLuminance(left), relativeLuminance(right)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

/** Picks black or white ink for a custom accent, whichever has more contrast. */
export function accentInk(accent: string): string {
  return contrastRatio(accent, "#111111") >= contrastRatio(accent, "#ffffff") ? "#111111" : "#ffffff";
}

/**
 * Derives the accent token family from a single color. Hover moves toward
 * white on charcoal and toward black on paper, matching the built-in ramps.
 */
export function accentTokens(accent: string, theme: AppTheme): Record<string, string> {
  const normalized = normalizeAccent(accent);
  if (!normalized) return {};
  const ink = accentInk(normalized);
  // Move hover away from the ink so the label keeps its contrast.
  const hover = `color-mix(in oklab, ${normalized} 86%, ${ink === "#111111" ? "#ffffff" : "#000000"})`;
  return {
    "--accent": normalized,
    "--accent-hover": hover,
    "--focus-ring": normalized,
    "--resizer-accent": normalized,
    "--text-on-accent": ink,
    "--accent-ink": ink,
  };
}

export function radiusTokens(radius: number | undefined): Record<string, string> {
  const clamped = clampControlRadius(radius);
  return clamped === undefined ? {} : { "--radius-control": `${clamped}px` };
}

/** Spacing tokens for the three density presets. Comfortable is the default. */
export function densityTokens(density: Density | undefined): Record<string, string> {
  if (density === "compact") {
    return {
      "--control-height": "28px",
      "--density-row-pad": "11px",
      "--density-row-min": "56px",
      "--density-nav-height": "28px",
      "--density-settings-nav-height": "30px",
    };
  }
  if (density === "spacious") {
    return {
      "--control-height": "38px",
      "--density-row-pad": "20px",
      "--density-row-min": "80px",
      "--density-nav-height": "36px",
      "--density-settings-nav-height": "38px",
    };
  }
  return {};
}

/**
 * Maps style presets to component token overrides. Unset or default styles
 * return no variables, so the shipped geometry stays pixel-identical.
 */
export function styleTokens(styles: AppearanceStyles | undefined, theme: AppTheme): Record<string, string> {
  if (!styles) return {};
  const tokens: Record<string, string> = {};

  if (styles.shape === "sharp") {
    Object.assign(tokens, {
      "--radius-control": "2px",
      "--button-radius": "2px",
      "--button-secondary-radius": "2px",
      "--dialog-radius-lg": "6px",
      "--dialog-radius-md": "5px",
      "--dialog-radius-sm": "4px",
    });
  }
  if (styles.shape === "rounded") {
    Object.assign(tokens, {
      "--radius-control": "12px",
      "--button-radius": "12px",
      "--button-secondary-radius": "10px",
      "--dialog-radius-lg": "20px",
      "--dialog-radius-md": "16px",
      "--dialog-radius-sm": "14px",
    });
  }

  if (styles.shadow === "none") {
    Object.assign(tokens, {
      "--button-shadow": "none",
      "--dialog-shadow-lg": "none",
      "--dialog-shadow-md": "none",
      "--dialog-shadow-sm": "none",
    });
  }
  if (styles.shadow === "subtle") {
    Object.assign(tokens, theme === "paper" ? {
      "--button-shadow": "0 1px 2px rgba(59, 53, 46, .12)",
      "--dialog-shadow-lg": "0 18px 48px rgba(59, 53, 46, .14)",
      "--dialog-shadow-md": "0 16px 40px rgba(59, 53, 46, .16)",
      "--dialog-shadow-sm": "0 12px 32px rgba(59, 53, 46, .12)",
    } : {
      "--button-shadow": "0 1px 2px rgba(0, 0, 0, .16)",
      "--dialog-shadow-lg": "0 18px 48px rgba(0, 0, 0, .26)",
      "--dialog-shadow-md": "0 16px 40px rgba(0, 0, 0, .28)",
      "--dialog-shadow-sm": "0 12px 32px rgba(0, 0, 0, .2)",
    });
  }
  if (styles.shadow === "deep") {
    Object.assign(tokens, theme === "paper" ? {
      "--button-shadow": "0 6px 18px rgba(59, 53, 46, .18)",
      "--dialog-shadow-lg": "0 44px 120px rgba(59, 53, 46, .24)",
      "--dialog-shadow-md": "0 36px 100px rgba(59, 53, 46, .26)",
      "--dialog-shadow-sm": "0 28px 80px rgba(59, 53, 46, .22)",
    } : {
      "--button-shadow": "0 6px 18px rgba(0, 0, 0, .32)",
      "--dialog-shadow-lg": "0 44px 120px rgba(0, 0, 0, .5)",
      "--dialog-shadow-md": "0 36px 100px rgba(0, 0, 0, .52)",
      "--dialog-shadow-sm": "0 28px 80px rgba(0, 0, 0, .42)",
    });
  }

  if (styles.button === "soft") {
    Object.assign(tokens, {
      "--button-primary-bg": "color-mix(in oklab, var(--accent) 14%, transparent)",
      "--button-primary-ink": "var(--accent)",
      "--button-primary-border": "color-mix(in oklab, var(--accent) 32%, transparent)",
      "--button-primary-border-width": "1px",
      "--button-primary-hover-bg": "color-mix(in oklab, var(--accent) 22%, transparent)",
      "--button-secondary-bg": "var(--surface-raised)",
      "--button-secondary-ink": "var(--text-primary)",
      "--button-secondary-border": "var(--border-default)",
      "--button-secondary-hover-bg": "var(--surface-soft)",
      "--button-secondary-hover-ink": "var(--text-primary)",
      "--button-secondary-hover-border": "var(--border-strong)",
    });
  }
  if (styles.button === "outline") {
    Object.assign(tokens, {
      "--button-primary-bg": "transparent",
      "--button-primary-ink": "var(--accent)",
      "--button-primary-border": "var(--accent)",
      "--button-primary-border-width": "1px",
      "--button-primary-hover-bg": "color-mix(in oklab, var(--accent) 12%, transparent)",
      "--button-secondary-bg": "transparent",
      "--button-secondary-ink": "var(--text-secondary)",
      "--button-secondary-border": "var(--border-default)",
      "--button-secondary-hover-bg": "var(--surface-raised)",
      "--button-secondary-hover-ink": "var(--text-primary)",
      "--button-secondary-hover-border": "var(--border-strong)",
    });
  }
  if (styles.button === "ghost") {
    Object.assign(tokens, {
      "--button-primary-bg": "transparent",
      "--button-primary-ink": "var(--text-primary)",
      "--button-primary-border": "transparent",
      "--button-primary-border-width": "0",
      "--button-primary-hover-bg": "var(--surface-raised)",
      "--button-secondary-bg": "transparent",
      "--button-secondary-ink": "var(--text-muted)",
      "--button-secondary-border": "transparent",
      "--button-secondary-border-width": "0",
      "--button-secondary-hover-bg": "var(--surface-soft)",
      "--button-secondary-hover-ink": "var(--text-primary)",
      "--button-secondary-hover-border": "transparent",
    });
  }

  if (styles.dialog === "flat") {
    Object.assign(tokens, {
      "--dialog-shadow-lg": "none",
      "--dialog-shadow-md": "none",
      "--dialog-shadow-sm": "none",
    });
  }
  if (styles.dialog === "outlined") {
    Object.assign(tokens, {
      "--dialog-shadow-lg": "none",
      "--dialog-shadow-md": "none",
      "--dialog-shadow-sm": "none",
      "--dialog-border": "var(--border-strong)",
      "--dialog-border-strong": "var(--border-strong)",
    });
  }
  if (styles.dialog === "glass") {
    Object.assign(tokens, {
      "--dialog-bg": "color-mix(in oklab, var(--surface-panel) 84%, transparent)",
      "--dialog-border": "color-mix(in oklab, var(--border-default) 70%, transparent)",
      "--dialog-border-strong": "color-mix(in oklab, var(--border-default) 70%, transparent)",
      "--dialog-backdrop": "color-mix(in oklab, #000000 55%, transparent)",
      "--dialog-backdrop-filter": "blur(18px) saturate(1.12)",
    });
  }

  return tokens;
}

function mix(base: string, toward: string, percent: number): string {
  const step = Math.max(0, Math.min(40, Math.round(percent)));
  return `color-mix(in oklab, ${base} ${100 - step}%, ${toward} ${step}%)`;
}

/**
 * Derives the surface ladder, borders, text, and the parallel mono palette
 * from one base color. Light bases go darker for elevation, dark bases go
 * lighter; the panel always lifts toward white so it reads above the ground.
 */
export function surfaceTokens(surface: string, depth: number | undefined, theme: AppTheme): Record<string, string> {
  const base = normalizeAccent(surface);
  if (!base) return {};
  const light = relativeLuminance(base) > 0.38;
  const toward = light ? "#000000" : "#ffffff";
  const scale = clampSurfaceDepth(depth ?? SURFACE_DEPTH_DEFAULT)! / SURFACE_DEPTH_DEFAULT;
  const step = (percent: number) => mix(base, toward, percent * scale);
  const lift = (percent: number) => mix(base, "#ffffff", percent * scale);

  const canvas = step(light ? 2 : 4);
  const panel = lift(light ? 2 : 4);
  const raised = step(light ? 3 : 7);
  const soft = step(light ? 5 : 10);
  const border = step(light ? 9 : 14);
  const borderSoft = step(light ? 6 : 10);
  const borderStrong = step(light ? 13 : 19);
  const control = raised;
  const controlActive = soft;
  const ink = light ? "#111111" : "#f7f5ef";
  const textPrimary = mix(ink, base, 12);
  const textSecondary = mix(ink, base, 28);
  const textMuted = mix(ink, base, 44);
  const textFaint = mix(ink, base, 58);

  return {
    "--surface-ground": base,
    "--surface-canvas": canvas,
    "--surface-sidebar": canvas,
    "--surface-panel": panel,
    "--surface-raised": raised,
    "--surface-soft": soft,
    "--surface-control": control,
    "--surface-control-active": controlActive,
    "--border-default": border,
    "--border-soft": borderSoft,
    "--border-strong": borderStrong,
    "--text-primary": textPrimary,
    "--text-secondary": textSecondary,
    "--text-muted": textMuted,
    "--text-faint": textFaint,
    "--selected": soft,
    "--selected-row": raised,
    "--mono-canvas": canvas,
    "--mono-sidebar": canvas,
    "--mono-surface": panel,
    "--mono-surface-raised": raised,
    "--mono-control": control,
    "--mono-control-active": controlActive,
    "--mono-border": border,
    "--mono-border-strong": borderStrong,
    "--mono-text": textPrimary,
    "--mono-text-soft": textSecondary,
    "--mono-text-muted": textMuted,
  };
}

export type AppearanceRoot = {
  dataset: Record<string, string | undefined>;
  style: {
    setProperty: (property: string, value: string) => void;
    removeProperty: (property: string) => void;
  };
};

export const SURFACE_STYLE_ID = "archimedes-appearance-surfaces";

/**
 * Builds the scoped stylesheet for per-surface overrides. The rule targets the
 * wrapper that owns the surface, so the values beat inherited root variables
 * without touching the global appearance.
 */
export function surfaceCss(settings: AppearanceSettings, theme: AppTheme): string {
  const rules: string[] = [];
  for (const scope of SURFACE_SCOPES) {
    const scoped = settings.surfaces?.[scope];
    if (!scoped) continue;
    const values = {
      ...(scoped.accent ? accentTokens(scoped.accent, theme) : {}),
      ...(scoped.surface ? surfaceTokens(scoped.surface, scoped.surfaceDepth, theme) : {}),
    };
    if (!Object.keys(values).length) continue;
    const body = Object.entries(values).map(([property, value]) => `  ${property}: ${value};`).join("\n");
    rules.push(`[data-surface="${scope}"] {\n${body}\n}`);
  }
  return rules.join("\n\n");
}

/**
 * Applies the resolved appearance to the document element. Inline variables
 * are always cleared first so resetting an override restores tokens.css.
 */
export function applyAppearance(root: AppearanceRoot, settings: AppearanceSettings, theme: AppTheme): Record<string, string> {
  root.dataset.theme = theme;
  root.dataset.density = settings.overrides.density ?? DENSITY_DEFAULT;
  for (const variable of APPEARANCE_VARIABLES) root.style.removeProperty(variable);
  const values = {
    ...(settings.overrides.accent ? accentTokens(settings.overrides.accent, theme) : {}),
    ...(settings.overrides.surface ? surfaceTokens(settings.overrides.surface, settings.overrides.surfaceDepth, theme) : {}),
    ...styleTokens(settings.styles, theme),
    ...(settings.overrides.controlRadius !== undefined ? radiusTokens(settings.overrides.controlRadius) : {}),
    ...(settings.overrides.density ? densityTokens(settings.overrides.density) : {}),
  };
  for (const [property, value] of Object.entries(values)) root.style.setProperty(property, value);

  const document = (root as AppearanceRoot & { ownerDocument?: Document }).ownerDocument;
  if (document?.head) {
    let style = document.getElementById(SURFACE_STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = SURFACE_STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = surfaceCss(settings, theme);
  }
  return values;
}

export type ContrastIssue = {
  scope: "global" | SurfaceScope;
  pair: string;
  ratio: number;
  minimum: number;
};

const TEXT_CONTRAST_PAIRS: ReadonlyArray<readonly [string, string, number]> = [
  ["--text-primary", "--surface-panel", 4.5],
  ["--text-primary", "--surface-ground", 4.5],
  ["--text-secondary", "--surface-ground", 4.5],
  ["--text-muted", "--surface-ground", 3],
];

/**
 * Checks the token pairs that can actually be affected by an override. Preset
 * palettes are trusted; only custom surfaces and accents are measured.
 */
export function contrastIssues(settings: AppearanceSettings, theme: AppTheme): ContrastIssue[] {
  const issues: ContrastIssue[] = [];
  const scopes: Array<"global" | SurfaceScope> = ["global", ...SURFACE_SCOPES];
  for (const scope of scopes) {
    const source = scope === "global" ? settings.overrides : settings.surfaces?.[scope];
    if (!source) continue;
    const ownsSurface = Boolean(source.surface);
    const surface = source.surface ?? (scope === "global" ? undefined : settings.overrides.surface);
    const depth = source.surfaceDepth ?? settings.overrides.surfaceDepth;
    const accent = source.accent ?? (scope === "global" ? settings.overrides.accent : undefined);
    const tokens = {
      ...(surface ? surfaceTokens(surface, depth, theme) : {}),
      ...(accent ? accentTokens(accent, theme) : {}),
    };
    if (ownsSurface) {
      for (const [foreground, background, minimum] of TEXT_CONTRAST_PAIRS) {
        const foregroundValue = tokens[foreground];
        const backgroundValue = tokens[background];
        if (!foregroundValue || !backgroundValue) continue;
        const ratio = contrastRatio(foregroundValue, backgroundValue);
        if (ratio < minimum) issues.push({ scope, pair: `${foreground} on ${background}`, ratio, minimum });
      }
    }
    if (source.accent && tokens["--accent"] && tokens["--text-on-accent"]) {
      const ratio = contrastRatio(tokens["--text-on-accent"], tokens["--accent"]);
      if (ratio < 4.5) issues.push({ scope, pair: "--text-on-accent on --accent", ratio, minimum: 4.5 });
    }
    if (ownsSurface && tokens["--surface-panel"]) {
      const effectiveAccent = source.accent ?? settings.overrides.accent ?? ACCENT_DEFAULT[theme];
      const accentRatio = contrastRatio(effectiveAccent, tokens["--surface-panel"]);
      if (accentRatio < 3) issues.push({ scope, pair: "--accent on --surface-panel", ratio: accentRatio, minimum: 3 });
      if ((settings.styles?.button === "soft" || settings.styles?.button === "outline") && accentRatio < 4.5) {
        issues.push({ scope, pair: "--accent on button", ratio: accentRatio, minimum: 4.5 });
      }
    }
  }
  return issues;
}

/* -------------------------------------------------------------------------- */
/* Theme packs                                                                */
/* -------------------------------------------------------------------------- */

export type ThemePack = {
  schemaVersion: 2;
  id: string;
  name: string;
  preset: ThemePreset;
  overrides: AppearanceOverrides;
  surfaces?: Partial<Record<SurfaceScope, SurfaceAppearance>>;
  styles?: AppearanceStyles;
};

function slugify(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "archimedes-theme";
}

/** Serializes the current appearance into a shareable pack. */
export function toThemePack(settings: AppearanceSettings, name = "Archimedes theme"): ThemePack {
  const normalized = normalizeAppearance(settings);
  const trimmed = name.trim() || "Archimedes theme";
  return {
    schemaVersion: 2,
    id: slugify(trimmed),
    name: trimmed,
    preset: normalized.preset,
    overrides: normalized.overrides,
    ...(normalized.surfaces ? { surfaces: normalized.surfaces } : {}),
    ...(normalized.styles ? { styles: normalized.styles } : {}),
  };
}

/** Validates an imported pack and normalizes every token value. */
export function parseThemePack(input: unknown): ThemePack {
  if (!input || typeof input !== "object") throw new Error("Theme pack must be a JSON object.");
  const value = input as Partial<ThemePack>;
  const schemaVersion = (input as { schemaVersion?: unknown }).schemaVersion;
  if (schemaVersion !== 1 && schemaVersion !== 2) throw new Error("Unsupported theme pack version.");
  if (typeof value.name !== "string" || !value.name.trim()) throw new Error("Theme pack needs a name.");
  if (!isThemePreset(value.preset)) throw new Error("Theme pack has an invalid preset.");
  const normalized = normalizeAppearance({
    preset: value.preset,
    overrides: value.overrides,
    surfaces: value.surfaces,
    styles: value.styles,
  });
  return {
    schemaVersion: 2,
    id: typeof value.id === "string" && value.id.trim() ? slugify(value.id) : slugify(value.name),
    name: value.name.trim(),
    preset: normalized.preset,
    overrides: normalized.overrides,
    ...(normalized.surfaces ? { surfaces: normalized.surfaces } : {}),
    ...(normalized.styles ? { styles: normalized.styles } : {}),
  };
}

export function themePackSettings(pack: ThemePack): AppearanceSettings {
  return {
    version: 1,
    preset: pack.preset,
    overrides: pack.overrides,
    ...(pack.surfaces ? { surfaces: pack.surfaces } : {}),
    ...(pack.styles ? { styles: pack.styles } : {}),
  };
}
