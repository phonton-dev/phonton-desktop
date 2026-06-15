import { open as openExternal } from "@tauri-apps/plugin-shell";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSidecar } from "../../hooks/useSidecar";
import { ensurePhontonCli } from "../../lib/cli-install";
import { installDocsUrl } from "../../lib/license";
import { isTauri } from "../../lib/sidecar";

type Props = {
  onConnectedChange: (connected: boolean) => void;
};

type Phase = "idle" | "checking" | "starting" | "done" | "error";

export function SetupStepCli({ onConnectedChange }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [installing, setInstalling] = useState(false);
  const [installLog, setInstallLog] = useState("");
  const [installError, setInstallError] = useState("");
  const [sidecarEnabled, setSidecarEnabled] = useState(false);
  const bootstrapped = useRef(false);
  const { state: sidecar, refresh: refreshSidecar } = useSidecar({ enabled: sidecarEnabled });

  useEffect(() => {
    onConnectedChange(sidecar.status === "ready");
  }, [sidecar.status, onConnectedChange]);

  const runBootstrap = async (forceInstall = false) => {
    setInstalling(true);
    setInstallError("");
    setSidecarEnabled(false);
    onConnectedChange(false);
    setPhase("checking");

    if (forceInstall) {
      setInstallLog("Installing phonton-cli…");
    }

    const result = await ensurePhontonCli((msg) => setInstallLog(msg));
    if (!result.ok) {
      setInstallError(result.message);
      setPhase("error");
      setInstalling(false);
      return;
    }

    setInstallError("");
    setInstallLog(result.message);
    setPhase("starting");
    setInstallLog((prev) => `${prev}\nStarting phonton serve…`);
    setSidecarEnabled(true);
    await refreshSidecar();
    setPhase("done");
    setInstalling(false);
  };

  useEffect(() => {
    if (bootstrapped.current || !isTauri()) return;
    bootstrapped.current = true;
    void runBootstrap(false);
  }, []);

  const busy = installing || phase === "checking" || phase === "starting";

  const statusIcon =
    sidecar.status === "ready" ? (
      <CheckCircle2 size={20} color="var(--ph-ok)" />
    ) : phase === "error" ? (
      <XCircle size={20} color="var(--ph-danger)" />
    ) : busy || sidecar.status === "connecting" ? (
      <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
    ) : sidecar.status === "offline" ? (
      <XCircle size={20} color="var(--ph-warn)" />
    ) : (
      <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
    );

  const statusLabel =
    sidecar.status === "ready"
      ? "CLI connected"
      : phase === "error"
        ? "CLI install error"
        : busy
          ? phase === "checking"
            ? "Checking phonton-cli…"
            : phase === "starting" || sidecar.status === "connecting"
              ? "Starting engine…"
              : "Working…"
          : sidecar.status === "offline"
            ? "CLI offline"
            : "Ready to install";

  const statusDetail =
    sidecar.status === "ready"
      ? `phonton serve v${sidecar.version} on :47831`
      : phase === "error"
        ? installError || installLog || "Could not install or locate phonton-cli."
        : busy
          ? installLog ||
            (phase === "checking"
              ? "Looking for an existing install before downloading."
              : "Starting sidecar and waiting for phonton serve…")
          : sidecar.status === "offline"
            ? sidecar.error
            : "Detecting phonton-cli on your system…";

  return (
    <div>
      <h2 className="setup-section-title">Install phonton-cli</h2>
      <p className="setup-section-desc">
        Phonton Desktop runs goals through a local <code className="mono">phonton serve</code> sidecar. We detect an
        existing CLI first, then install with npm only if needed.
      </p>
      <div className="cli-status-card">
        <div className="cli-status-row">
          {statusIcon}
          <span className="cli-status-label">{statusLabel}</span>
        </div>
        <p className="cli-status-detail">{statusDetail}</p>
        <div className="toolbar" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn"
            onClick={() => void runBootstrap(true)}
            disabled={installing || !isTauri()}
          >
            {installing ? "Working…" : "Install automatically"}
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={() => void runBootstrap(false)}
            disabled={installing || !isTauri()}
          >
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
