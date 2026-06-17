import type { ThemePreset } from "./presets";

/** Map legacy --ph-* tokens to shadcn CSS variables. */
export function shadcnVarsFromPreset(preset: ThemePreset): Record<string, string> {
  if (preset.shadcn) return preset.shadcn;
  const v = preset.vars;
  return {
    "--background": v["--ph-bg"] ?? "#07070c",
    "--foreground": v["--ph-text"] ?? "#f8f6fc",
    "--card": v["--ph-panel"] ?? "#16161f",
    "--card-foreground": v["--ph-text"] ?? "#f8f6fc",
    "--popover": v["--ph-panel"] ?? "#16161f",
    "--popover-foreground": v["--ph-text"] ?? "#f8f6fc",
    "--primary": v["--ph-accent"] ?? "#9b6cff",
    "--primary-foreground": v["--ph-text"] ?? "#f8f6fc",
    "--secondary": v["--ph-panel-2"] ?? "#1e1e2a",
    "--secondary-foreground": v["--ph-text"] ?? "#f8f6fc",
    "--muted": v["--ph-panel-2"] ?? "#1e1e2a",
    "--muted-foreground": v["--ph-muted"] ?? "#b4adbe",
    "--accent": v["--ph-glass-strong"] ?? "#1a1a28",
    "--accent-foreground": v["--ph-text"] ?? "#f8f6fc",
    "--destructive": v["--ph-danger"] ?? "#ff8a82",
    "--border": v["--ph-border"] ?? "rgba(255,255,255,0.1)",
    "--input": v["--ph-glass-border"] ?? "rgba(255,255,255,0.12)",
    "--ring": v["--ph-accent"] ?? "#9b6cff",
    "--sidebar": v["--ph-rail"] ?? "#0c0c14",
    "--sidebar-foreground": v["--ph-text"] ?? "#f8f6fc",
    "--sidebar-primary": v["--ph-accent"] ?? "#9b6cff",
    "--sidebar-primary-foreground": v["--ph-text"] ?? "#f8f6fc",
    "--sidebar-accent": v["--ph-panel"] ?? "#16161f",
    "--sidebar-accent-foreground": v["--ph-text"] ?? "#f8f6fc",
    "--sidebar-border": v["--ph-border"] ?? "rgba(255,255,255,0.1)",
    "--sidebar-ring": v["--ph-accent"] ?? "#9b6cff",
  };
}
