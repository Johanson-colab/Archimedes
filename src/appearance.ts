export type AppTheme = "charcoal" | "paper";
export type ThemePreset = AppTheme | "system";

export type Density = "compact" | "comfortable" | "spacious";

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

function channelLuminance(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((offset) => channelLuminance(parseInt(value.slice(offset, offset + 2), 16)));
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
    ...(settings.overrides.controlRadius !== undefined ? radiusTokens(settings.overrides.controlRadius) : {}),
    ...(settings.overrides.density ? densityTokens(settings.overrides.density) : {}),
  };
  for (const [property, value] of Object.entries(values)) root.style.setProperty(property, value);
  return values;
}
