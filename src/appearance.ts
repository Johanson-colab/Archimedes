export type AppTheme = "charcoal" | "paper";
export type ThemePreset = AppTheme | "system";

export type AppearanceOverrides = {
  /** Optional accent override. Semantic tokens are derived from it. */
  accent?: string;
  /** Control corner radius in pixels. */
  controlRadius?: number;
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

/** CSS variables owned by the appearance layer. */
export const APPEARANCE_VARIABLES = [
  "--accent",
  "--accent-hover",
  "--focus-ring",
  "--resizer-accent",
  "--text-on-accent",
  "--accent-ink",
  "--radius-control",
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
      ...(clampControlRadius(overrides.controlRadius) !== undefined
        ? { controlRadius: clampControlRadius(overrides.controlRadius) }
        : {}),
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
  for (const variable of APPEARANCE_VARIABLES) root.style.removeProperty(variable);
  const values = {
    ...(settings.overrides.accent ? accentTokens(settings.overrides.accent, theme) : {}),
    ...(settings.overrides.controlRadius !== undefined ? radiusTokens(settings.overrides.controlRadius) : {}),
  };
  for (const [property, value] of Object.entries(values)) root.style.setProperty(property, value);
  return values;
}
