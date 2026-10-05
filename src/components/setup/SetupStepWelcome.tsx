import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useState } from "react";
import { useManualAppUpdate } from "../../hooks/useManualAppUpdate";
import { isTauri } from "../../lib/sidecar";

type Props = {
  onGetStarted: () => void;
};

export function SetupStepWelcome({ onGetStarted }: Props) {
  const [appVersion, setAppVersion] = useState("");
  const update = useManualAppUpdate();

  useEffect(() => {
    if (!isTauri()) return;
    void getVersion().then(setAppVersion).catch(() => setAppVersion(""));
  }, []);

  return (
    <div className="setup-welcome">
      <img src="/phonton-logo.png" alt="Phonton" className="setup-logo" />
      <h1>Phonton Desktop</h1>
      <p>Give Phonton a goal. It starts cheap, verifies, and shows the cost.</p>
      <ol className="setup-loop" aria-label="How Phonton works">
        <li>Goal</li>
        <li>Plan</li>
        <li>Verify</li>
        <li>Receipt</li>
      </ol>

      {isTauri() ? (
        <div className="setup-update-banner">
          <p>
            {appVersion ? `Installed version: v${appVersion}` : "Phonton Desktop"}
          </p>
          {update.message && <p role="status">{update.message}</p>}
          {update.available && <p>Phonton restarts after installation.</p>}
          <div className="toolbar" style={{ justifyContent: "center" }}>
            <button
              type="button"
              className="btn secondary"
              disabled={update.busy !== null}
              onClick={update.check}
            >
              {update.busy === "check" ? "Checking…" : "Check for updates"}
            </button>
            {update.available ? (
              <button type="button" className="btn" disabled={update.busy !== null} onClick={update.install}>
                {update.busy === "install" ? "Installing…" : `Update to v${update.available}`}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="toolbar" style={{ justifyContent: "center", marginTop: 8 }}>
        <button type="button" className="btn setup-cta" onClick={onGetStarted}>
          Get started
        </button>
      </div>
    </div>
  );
}
