import { inkFor, mix, type Palette } from "./palette";

/** Map a theme palette to the shadcn/ui CSS variables. */
export function shadcnVars(p: Palette): Record<string, string> {
  const raised = mix(p.surface, p.fg, 0.07);
  const accentInk = inkFor(p.accent);
  return {
    "--background": p.bg,
    "--foreground": p.fg,
    "--card": p.surface,
    "--card-foreground": p.fg,
    "--popover": p.surface,
    "--popover-foreground": p.fg,
    "--primary": p.accent,
    "--primary-foreground": accentInk,
    "--secondary": raised,
    "--secondary-foreground": p.fg,
    "--muted": p.surface,
    "--muted-foreground": p.muted,
    "--accent": raised,
    "--accent-foreground": p.fg,
    "--destructive": p.danger,
    "--border": p.line,
    "--input": p.line,
    "--ring": p.accent,
    "--sidebar": p.bg,
    "--sidebar-foreground": p.fg,
    "--sidebar-primary": p.accent,
    "--sidebar-primary-foreground": accentInk,
    "--sidebar-accent": raised,
    "--sidebar-accent-foreground": p.fg,
    "--sidebar-border": p.line,
    "--sidebar-ring": p.accent,
  };
}
