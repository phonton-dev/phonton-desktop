import { check, type DownloadEvent } from "@tauri-apps/plugin-updater";
import { getName } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { isTauri } from "./sidecar";
import { beginAppUpdate } from "./app-update-lock";
import { ensureAppUpdateIdle } from "./app-update-safety";

export type UpdateCheckResult =
  | { status: "skipped" }
  | { status: "current" }
  | { status: "available"; version: string }
  | { status: "installed"; version: string }
  | { status: "error"; message: string };

function progressPercent(event: DownloadEvent, state: { total: number; downloaded: number }): number | null {
  if (event.event === "Started") {
    state.total = event.data.contentLength ?? 0;
    return 0;
  }
  if (event.event === "Progress") {
    state.downloaded += event.data.chunkLength;
    if (state.total > 0) {
      return Math.min(100, Math.round((state.downloaded / state.total) * 100));
    }
  }
  return null;
}

export async function checkForAppUpdate(
  options: { install?: boolean; onProgress?: (pct: number) => void; signal?: AbortSignal } = {},
): Promise<UpdateCheckResult> {
  if (options.signal?.aborted || !isTauri()) return { status: "skipped" };

  let finish: (() => void) | undefined;
  try {
    if (await getName() === "Phonton Preview") return { status: "skipped" };
    if (options.signal?.aborted) return { status: "skipped" };
    if (options.install) {
      finish = beginAppUpdate();
      await ensureAppUpdateIdle();
      if (options.signal?.aborted) return { status: "skipped" };
    }
    const update = await check();
    if (options.signal?.aborted) return { status: "skipped" };
    if (!update) return { status: "current" };

    if (!options.install) {
      return { status: "available", version: update.version };
    }

    const progress = { total: 0, downloaded: 0 };
    await update.downloadAndInstall((event) => {
      const pct = progressPercent(event, progress);
      if (pct != null) options.onProgress?.(pct);
    });

    await relaunch();
    return { status: "installed", version: update.version };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  } finally { finish?.(); }
}

/** Silent check on launch; prompts only when a newer signed build exists. */
export async function checkForAppUpdateOnLaunch(signal?: AbortSignal): Promise<void> {
  const result = await checkForAppUpdate({ signal });
  if (signal?.aborted) return;
  if (result.status === "error") {
    console.warn("Update check failed:", result.message);
    return;
  }
  if (result.status !== "available") return;

  const install = window.confirm(
    `Phonton ${result.version} is available. Download and install now? The app will restart.`,
  );
  if (!install || signal?.aborted) return;

  await checkForAppUpdate({ install: true, signal });
}
