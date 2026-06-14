import { check, type DownloadEvent } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { isTauri } from "./sidecar";

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
  options: { install?: boolean; onProgress?: (pct: number) => void } = {},
): Promise<UpdateCheckResult> {
  if (!isTauri()) return { status: "skipped" };

  try {
    const update = await check();
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
  }
}

/** Silent check on launch; prompts only when a newer signed build exists. */
export async function checkForAppUpdateOnLaunch(): Promise<void> {
  const result = await checkForAppUpdate();
  if (result.status !== "available") return;

  const install = window.confirm(
    `Phonton ${result.version} is available. Download and install now? The app will restart.`,
  );
  if (!install) return;

  await checkForAppUpdate({ install: true });
}
