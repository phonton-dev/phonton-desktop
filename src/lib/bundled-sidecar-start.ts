type BundledSidecar = {
  health: () => Promise<boolean>;
  spawn: () => Promise<void>;
  alive: () => Promise<boolean>;
};

/** Reconnect through the native lifecycle even when an old child is still alive. */
export async function ensureBundledSidecar(startedInThisView: boolean, sidecar: BundledSidecar): Promise<void> {
  if (startedInThisView) {
    try {
      if (await sidecar.health()) return;
    } catch {
      // The native spawn command checks ownership and decides whether to keep
      // the child, replace a stale starter, or report an unsafe recovery.
    }
  }

  await sidecar.spawn();
  if (await sidecar.alive()) return;
  // A concurrent reconnect may already have replaced the failed child.
  // The next native spawn reaps an exited child by its tracked PID.
  throw new Error("The bundled local engine exited during startup. Check whether another engine already owns its port.");
}