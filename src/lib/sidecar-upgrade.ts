import { ensurePhontonCli } from "./cli-install";
import { isServeVersionSupported, MIN_SERVE_CLI_VERSION } from "./cli-version";
import { supportsLocalHarnessCapabilities } from "./engine-capabilities";
import { checkServeHealth, ping, waitForPing, type EnginePing } from "./serve";
import { isTauri, restartSidecar, stopSidecar } from "./sidecar";

export type SidecarConnectResult =
  | { ok: true; version: string; handoffSchema: string }
  | {
      ok: false;
      reason: "offline" | "upgrade_required" | "upgrade_failed";
      error: string;
      installedVersion?: string;
    };

async function pingSidecar(): Promise<EnginePing | null> {
  if (!(await checkServeHealth())) return null;
  try {
    return await ping();
  } catch {
    return null;
  }
}

function supportsRequestedWork(info: EnginePing, requireLocalHarness: boolean): boolean {
  return isServeVersionSupported(info.version)
    && (!requireLocalHarness || supportsLocalHarnessCapabilities(info));
}

function incompatibleEngine(info: EnginePing, requireLocalHarness: boolean): SidecarConnectResult {
  return {
    ok: false,
    reason: "upgrade_required",
    installedVersion: info.version,
    error: !isServeVersionSupported(info.version)
      ? `The installed engine is v${info.version}. Desktop serve RPC needs v${MIN_SERVE_CLI_VERSION} or newer.`
      : requireLocalHarness
        ? `Engine v${info.version} does not advertise the current local model catalog, storage and coding-run APIs. Connect the bundled Phonton local engine, then reconnect.`
        : `Engine v${info.version} does not support this Desktop session.`,
  };
}

/**
 * Ensure phonton serve responds with a CLI version that supports desktop RPC.
 * Local startup only connects. Explicit upgrade may install and restart the
 * app-owned sidecar; it never terminates an unrelated port listener.
 */
export async function ensureSidecarReady(
  bootstrap = false,
  onProgress?: (message: string) => void,
  allowInstall = false,
  requireLocalHarness = false,
): Promise<SidecarConnectResult> {
  onProgress?.("Checking sidecar…");
  let info = await pingSidecar();
  // A live native child may still be binding its server after the short
  // process-liveness check. Wait for readiness before settling offline.
  if (!info && isTauri()) {
    onProgress?.("Waiting for local engine…");
    info = await waitForPing(bootstrap);
  }

  if (info && supportsRequestedWork(info, requireLocalHarness)) {
    return { ok: true, version: info.version, handoffSchema: info.handoff_schema };
  }

  if (!allowInstall) {
    return info
      ? incompatibleEngine(info, requireLocalHarness)
      : { ok: false, reason: "offline",
          error: "No local engine responded. Start it with the command below, then reconnect. Nothing was downloaded." };
  }

  if (info && !isServeVersionSupported(info.version)) {
    onProgress?.(
      `Sidecar v${info.version} is too old (need v${MIN_SERVE_CLI_VERSION}+). Upgrading…`,
    );
  }

  await stopSidecar();

  const upgrade = await ensurePhontonCli(onProgress);
  if (!upgrade.ok) {
    return {
      ok: false,
      reason: "upgrade_failed",
      error: upgrade.message,
      installedVersion: info?.version,
    };
  }

  onProgress?.("Restarting phonton serve…");
  try {
    await restartSidecar();
  } catch (err) {
    return {
      ok: false,
      reason: "offline",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  info = await waitForPing(bootstrap);
  if (!info) {
    return {
      ok: false,
      reason: "offline",
      error: "ping timeout - phonton serve did not respond on :47831",
    };
  }

  if (!supportsRequestedWork(info, requireLocalHarness)) return incompatibleEngine(info, requireLocalHarness);

  return { ok: true, version: info.version, handoffSchema: info.handoff_schema };
}
