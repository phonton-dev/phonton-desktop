import { applyTheme, themePresets, type ThemeId } from "../../themes/presets";

const swatchColors: Record<ThemeId, string[]> = {
  nebula: ["#07070c", "#9b6cff", "#16161f", "#5ed4f7"],
  "cursor-dark": ["#1e1e1e", "#3794ff", "#2d2d2d", "#4ec9b0"],
  light: ["#f6f7fb", "#6b4ce6", "#ffffff", "#0ea5e9"],
  "high-contrast": ["#000000", "#ffff00", "#111111", "#00ffff"],
};

type Props = {
  themeId: ThemeId;
  onThemeChange: (id: ThemeId) => void;
};

export function SetupStepTheme({ themeId, onThemeChange }: Props) {
  return (
    <div>
      <h2 className="setup-section-title">Choose your theme</h2>
      <p className="setup-section-desc">Pick an appearance. You can change this anytime in Settings.</p>
      <div className="theme-grid">
        {themePresets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`theme-card ${themeId === preset.id ? "selected" : ""}`}
            onClick={() => {
              onThemeChange(preset.id);
              applyTheme(preset.id);
            }}
          >
            <div className="theme-swatch" aria-hidden>
              {swatchColors[preset.id].map((color) => (
                <span key={color} style={{ background: color }} />
              ))}
            </div>
            <span className="theme-card-label">{preset.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
