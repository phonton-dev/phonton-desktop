import { Check } from "lucide-react";
import { isAuthenticated, sessionPlan } from "../../lib/license";
import type { SidecarState } from "../../hooks/useSidecar";
import { themePresets, type ThemeId } from "../../themes/presets";

type Props = {
  themeId: ThemeId;
  sidecar: SidecarState;
  onOpen: () => void;
};

export function SetupStepFinish({ themeId, sidecar, onOpen }: Props) {
  const themeLabel = themePresets.find((t) => t.id === themeId)?.label ?? themeId;
  const cliLabel =
    sidecar.status === "ready" ? `Connected (v${sidecar.version})` : "Not connected";
  const plan = sessionPlan();

  return (
    <div>
      <h2 className="setup-section-title">You&apos;re all set</h2>
      <p className="setup-section-desc">Your control room is ready. Open Phonton to start running goals.</p>
      <ul className="setup-finish-list">
        <li>
          <Check size={16} color={isAuthenticated() ? "var(--ph-ok)" : "var(--ph-warn)"} />
          Signed in · {plan} plan
        </li>
        <li>
          <Check size={16} color="var(--ph-ok)" />
          Theme: {themeLabel}
        </li>
        <li>
          <Check size={16} color={sidecar.status === "ready" ? "var(--ph-ok)" : "var(--ph-warn)"} />
          CLI: {cliLabel}
        </li>
      </ul>
      <button
        type="button"
        className="btn"
        onClick={onOpen}
        style={{ width: "100%" }}
        disabled={!isAuthenticated() || sidecar.status !== "ready"}
      >
        Open Phonton
      </button>
    </div>
  );
}
