import { useEffect } from "react";
import { checkForAppUpdateOnLaunch } from "../lib/app-updater";
import { isTauri } from "../lib/sidecar";

/** Check GitHub Releases for a signed update a few seconds after launch. */
export function useAppUpdater(enabled = true) {
  useEffect(() => {
    if (!enabled || !isTauri()) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void checkForAppUpdateOnLaunch(controller.signal);
    }, 4000);

    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [enabled]);
}
