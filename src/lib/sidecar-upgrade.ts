import { ensurePhontonCli } from "./cli-install";
import { isServeVersionSupported, MIN_SERVE_CLI_VERSION } from "./cli-version";
import { checkServeHealth, ping, waitForPing } from "./serve";
import { clearStaleServePort, restartSidecar, stopSidecar } from "./sidecar";

export type SidecarConnectResult =
  | { ok: true; version: string; handoffSchema: string }
  | {
      ok: false;
      reason: "offline" | "upgrade_required" | "upgrade_failed";
      error: string;
      installedVersion?: string;
    };

async function pingSidecar(): Promise<{ version: string; handoff_schema: string } | null> {
  if (!(await checkServeHealth())) return null;
  try {
    return await ping();
  } catch {
    return null;
  }
}

/**
 * Ensure phonton serve responds with a CLI version that supports desktop RPC.
 * Kills stale listeners, upgrades npm package when needed, and restarts sidecar.
 */
export async function ensureSidecarReady(
  bootstrap = false,
  onProgress?: (message: string) => void,
): Promise<SidecarConnectResult> {
  onProgress?.("Checking sidecar…");
  let info = await pingSidecar();

  if (info && isServeVersionSupported(info.version)) {
    return { ok: true, version: info.version, handoffSchema: info.handoff_schema };
  }

  if (info && !isServeVersionSupported(info.version)) {
    onProgress?.(
      `Sidecar v${info.version} is too old (need v${MIN_SERVE_CLI_VERSION}+). Upgrading…`,
    );
  }

  await clearStaleServePort();
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
      error: "ping timeout — phonton serve did not respond on :47831",
    };
  }

  if (!isServeVersionSupported(info.version)) {
    return {
      ok: false,
      reason: "upgrade_required",
      error: `Sidecar is v${info.version}; Phonton Desktop requires phonton-cli v${MIN_SERVE_CLI_VERSION}+. Run: npm install -g phonton-cli@${MIN_SERVE_CLI_VERSION}`,
      installedVersion: info.version,
    };
  }

  return { ok: true, version: info.version, handoffSchema: info.handoff_schema };
}
