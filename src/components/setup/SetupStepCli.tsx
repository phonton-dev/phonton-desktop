import { open as openExternal } from "@tauri-apps/plugin-shell";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SidecarState } from "../../hooks/useSidecar";
import { waitForPing } from "../../hooks/useSidecar";
import { ensurePhontonCli } from "../../lib/cli-install";
import { installDocsUrl } from "../../lib/license";
import { checkServeHealth } from "../../lib/serve";
import { clearStaleServePort, isTauri, restartSidecar } from "../../lib/sidecar";

type Props = {
  onConnectedChange: (connected: boolean) => void;
};

type Phase = "idle" | "checking" | "starting" | "done" | "error";

export function SetupStepCli({ onConnectedChange }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [installing, setInstalling] = useState(false);
  const [installLog, setInstallLog] = useState("");
  const [installError, setInstallError] = useState("");
  const [sidecar, setSidecar] = useState<SidecarState>({ status: "idle" });
  const bootstrapped = useRef(false);

  useEffect(() => {
    onConnectedChange(sidecar.status === "ready");
  }, [sidecar.status, onConnectedChange]);

  const connectSidecar = async (): Promise<boolean> => {
    setPhase("starting");
    setInstallLog((prev) => `${prev}\nStarting phonton serve…`);

    if (await checkServeHealth()) {
      try {
        const info = await waitForPing(false);
        if (info) {
          setSidecar({
            status: "ready",
            version: info.version,
            handoffSchema: info.handoff_schema,
          });
          setPhase("done");
          return true;
        }
      } catch {
        /* stale listener — clear and respawn */
      }
      await clearStaleServePort();
    }

    try {
      await restartSidecar();
    } catch (err) {
      setInstallError(`spawn failed: ${err instanceof Error ? err.message : String(err)}`);
      setSidecar({
        status: "offline",
        error: `spawn failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      setPhase("error");
      return false;
    }

    const info = await waitForPing(true);
    if (info) {
      setSidecar({
        status: "ready",
        version: info.version,
        handoffSchema: info.handoff_schema,
      });
      setPhase("done");
      return true;
    }

    setSidecar({
      status: "offline",
      error: "ping timeout — phonton serve did not respond on :47831",
    });
    setInstallError("");
    setPhase("error");
    return false;
  };

  const runBootstrap = async (forceInstall = false) => {
    setInstalling(true);
    setInstallError("");
    setSidecar({ status: "idle" });
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
    setSidecar({ status: "connecting" });
    await connectSidecar();
    setInstalling(false);
  };

  useEffect(() => {
    if (bootstrapped.current || !isTauri()) return;
    bootstrapped.current = true;
    void runBootstrap(false);
  }, []);

  const busy = installing || phase === "checking" || phase === "starting" || sidecar.status === "connecting";

  const statusIcon =
    sidecar.status === "ready" ? (
      <CheckCircle2 size={20} color="var(--ph-ok)" />
    ) : phase === "error" || sidecar.status === "offline" ? (
      <XCircle size={20} color={phase === "error" ? "var(--ph-danger)" : "var(--ph-warn)"} />
    ) : (
      <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
    );

  const statusLabel =
    sidecar.status === "ready"
      ? "CLI connected"
      : installError
        ? "CLI install error"
        : phase === "error" || sidecar.status === "offline"
          ? "CLI offline"
          : busy
            ? phase === "checking"
              ? "Checking phonton-cli…"
              : "Starting engine…"
            : "Ready to install";

  const statusDetail =
    sidecar.status === "ready"
      ? `phonton serve v${sidecar.version} on :47831`
      : installError
        ? installError
        : phase === "error" || sidecar.status === "offline"
          ? sidecar.status === "offline"
            ? sidecar.error
            : installLog || "Could not connect to phonton serve."
          : busy
            ? installLog ||
              (phase === "checking"
                ? "Looking for an existing install before downloading."
                : "Starting sidecar and waiting for phonton serve…")
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
