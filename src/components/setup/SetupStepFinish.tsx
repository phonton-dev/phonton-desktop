import { Glyph } from "../ascii/ascii";
import type { SidecarState } from "../../hooks/useSidecar";
import { presetLabel, useTheme } from "../../themes/presets";

type Props = {
  sidecar: SidecarState;
  providerReady: boolean;
  onOpen: () => void;
};

export function SetupStepFinish({ sidecar, providerReady, onOpen }: Props) {
  const theme = useTheme();
  const engineReady = sidecar.status === "ready";

  return (
    <div>
      <h2 className="setup-section-title">Ready to open the workbench</h2>
      <p className="setup-section-desc">Open Phonton to start running goals.</p>
      <ul className="setup-finish-list">
        <li><Glyph state="pass" /> Theme: {theme.name ?? presetLabel(theme.preset)}</li>
        <li><Glyph state={engineReady ? "pass" : "warn"} /> Engine: {engineReady ? `connected (v${sidecar.version})` : "not connected"}</li>
        <li><Glyph state={providerReady ? "pass" : "warn"} /> Provider key: {providerReady ? "probed locally" : "not verified"}</li>
      </ul>
      <button type="button" className="btn btn-block" onClick={onOpen} disabled={!engineReady || !providerReady}>
        Open Phonton →
      </button>
    </div>
  );
}
