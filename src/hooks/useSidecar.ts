import { useCallback, useEffect, useState } from "react";
import { ensureSidecarReady } from "../lib/sidecar-upgrade";
import { startSidecar } from "../lib/sidecar";

export type SidecarState =
  | { status: "idle" }
  | { status: "connecting"; message?: string }
  | { status: "ready"; version: string; handoffSchema: string }
  | { status: "offline"; error: string }
  | {
      status: "upgrade_required";
      error: string;
      installedVersion?: string;
    };

type Options = {
  /** When false, sidecar is not started (e.g. before CLI install step). */
  enabled?: boolean;
  /** Longer ping window after fresh CLI install / vendor download. */
  bootstrap?: boolean;
};

function applyConnectResult(
  setState: (s: SidecarState) => void,
  result: Awaited<ReturnType<typeof ensureSidecarReady>>,
) {
  if (result.ok) {
    setState({
      status: "ready",
      version: result.version,
      handoffSchema: result.handoffSchema,
    });
    return;
  }
  if (result.reason === "upgrade_required") {
    setState({
      status: "upgrade_required",
      error: result.error,
      installedVersion: result.installedVersion,
    });
    return;
  }
  setState({ status: "offline", error: result.error });
}

export function useSidecar({ enabled = true, bootstrap = false }: Options = {}) {
  const [state, setState] = useState<SidecarState>(
    enabled ? { status: "connecting" } : { status: "idle" },
  );

  const refresh = useCallback(async () => {
    if (!enabled) {
      setState({ status: "idle" });
      return;
    }
    setState({ status: "connecting", message: "Connecting to sidecar…" });
    const result = await ensureSidecarReady(bootstrap, (message) => {
      setState({ status: "connecting", message });
    });
    applyConnectResult(setState, result);
  }, [bootstrap, enabled]);

  useEffect(() => {
    if (!enabled) {
      setState({ status: "idle" });
      return;
    }

    let cancelled = false;
    (async () => {
      setState({ status: "connecting", message: "Starting sidecar…" });
      try {
        await startSidecar();
      } catch (err) {
        if (!cancelled) {
          setState({
            status: "offline",
            error: `spawn failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
        return;
      }
      const result = await ensureSidecarReady(bootstrap, (message) => {
        if (!cancelled) setState({ status: "connecting", message });
      });
      if (!cancelled) applyConnectResult(setState, result);
    })();

    return () => {
      cancelled = true;
    };
  }, [bootstrap, enabled]);

  return { state, refresh };
}

/** Re-export for setup flow and settings upgrade button. */
export { ensureSidecarReady } from "../lib/sidecar-upgrade";
