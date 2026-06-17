import { shadcnVarsFromPreset } from "./shadcn-map";

export type ThemeId = "nebula" | "cursor-dark" | "light" | "high-contrast";

export type ThemePreset = {
  id: ThemeId;
  label: string;
  vars: Record<string, string>;
  shadcn?: Record<string, string>;
};

export const THEME_STORAGE_KEY = "phonton.theme";

const modalGlass = {
  "--ph-blur": "blur(16px)",
};

export const themePresets: ThemePreset[] = [
  {
    id: "nebula",
    label: "Nebula",
    vars: {
      ...modalGlass,
      "--ph-bg": "#07070c",
      "--ph-bg-elevated": "#101018",
      "--ph-panel": "#16161f",
      "--ph-panel-2": "#1e1e2a",
      "--ph-glass": "#16161f",
      "--ph-glass-strong": "#1a1a28",
      "--ph-glass-border": "rgba(196, 186, 220, 0.16)",
      "--ph-border": "rgba(196, 186, 220, 0.14)",
      "--ph-text": "#f8f6fc",
      "--ph-muted": "#b4adbe",
      "--ph-faint": "#7a7388",
      "--ph-accent": "#9b6cff",
      "--ph-accent-2": "#5ed4f7",
      "--ph-ok": "#6ee09a",
      "--ph-warn": "#e8c06a",
      "--ph-danger": "#ff8a82",
      "--ph-rail": "#0c0c14",
      "--ph-shadow": "0 12px 40px rgba(0,0,0,0.45)",
      "--ph-ambient-1": "rgba(155, 108, 255, 0.18)",
      "--ph-ambient-2": "rgba(94, 212, 247, 0.14)",
      "--ph-btn-glow": "0 0 16px rgba(155, 108, 255, 0.28)",
    },
  },
  {
    id: "cursor-dark",
    label: "Cursor Dark",
    vars: {
      ...modalGlass,
      "--ph-bg": "#1e1e1e",
      "--ph-bg-elevated": "#252526",
      "--ph-panel": "#2d2d2d",
      "--ph-panel-2": "#333333",
      "--ph-glass": "#2d2d2d",
      "--ph-glass-strong": "#323232",
      "--ph-glass-border": "rgba(255, 255, 255, 0.1)",
      "--ph-border": "rgba(255,255,255,0.08)",
      "--ph-text": "#cccccc",
      "--ph-muted": "#9d9d9d",
      "--ph-faint": "#6e6e6e",
      "--ph-accent": "#3794ff",
      "--ph-accent-2": "#4ec9b0",
      "--ph-ok": "#89d185",
      "--ph-warn": "#cca700",
      "--ph-danger": "#f48771",
      "--ph-rail": "#181818",
      "--ph-shadow": "0 8px 24px rgba(0,0,0,0.35)",
      "--ph-ambient-1": "rgba(55, 148, 255, 0.14)",
      "--ph-ambient-2": "rgba(78, 201, 176, 0.12)",
      "--ph-btn-glow": "0 0 14px rgba(55, 148, 255, 0.22)",
    },
  },
  {
    id: "light",
    label: "Light",
    vars: {
      ...modalGlass,
      "--ph-bg": "#f6f7fb",
      "--ph-bg-elevated": "#ffffff",
      "--ph-panel": "#ffffff",
      "--ph-panel-2": "#eef0f6",
      "--ph-glass": "#ffffff",
      "--ph-glass-strong": "#ffffff",
      "--ph-glass-border": "rgba(20, 24, 40, 0.12)",
      "--ph-border": "rgba(20, 24, 40, 0.1)",
      "--ph-text": "#141828",
      "--ph-muted": "#5c6478",
      "--ph-faint": "#8b93a7",
      "--ph-accent": "#6b4ce6",
      "--ph-accent-2": "#0ea5e9",
      "--ph-ok": "#16a34a",
      "--ph-warn": "#ca8a04",
      "--ph-danger": "#dc2626",
      "--ph-rail": "#eceef5",
      "--ph-shadow": "0 10px 30px rgba(20,24,40,0.08)",
      "--ph-ambient-1": "rgba(107, 76, 230, 0.1)",
      "--ph-ambient-2": "rgba(14, 165, 233, 0.08)",
      "--ph-btn-glow": "0 0 12px rgba(107, 76, 230, 0.18)",
    },
  },
  {
    id: "high-contrast",
    label: "High contrast",
    vars: {
      ...modalGlass,
      "--ph-bg": "#000000",
      "--ph-bg-elevated": "#0a0a0a",
      "--ph-panel": "#111111",
      "--ph-panel-2": "#1a1a1a",
      "--ph-glass": "#111111",
      "--ph-glass-strong": "#141414",
      "--ph-glass-border": "rgba(255, 255, 255, 0.35)",
      "--ph-border": "#ffffff",
      "--ph-text": "#ffffff",
      "--ph-muted": "#d4d4d4",
      "--ph-faint": "#a3a3a3",
      "--ph-accent": "#ffff00",
      "--ph-accent-2": "#00ffff",
      "--ph-ok": "#00ff00",
      "--ph-warn": "#ffaa00",
      "--ph-danger": "#ff4444",
      "--ph-rail": "#050505",
      "--ph-shadow": "none",
      "--ph-ambient-1": "rgba(255, 255, 0, 0.08)",
      "--ph-ambient-2": "rgba(0, 255, 255, 0.06)",
      "--ph-btn-glow": "none",
    },
  },
];

export function applyTheme(id: ThemeId) {
  const preset = themePresets.find((t) => t.id === id) ?? themePresets[0];
  const root = document.documentElement;
  for (const [key, value] of Object.entries(preset.vars)) {
    root.style.setProperty(key, value);
  }
  const shadcn = shadcnVarsFromPreset(preset);
  for (const [key, value] of Object.entries(shadcn)) {
    root.style.setProperty(key, value);
  }
  root.dataset.theme = preset.id;
  root.classList.toggle("dark", preset.id !== "light");
  root.style.colorScheme = preset.id === "light" ? "light" : "dark";
  localStorage.setItem(THEME_STORAGE_KEY, preset.id);
}

export function loadStoredTheme(): ThemeId {
  const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemeId | null;
  if (stored && themePresets.some((t) => t.id === stored)) return stored;
  return "nebula";
}
