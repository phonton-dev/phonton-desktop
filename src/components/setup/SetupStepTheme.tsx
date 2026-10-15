import { ThemePicker } from "../theme/ThemePicker";

export function SetupStepTheme() {
  return (
    <div>
      <h2 className="setup-section-title">Choose a theme</h2>
      <p className="setup-section-desc">Edit colors, density and font, or import a terminal palette, in Settings → Appearance.</p>
      <ThemePicker />
    </div>
  );
}
