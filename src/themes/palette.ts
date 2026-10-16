// Pure theme data and parsing. No DOM or storage access, so node tests can
// load this file on its own.

/** The ten colors every theme is built from. Values are `#rrggbb`. */
export type Palette = {
  bg: string;
  surface: string;
  line: string;
  fg: string;
  muted: string;
  accent: string;
  accent2: string;
  ok: string;
  warn: string;
  danger: string;
};

export type ThemeId = "nebula" | "graphite" | "light" | "high-contrast";
export type Density = "compact" | "comfortable";
export type FontChoice = "mono" | "sans" | "custom";

export type ThemeSettings = {
  preset: ThemeId;
  /** Edited or imported colors. `null` uses the preset's palette. */
  custom: Palette | null;
  /** Name of an imported or exported custom theme. */
  name: string | null;
  density: Density;
  font: FontChoice;
  /** A locally installed font family, used when `font` is `custom`. */
  fontFamily: string;
};

export const PALETTE_KEYS: (keyof Palette)[] = ["bg", "surface", "line", "fg", "muted", "accent", "accent2", "ok", "warn", "danger"];

export const PRESETS: { id: ThemeId; label: string; palette: Palette }[] = [
  {
    id: "nebula",
    label: "Nebula",
    palette: { bg: "#0a0b0d", surface: "#121418", line: "#2a2e35", fg: "#e4e6e9", muted: "#9aa1ab", accent: "#2ec9b4", accent2: "#5ed4f7", ok: "#6ee09a", warn: "#e8c06a", danger: "#ff8a82" },
  },
  {
    id: "graphite",
    label: "Graphite",
    palette: { bg: "#1e1e1e", surface: "#252526", line: "#3c3c3c", fg: "#d4d4d4", muted: "#a0a0a0", accent: "#4ea8ff", accent2: "#4ec9b0", ok: "#89d185", warn: "#d7ba7d", danger: "#f48771" },
  },
  {
    id: "light",
    label: "Light",
    palette: { bg: "#f6f7f9", surface: "#ffffff", line: "#d3d8df", fg: "#15181e", muted: "#555d6b", accent: "#0b7a6e", accent2: "#0369a1", ok: "#15803d", warn: "#9a5b00", danger: "#c0262d" },
  },
  {
    id: "high-contrast",
    label: "High contrast",
    palette: { bg: "#000000", surface: "#0d0d0d", line: "#ffffff", fg: "#ffffff", muted: "#d4d4d4", accent: "#ffff00", accent2: "#00ffff", ok: "#00ff00", warn: "#ffaa00", danger: "#ff6b6b" },
  },
];

export const DEFAULT_THEME: ThemeSettings = { preset: "nebula", custom: null, name: null, density: "comfortable", font: "mono", fontFamily: "" };

// ---------------------------------------------------------------- colors

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Normalize `#abc`, `abc`, `#AABBCC` or `aabbcc` to `#aabbcc`; `null` if invalid. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = HEX.exec(value.trim());
  if (!match) return null;
  const hex = match[1].length === 3 ? [...match[1]].map(c => c + c).join("") : match[1];
  return `#${hex.toLowerCase()}`;
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(channels: number[]): string {
  return `#${channels.map(c => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;
}

/** Blend `a` toward `b` by `amount` (0 keeps `a`, 1 gives `b`). */
export function mix(a: string, b: string, amount: number): string {
  const [x, y] = [rgb(a), rgb(b)];
  return toHex(x.map((c, i) => c + (y[i] - c) * amount));
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio between two colors, from 1 to 21. */
export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

export function isDark(hex: string): boolean {
  return luminance(hex) < 0.2;
}

/** Text color that reads on top of `hex`. */
export function inkFor(hex: string): string {
  return contrast(hex, "#000000") >= contrast(hex, "#ffffff") ? "#000000" : "#ffffff";
}

/** `fg` blended toward `bg` as far as it can go while keeping `min` contrast. */
function readableMix(fg: string, bg: string, amount: number, min = 4.5): string {
  for (let a = amount; a > 0; a -= 0.05) {
    const candidate = mix(fg, bg, a);
    if (contrast(candidate, bg) >= min) return candidate;
  }
  return fg;
}

/** First color with at least `min` contrast on `bg`, else the first one given. */
function firstReadable(bg: string, colors: (string | undefined)[], min = 3): string | undefined {
  const present = colors.filter((c): c is string => !!c);
  return present.find(c => contrast(c, bg) >= min) ?? present[0];
}

// ---------------------------------------------------------- persistence

export function paletteOf(settings: ThemeSettings): Palette {
  return settings.custom ?? PRESETS.find(p => p.id === settings.preset)?.palette ?? PRESETS[0].palette;
}

function parsePalette(value: unknown): Palette | null {
  if (!value || typeof value !== "object") return null;
  const out: Partial<Palette> = {};
  for (const key of PALETTE_KEYS) {
    const hex = normalizeHex((value as Record<string, unknown>)[key]);
    if (!hex) return null;
    out[key] = hex;
  }
  return out as Palette;
}

const FONT_FAMILY = /^[\p{L}\p{N} _.-]{1,48}$/u;

/** Keep a font family name only if it cannot break out of a CSS string. */
export function safeFontFamily(value: unknown): string {
  return typeof value === "string" && FONT_FAMILY.test(value.trim()) ? value.trim() : "";
}

function cleanName(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 60) : null;
}

/**
 * Read stored settings. Anything malformed falls back to the default for that
 * field, so a bad value never blocks startup. `legacy` is the pre-0.5
 * `phonton.theme` preset id.
 */
export function parseThemeSettings(raw: string | null, legacy: string | null = null): ThemeSettings {
  let value: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) value = parsed as Record<string, unknown>;
  } catch { /* fall through to defaults */ }
  const presetId = typeof value.preset === "string" ? value.preset : legacy === "cursor-dark" ? "graphite" : legacy;
  const preset = PRESETS.some(p => p.id === presetId) ? presetId as ThemeId : DEFAULT_THEME.preset;
  const font = value.font === "sans" || value.font === "custom" ? value.font : "mono";
  const fontFamily = safeFontFamily(value.fontFamily);
  return {
    preset,
    custom: parsePalette(value.custom),
    name: cleanName(value.name),
    density: value.density === "compact" ? "compact" : "comfortable",
    font: font === "custom" && !fontFamily ? "mono" : font,
    fontFamily,
  };
}

// ------------------------------------------------------- import / export

export type ImportedTheme = { name: string | null; palette: Palette; format: string };

/** Serialize a theme to the Phonton theme file format. */
export function exportTheme(settings: ThemeSettings): string {
  return `${JSON.stringify({
    phonton_theme: 1,
    name: settings.name ?? PRESETS.find(p => p.id === settings.preset)?.label ?? "Custom",
    palette: paletteOf(settings),
    density: settings.density,
  }, null, 2)}\n`;
}

type Terminal = { bg?: string; fg?: string; ansi: (string | undefined)[] };

/** Map a terminal's background, foreground and 16 ANSI colors to a palette. */
export function paletteFromTerminal({ bg, fg, ansi }: Terminal): Palette {
  if (!bg || !fg) throw new Error("The palette has no background or foreground color.");
  const base = PRESETS[isDark(bg) ? 0 : 2].palette;
  const accent = firstReadable(bg, [ansi[6], ansi[14], ansi[4], ansi[12]]) ?? base.accent;
  return {
    bg,
    fg,
    surface: mix(bg, fg, 0.05),
    line: mix(bg, fg, 0.2),
    muted: readableMix(fg, bg, 0.4),
    accent,
    accent2: firstReadable(bg, [ansi[4], ansi[12], ansi[5]]) ?? accent,
    ok: firstReadable(bg, [ansi[2], ansi[10]]) ?? base.ok,
    warn: firstReadable(bg, [ansi[3], ansi[11]]) ?? base.warn,
    danger: firstReadable(bg, [ansi[1], ansi[9]]) ?? base.danger,
  };
}

const WT_NAMES = ["black", "red", "green", "yellow", "blue", "purple", "cyan", "white"];

function fromJson(text: string): ImportedTheme {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    // Windows Terminal settings.json allows whole-line comments.
    value = JSON.parse(text.split("\n").filter(line => !/^\s*\/\//.test(line)).join("\n"));
  }
  const object = (value ?? {}) as Record<string, unknown>;
  if (object.phonton_theme === 1) {
    const palette = parsePalette(object.palette);
    if (!palette) throw new Error("The Phonton theme file has a missing or invalid color.");
    return { name: cleanName(object.name), palette, format: "Phonton theme" };
  }
  const scheme = (Array.isArray(object.schemes) ? object.schemes[0] : object) as Record<string, unknown> | undefined;
  if (!scheme || !("background" in scheme)) throw new Error("No color scheme found in this JSON.");
  const color = (key: string) => normalizeHex(scheme[key]) ?? undefined;
  const ansi = [...WT_NAMES.map(color), ...WT_NAMES.map(n => color(`bright${n[0].toUpperCase()}${n.slice(1)}`))];
  return { name: cleanName(scheme.name), palette: paletteFromTerminal({ bg: color("background"), fg: color("foreground"), ansi }), format: "Windows Terminal" };
}

function fromITerm(text: string): ImportedTheme {
  const color = (key: string) => {
    const dict = new RegExp(`<key>${key}</key>\\s*<dict>([\\s\\S]*?)</dict>`).exec(text)?.[1];
    if (!dict) return undefined;
    const part = (name: string) => Number(new RegExp(`<key>${name} Component</key>\\s*<real>([^<]+)</real>`).exec(dict)?.[1]);
    const channels = [part("Red"), part("Green"), part("Blue")];
    return channels.every(Number.isFinite) ? toHex(channels.map(c => c * 255)) : undefined;
  };
  const ansi = Array.from({ length: 16 }, (_, i) => color(`Ansi ${i} Color`));
  return { name: null, palette: paletteFromTerminal({ bg: color("Background Color"), fg: color("Foreground Color"), ansi }), format: "iTerm2" };
}

function fromGhostty(text: string): ImportedTheme {
  const terminal: Terminal = { ansi: [] };
  for (const line of text.split("\n")) {
    const match = /^\s*([a-z-]+)\s*=\s*(.+?)\s*$/.exec(line);
    if (!match) continue;
    const [, key, value] = match;
    if (key === "background") terminal.bg = normalizeHex(value) ?? undefined;
    if (key === "foreground") terminal.fg = normalizeHex(value) ?? undefined;
    const slot = key === "palette" ? /^(\d{1,2})\s*=\s*(\S+)$/.exec(value) : null;
    if (slot && Number(slot[1]) < 16) terminal.ansi[Number(slot[1])] = normalizeHex(slot[2]) ?? undefined;
  }
  return { name: null, palette: paletteFromTerminal(terminal), format: "Ghostty" };
}

function fromBase16(text: string): ImportedTheme {
  const base: Record<string, string> = {};
  for (const match of text.matchAll(/\bbase0([0-9a-f])\s*:\s*["']?(#?[0-9a-f]{6})\b/gi)) {
    const hex = normalizeHex(match[2]);
    if (hex) base[match[1].toUpperCase()] = hex;
  }
  const missing = ["0", "1", "2", "5", "8", "A", "B", "C", "D"].filter(k => !base[k]);
  if (missing.length) throw new Error(`The base16 scheme is missing base0${missing[0]}.`);
  const bg = base["0"];
  const name = /^\s*(?:scheme|name)\s*:\s*["']?([^"'\n]+?)["']?\s*$/m.exec(text)?.[1] ?? null;
  return {
    name: cleanName(name),
    format: "base16",
    palette: {
      bg,
      surface: base["1"],
      line: base["2"],
      fg: base["5"],
      muted: base["4"] && contrast(base["4"], bg) >= 4.5 ? base["4"] : readableMix(base["5"], bg, 0.4),
      accent: firstReadable(bg, [base.C, base.D]) ?? base.C,
      accent2: base.D,
      ok: base.B,
      warn: base.A,
      danger: base["8"],
    },
  };
}

/**
 * Parse a theme file: a Phonton theme export, a base16/base24 YAML scheme, an
 * iTerm2 `.itermcolors` plist, a Ghostty config, or a Windows Terminal scheme
 * (or a settings.json, whose first scheme is used).
 */
export function importTheme(text: string): ImportedTheme {
  const source = text.replace(/^﻿/, "").trim();
  if (!source) throw new Error("The file is empty.");
  if (source.length > 512 * 1024) throw new Error("The file is larger than 512 KB.");
  if (source.startsWith("{")) return fromJson(source);
  if (/<plist|<\?xml/.test(source)) return fromITerm(source);
  if (/\bbase0[0-9a-f]\s*:/i.test(source)) return fromBase16(source);
  if (/^\s*(background|foreground|palette)\s*=/m.test(source)) return fromGhostty(source);
  throw new Error("Unrecognized format. Use base16 YAML, iTerm2, Ghostty, Windows Terminal JSON or a Phonton theme file.");
}
