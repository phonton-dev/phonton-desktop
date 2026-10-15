import { useSyncExternalStore } from "react";
import { DEFAULT_THEME, inkFor, isDark, mix, paletteOf, parseThemeSettings, PRESETS, type ThemeSettings } from "./palette";
import { shadcnVars } from "./shadcn-map";

export { PRESETS as themePresets } from "./palette";
export type { Density, FontChoice, Palette, ThemeId, ThemeSettings } from "./palette";

const STORAGE_KEY = "phonton.theme.v2";
/** Pre-0.5 key holding only a preset id. Read once for migration. */
const LEGACY_KEY = "phonton.theme";

export const MONO_STACK = `ui-monospace, "Cascadia Code", "Cascadia Mono", "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", "Liberation Mono", monospace`;
const SANS_STACK = `system-ui, "Segoe UI", "Helvetica Neue", Arial, sans-serif`;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function loadTheme(): ThemeSettings {
  return parseThemeSettings(read(STORAGE_KEY), read(LEGACY_KEY));
}

let current: ThemeSettings = DEFAULT_THEME;
const listeners = new Set<() => void>();

/** Write the theme's CSS variables to the document root. */
export function applyTheme(settings: ThemeSettings) {
  const p = paletteOf(settings);
  const vars: Record<string, string> = {
    "--ph-bg": p.bg,
    "--ph-surface": p.surface,
    "--ph-surface-2": mix(p.surface, p.fg, 0.07),
    "--ph-line": p.line,
    "--ph-fg": p.fg,
    "--ph-muted": p.muted,
    "--ph-faint": mix(p.muted, p.bg, 0.25),
    "--ph-accent": p.accent,
    "--ph-accent-2": p.accent2,
    "--ph-accent-ink": inkFor(p.accent),
    "--ph-selection": mix(p.bg, p.accent, 0.32),
    "--ph-ok": p.ok,
    "--ph-warn": p.warn,
    "--ph-danger": p.danger,
    "--ph-font-ui": settings.font === "sans" ? SANS_STACK
      : settings.font === "custom" && settings.fontFamily ? `"${settings.fontFamily}", ${MONO_STACK}` : MONO_STACK,
    ...shadcnVars(p),
  };
  const root = document.documentElement;
  for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value);
  const dark = isDark(p.bg);
  root.dataset.theme = settings.custom ? "custom" : settings.preset;
  root.dataset.density = settings.density;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

/** Apply, persist and broadcast a theme change. */
export function setTheme(settings: ThemeSettings) {
  current = settings;
  applyTheme(settings);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    localStorage.removeItem(LEGACY_KEY);
  } catch { /* The theme still applies for this session. */ }
  listeners.forEach(listener => listener());
}

/** Apply the stored theme. Call once before the first render. */
export function initTheme() {
  current = loadTheme();
  applyTheme(current);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme(): ThemeSettings {
  return useSyncExternalStore(subscribe, () => current);
}

/** Pick a preset and drop any custom colors. Density and font stay. */
export function choosePreset(id: ThemeSettings["preset"]) {
  setTheme({ ...current, preset: id, custom: null, name: null });
}

export const presetLabel = (id: ThemeSettings["preset"]) => PRESETS.find(p => p.id === id)?.label ?? id;
