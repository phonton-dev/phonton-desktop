import { useCallback, useEffect, useState } from "react";
import { ping } from "../lib/serve";
import { startSidecar } from "../lib/sidecar";

export type SidecarState =
  | { status: "connecting" }
  | { status: "ready"; version: string; handoffSchema: string }
  | { status: "offline"; error: string };

export function useSidecar() {
  const [state, setState] = useState<SidecarState>({ status: "connecting" });

  const refresh = useCallback(async () => {
    try {
      const info = await ping();
      setState({
        status: "ready",
        version: info.version,
        handoffSchema: info.handoff_schema,
      });
    } catch (err) {
      setState({
        status: "offline",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await startSidecar();
      for (let i = 0; i < 12 && !cancelled; i++) {
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
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      if (!cancelled) {
        setState({
          status: "offline",
          error: "Cannot reach phonton serve on :47831. Install phonton-cli and try again.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { state, refresh };
}
