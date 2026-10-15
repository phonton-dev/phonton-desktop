import type { CSSProperties } from "react";
import { Glyph } from "@/components/ascii/ascii";
import { choosePreset, themePresets, useTheme, type Palette } from "@/themes/presets";
import "./theme.css";

/** A few lines of workbench text drawn in a palette, so presets compare by what they look like in use. */
export function ThemeSample({ palette }: { palette: Palette }) {
  const vars = { "--s-bg": palette.bg, "--s-line": palette.line, "--s-fg": palette.fg, "--s-muted": palette.muted, "--s-accent": palette.accent, "--s-ok": palette.ok, "--s-warn": palette.warn, "--s-danger": palette.danger } as CSSProperties;
  return <div className="theme-sample" style={vars} aria-hidden="true">
    <span className="s-fg">phonton<span className="s-accent">_</span> <span className="s-muted">plan</span></span>
    <span><span className="s-ok">✓</span> npm test <span className="s-muted">3 passed</span></span>
    <span><span className="s-accent">▶</span> candidate 2 <span className="s-muted">running</span></span>
    <span><span className="s-danger">✗</span> candidate 1 <span className="s-warn">◇ repair</span></span>
  </div>;
}

/** Preset choice. Picking a preset clears custom colors but keeps density and font. */
export function ThemePicker() {
  const theme = useTheme();
  return <div className="theme-grid" role="radiogroup" aria-label="Theme preset">
    {themePresets.map(preset => {
      const selected = !theme.custom && theme.preset === preset.id;
      return <button key={preset.id} type="button" role="radio" aria-checked={selected} className="theme-card" onClick={() => choosePreset(preset.id)}>
        <ThemeSample palette={preset.palette} />
        <span className="theme-card-label"><Glyph state={selected ? "pass" : "idle"} /> {preset.label}</span>
      </button>;
    })}
  </div>;
}
