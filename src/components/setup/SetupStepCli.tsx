import { open as openExternal } from "@tauri-apps/plugin-shell";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SidecarState } from "../../hooks/useSidecar";
import { ensurePhontonCli } from "../../lib/cli-install";
import { installDocsUrl } from "../../lib/license";
import { isTauri } from "../../lib/sidecar";

type Props = {
  sidecar: SidecarState;
  onRetry: () => void | Promise<void>;
};

type Phase = "idle" | "checking" | "starting" | "done" | "error";

export function SetupStepCli({ sidecar, onRetry }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [installing, setInstalling] = useState(false);
  const [installLog, setInstallLog] = useState("");
  const [installError, setInstallError] = useState("");
  const bootstrapped = useRef(false);

  const runBootstrap = async (forceInstall = false) => {
    setInstalling(true);
    setInstallError("");
    setPhase("checking");

    if (forceInstall) {
      setInstallLog(`Installing phonton-cli…`);
    }

    const result = await ensurePhontonCli((msg) => setInstallLog(msg));
    if (!result.ok) {
      setInstallError(result.message);
      setPhase("error");
      setInstalling(false);
      return;
    }

    setInstallLog(result.message);
    setPhase("starting");
    setInstallLog((prev) => `${prev}\nStarting phonton serve…`);
    await onRetry();
    setPhase("done");
    setInstalling(false);
  };

  useEffect(() => {
    if (bootstrapped.current || !isTauri()) return;
    bootstrapped.current = true;
    void runBootstrap(false);
  }, []);

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
          : phase === "checking"
            ? "Checking phonton-cli…"
            : phase === "starting"
              ? "Starting engine…"
              : "Connecting…";

  const statusDetail =
    sidecar.status === "ready"
      ? `phonton serve v${sidecar.version} on :47831`
      : sidecar.status === "offline"
        ? sidecar.error
        : sidecar.status === "idle"
          ? "Detecting phonton-cli on your system…"
          : phase === "checking"
            ? installLog || "Looking for an existing install before downloading."
            : phase === "starting"
              ? installLog || "Starting sidecar and waiting for phonton serve…"
              : "Verifying connection to phonton serve…";

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
        {installError ? (
          <p className="cli-status-detail" style={{ color: "var(--ph-danger)" }}>
            {installError}
          </p>
        ) : null}
        <div className="toolbar" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn"
            onClick={() => void runBootstrap(true)}
            disabled={installing || !isTauri()}
          >
            {installing ? "Working…" : "Install automatically"}
          </button>
          <button type="button" className="btn secondary" onClick={() => void onRetry()} disabled={installing}>
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
