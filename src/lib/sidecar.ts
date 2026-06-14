import { Command } from "@tauri-apps/plugin-shell";
import { getResolvedPhontonCmd } from "./cli-install";

let child: { kill: () => Promise<void> } | null = null;

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function isWindows(): boolean {
  return navigator.userAgent.includes("Windows");
}

async function spawnNamed(name: string, args: string[]) {
  const cmd = Command.create(name, args);
  return cmd.spawn();
}

export async function startSidecar(): Promise<void> {
  if (!isTauri() || child) return;

  const resolved = getResolvedPhontonCmd();

  try {
    if (isWindows()) {
      child = await spawnNamed("win-phonton-serve-resolved", ["/c", resolved, "serve"]);
      return;
    }
    child = await spawnNamed("unix-phonton-serve-resolved", [
      "-c",
      `'${resolved.replace(/'/g, "'\\''")}' serve`,
    ]);
  } catch (err) {
    try {
      child = await spawnNamed("phonton-serve", ["serve"]);
      return;
    } catch {
      if (isWindows()) {
        try {
          child = await spawnNamed("win-phonton-serve", ["/c", "phonton", "serve"]);
          return;
        } catch {
          /* fall through */
        }
      }
    }
    console.warn("Sidecar spawn failed — run `phonton serve` manually", err);
  }
}

export async function stopSidecar(): Promise<void> {
  if (!child) return;
  try {
    await child.kill();
  } catch {
    /* ignore */
  }
  child = null;
}
