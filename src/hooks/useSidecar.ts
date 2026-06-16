import { useCallback, useEffect, useState } from "react";
import { checkServeHealth, ping } from "../lib/serve";
import { restartSidecar, startSidecar } from "../lib/sidecar";

export type SidecarState =
  | { status: "idle" }
  | { status: "connecting" }
  | { status: "ready"; version: string; handoffSchema: string }
  | { status: "offline"; error: string };

const POLL_ATTEMPTS = 40;
const POLL_ATTEMPTS_BOOTSTRAP = 120;
const POLL_INTERVAL_MS = 500;

type Options = {
  /** When false, sidecar is not started (e.g. before CLI install step). */
  enabled?: boolean;
  /** Longer ping window after fresh CLI install / vendor download. */
  bootstrap?: boolean;
};

export async function waitForPing(
  bootstrap = false,
): Promise<{ version: string; handoff_schema: string } | null> {
  const attempts = bootstrap ? POLL_ATTEMPTS_BOOTSTRAP : POLL_ATTEMPTS;
  for (let i = 0; i < attempts; i++) {
    try {
      return await ping();
    } catch {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
  return null;
}

export function useSidecar({ enabled = true, bootstrap = false }: Options = {}) {
  const [state, setState] = useState<SidecarState>(enabled ? { status: "connecting" } : { status: "idle" });

  const refresh = useCallback(async () => {
    if (!enabled) {
      setState({ status: "idle" });
      return;
    }
    setState({ status: "connecting" });
    if (await checkServeHealth()) {
      try {
        const info = await ping();
        setState({
          status: "ready",
          version: info.version,
          handoffSchema: info.handoff_schema,
        });
        return;
      } catch {
        /* spawn fresh */
      }
    }
    try {
      await restartSidecar();
    } catch (err) {
      setState({
        status: "offline",
        error: `spawn failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }
    const info = await waitForPing(bootstrap);
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
      error: "ping timeout — phonton serve did not respond on :47831",
    });
  }, [bootstrap, enabled]);

  useEffect(() => {
    if (!enabled) {
      setState({ status: "idle" });
      return;
    }

    let cancelled = false;
    (async () => {
      setState({ status: "connecting" });
      if (await checkServeHealth()) {
        try {
          const info = await ping();
          if (!cancelled) {
            setState({
              status: "ready",
              version: info.version,
              handoffSchema: info.handoff_schema,
            });
          }
          return;
        } catch {
          /* fall through */
        }
      }
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
      const info = await waitForPing(bootstrap);
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
        error: "ping timeout — phonton serve did not respond on :47831",
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [bootstrap, enabled]);

  return { state, refresh };
}
