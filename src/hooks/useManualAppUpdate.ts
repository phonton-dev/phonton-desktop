import { useSyncExternalStore } from "react";
import { checkForAppUpdate } from "../lib/app-updater";

type State = { message: string; available: string | null; busy: "check" | "install" | null };
let state: State = { message: "", available: null, busy: null };
const listeners = new Set<() => void>();
const snapshot = () => state;
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
function patch(change: Partial<State>) { state = { ...state, ...change }; for (const listener of listeners) listener(); }
const setMessage = (message: string) => patch({ message });
const setAvailable = (available: string | null) => patch({ available });
const setBusy = (busy: State["busy"]) => patch({ busy });

const run = async (install: boolean) => {
  if (state.busy) return;
  setBusy(install ? "install" : "check");
  setMessage(install ? "Downloading update…" : "Checking for updates…");
  if (!install) setAvailable(null);
  try {
    const result = await checkForAppUpdate({ install,
      onProgress: install ? pct => setMessage(`Downloading update… ${pct}%`) : undefined });
    switch (result.status) {
      case "available":
        setAvailable(result.version);
        setMessage(`Phonton ${result.version} is available.`);
        break;
      case "current":
        setAvailable(null);
        setMessage(install ? "That update is no longer available. Check again for updates." : "You're on the latest version.");
        break;
      case "skipped":
        setAvailable(null);
        setMessage("Updates are unavailable in this build.");
        break;
      case "installed":
        setAvailable(null);
        setMessage(`Phonton ${result.version} is installed. Restarting…`);
        break;
      case "error":
        setMessage(result.message);
        break;
    }
  } catch (error) {
    setMessage(error instanceof Error ? error.message : String(error));
  } finally {
    setBusy(null);
  }
};

/** State survives navigation; remounting cannot create a second installation. */
export function useManualAppUpdate() {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);
  return { ...current, check: () => run(false), install: () => run(true) };
}
