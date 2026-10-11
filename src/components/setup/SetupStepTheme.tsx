import { applyTheme, themePresets, themeSwatches, type ThemeId } from "../../themes/presets";

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
              {themeSwatches[preset.id].map((color) => (
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
