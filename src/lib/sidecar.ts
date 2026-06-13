import { Command } from "@tauri-apps/plugin-shell";

let child: { kill: () => Promise<void> } | null = null;

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function isWindows(): boolean {
  return navigator.userAgent.includes("Windows");
}

async function spawnServe(name: string, args: string[]) {
  const cmd = Command.create(name, args);
  return cmd.spawn();
}

export async function startSidecar(): Promise<void> {
  if (!isTauri() || child) return;
  try {
    child = await spawnServe("phonton-serve", ["serve"]);
  } catch (err) {
    if (isWindows()) {
      try {
        child = await spawnServe("win-phonton-serve", ["/c", "phonton", "serve"]);
        return;
      } catch {
        /* fall through */
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
