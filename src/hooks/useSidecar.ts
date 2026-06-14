import { useCallback, useEffect, useState } from "react";
import { ping } from "../lib/serve";
import { restartSidecar, startSidecar } from "../lib/sidecar";

export type SidecarState =
  | { status: "idle" }
  | { status: "connecting" }
  | { status: "ready"; version: string; handoffSchema: string }
  | { status: "offline"; error: string };

const POLL_ATTEMPTS = 40;
const POLL_INTERVAL_MS = 500;

type Options = {
  /** When false, sidecar is not started (e.g. before CLI install step). */
  enabled?: boolean;
};

async function waitForPing(): Promise<{ version: string; handoff_schema: string } | null> {
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    try {
      return await ping();
    } catch {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
  return null;
}

export function useSidecar({ enabled = true }: Options = {}) {
  const [state, setState] = useState<SidecarState>(enabled ? { status: "connecting" } : { status: "idle" });

  const refresh = useCallback(async () => {
    if (!enabled) {
      setState({ status: "idle" });
      return;
    }
    setState({ status: "connecting" });
    await restartSidecar();
    const info = await waitForPing();
    if (info) {
      setState({
        status: "ready",
        version: info.version,
        handoffSchema: info.handoff_schema,
      });
      return;
    }
    setState({
      status: "offline",
      error: "phonton serve didn't start — try Retry connection or reinstall the CLI.",
    });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setState({ status: "idle" });
      return;
    }

    let cancelled = false;
    (async () => {
      setState({ status: "connecting" });
      await startSidecar();
      const info = await waitForPing();
      if (cancelled) return;
      if (info) {
        setState({
          status: "ready",
          version: info.version,
          handoffSchema: info.handoff_schema,
        });
        return;
      }
      setState({
        status: "offline",
        error: "phonton serve didn't start — try Retry connection or reinstall the CLI.",
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { state, refresh };
}
