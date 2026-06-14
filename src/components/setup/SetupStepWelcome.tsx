import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useState } from "react";
import { checkForAppUpdate, type UpdateCheckResult } from "../../lib/app-updater";
import { isTauri } from "../../lib/sidecar";

type Props = {
  onGetStarted: () => void;
};

export function SetupStepWelcome({ onGetStarted }: Props) {
  const [appVersion, setAppVersion] = useState("");
  const [updateStatus, setUpdateStatus] = useState("");
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    void getVersion().then(setAppVersion).catch(() => setAppVersion(""));
  }, []);

  const handleCheckUpdates = async () => {
    if (!isTauri()) return;
    setUpdateBusy(true);
    setUpdateStatus("Checking for updates…");
    setUpdateAvailable(null);

    const result: UpdateCheckResult = await checkForAppUpdate();
    if (result.status === "current") {
      setUpdateStatus(`You're on the latest version${appVersion ? ` (v${appVersion})` : ""}.`);
      setUpdateBusy(false);
      return;
    }
    if (result.status === "available") {
      setUpdateAvailable(result.version);
      setUpdateStatus(`Phonton ${result.version} is available.`);
      setUpdateBusy(false);
      return;
    }
    if (result.status === "error") {
      setUpdateStatus(result.message);
      setUpdateBusy(false);
      return;
    }
    setUpdateStatus("");
    setUpdateBusy(false);
  };

  const handleInstallUpdate = async () => {
    setUpdateBusy(true);
    setUpdateStatus("Downloading update…");
    const result = await checkForAppUpdate({
      install: true,
      onProgress: (pct) => setUpdateStatus(`Downloading update… ${pct}%`),
    });
    if (result.status === "error") {
      setUpdateStatus(result.message);
      setUpdateBusy(false);
    }
  };

  useEffect(() => {
    if (!isTauri()) return;
    const timer = window.setTimeout(() => {
      void handleCheckUpdates();
    }, 800);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="setup-welcome">
      <img src="/phonton-logo.png" alt="Phonton" className="setup-logo" />
      <h1>Phonton Desktop</h1>
      <p>Goal-driven control room for phonton-cli.</p>

      {isTauri() ? (
        <div className="setup-update-banner">
          <p>
            {appVersion ? `Installed version: v${appVersion}` : "Phonton Desktop"}
            {updateStatus ? ` — ${updateStatus}` : null}
          </p>
          <div className="toolbar" style={{ justifyContent: "center" }}>
            <button
              type="button"
              className="btn secondary"
              disabled={updateBusy}
              onClick={() => void handleCheckUpdates()}
            >
              {updateBusy ? "Checking…" : "Check for updates"}
            </button>
            {updateAvailable ? (
              <button type="button" className="btn" disabled={updateBusy} onClick={() => void handleInstallUpdate()}>
                Update to v{updateAvailable}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="toolbar" style={{ justifyContent: "center", marginTop: 12 }}>
        <button type="button" className="btn" onClick={onGetStarted}>
          Get started
        </button>
      </div>
    </div>
  );
}
