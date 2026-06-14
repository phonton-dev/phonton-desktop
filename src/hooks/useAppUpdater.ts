import { useEffect } from "react";
import { checkForAppUpdateOnLaunch } from "../lib/app-updater";
import { isTauri } from "../lib/sidecar";

/** Check GitHub Releases for a signed update a few seconds after launch. */
export function useAppUpdater() {
  useEffect(() => {
    if (!isTauri()) return;

    const timer = window.setTimeout(() => {
      void checkForAppUpdateOnLaunch();
    }, 4000);

    return () => window.clearTimeout(timer);
  }, []);
}
