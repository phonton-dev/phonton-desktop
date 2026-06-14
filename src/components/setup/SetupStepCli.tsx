import { open as openExternal } from "@tauri-apps/plugin-shell";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useState } from "react";
import type { SidecarState } from "../../hooks/useSidecar";
import { installPhontonCli } from "../../lib/cli-install";
import { installDocsUrl } from "../../lib/license";
import { isTauri } from "../../lib/sidecar";

type Props = {
  sidecar: SidecarState;
  onRetry: () => void;
};

export function SetupStepCli({ sidecar, onRetry }: Props) {
  const [installing, setInstalling] = useState(false);
  const [installLog, setInstallLog] = useState("");
  const [installError, setInstallError] = useState("");

  const statusIcon =
    sidecar.status === "ready" ? (
      <CheckCircle2 size={20} color="var(--ph-ok)" />
    ) : sidecar.status === "offline" ? (
      <XCircle size={20} color="var(--ph-warn)" />
    ) : (
      <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
    );

  const statusLabel =
    sidecar.status === "ready"
      ? "CLI connected"
      : sidecar.status === "offline"
        ? "CLI offline"
        : sidecar.status === "idle"
          ? "Ready to install"
          : "Connecting…";

  const statusDetail =
    sidecar.status === "ready"
      ? `phonton serve v${sidecar.version} on :47831`
      : sidecar.status === "offline"
        ? sidecar.error
        : sidecar.status === "idle"
          ? "Click Install automatically or install the CLI manually, then retry."
          : "Starting sidecar and waiting for phonton serve…";

  const runAutoInstall = async () => {
    setInstalling(true);
    setInstallError("");
    setInstallLog("");
    const result = await installPhontonCli((msg) => setInstallLog(msg));
    setInstalling(false);
    if (result.ok) {
      setInstallLog(result.message);
      onRetry();
    } else {
      setInstallError(result.message);
    }
  };

  return (
    <div>
      <h2 className="setup-section-title">Install phonton-cli</h2>
      <p className="setup-section-desc">
        Phonton Desktop runs goals through a local <code className="mono">phonton serve</code> sidecar. We can install
        the CLI automatically with npm.
      </p>
      <div className="cli-status-card">
        <div className="cli-status-row">
          {statusIcon}
          <span className="cli-status-label">{statusLabel}</span>
        </div>
        <p className="cli-status-detail">{statusDetail}</p>
        {installLog ? <p className="cli-status-detail">{installLog}</p> : null}
        {installError ? (
          <p className="cli-status-detail" style={{ color: "var(--ph-danger)" }}>
            {installError}
          </p>
        ) : null}
        <div className="toolbar" style={{ marginTop: 12 }}>
          <button type="button" className="btn" onClick={runAutoInstall} disabled={installing || !isTauri()}>
            {installing ? "Installing…" : "Install automatically"}
          </button>
          <button type="button" className="btn secondary" onClick={onRetry} disabled={installing}>
            Retry connection
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              const url = installDocsUrl();
              if (isTauri()) void openExternal(url);
              else window.open(url, "_blank");
            }}
          >
            Install guide
          </button>
        </div>
      </div>
      <p className="cli-hint">
        Requires Node.js and npm. Manual install: <code className="mono">npm install -g phonton-cli</code>
      </p>
    </div>
  );
}
