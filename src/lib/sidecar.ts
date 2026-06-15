import { Command } from "@tauri-apps/plugin-shell";
import {
  getPathSetPrefix,
  getPhontonLaunchSpec,
  getResolvedPhontonCmd,
  normalizeWindowsPhontonCmd,
  windowsLaunchServeArgs,
} from "./cli-install";

let child: { kill: () => Promise<void> } | null = null;

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function isWindows(): boolean {
  return navigator.userAgent.includes("Windows");
}

function quoteWindowsArg(path: string): string {
  return `"${path.replace(/"/g, '\\"')}"`;
}

function windowsServeArgsFromCmd(resolved: string, pathPrefix: string): string[] {
  const cmd = normalizeWindowsPhontonCmd(resolved);
  return ["/c", `${pathPrefix}${quoteWindowsArg(cmd)} serve`];
}

async function spawnNamed(name: string, args: string[]) {
  return Command.create(name, args).spawn();
}

export async function startSidecar(): Promise<void> {
  if (!isTauri() || child) return;

  const launch = getPhontonLaunchSpec();
  const resolved = getResolvedPhontonCmd();

  try {
    if (isWindows()) {
      if (launch) {
        child = await spawnNamed("win-phonton-serve-resolved", windowsLaunchServeArgs(launch));
        return;
      }
      const pathPrefix = await getPathSetPrefix();
      child = await spawnNamed("win-phonton-serve-resolved", windowsServeArgsFromCmd(resolved, pathPrefix));
      return;
    }
    const cmd =
      launch?.kind === "exe"
        ? launch.exe
        : launch?.kind === "node"
          ? launch.script
          : resolved;
    child = await spawnNamed("unix-phonton-serve-resolved", [
      "-c",
      `'${cmd.replace(/'/g, "'\\''")}' serve`,
    ]);
  } catch (err) {
    try {
      child = await spawnNamed("phonton-serve", ["serve"]);
      return;
    } catch {
      if (isWindows()) {
        try {
          const pathPrefix = await getPathSetPrefix();
          child = await spawnNamed("win-phonton-serve-resolved", [
            "/c",
            `${pathPrefix}${quoteWindowsArg("phonton.cmd")} serve`,
          ]);
          return;
        } catch {
          try {
            child = await spawnNamed("win-phonton-serve", ["/c", "phonton", "serve"]);
            return;
          } catch {
            /* fall through */
          }
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

export async function restartSidecar(): Promise<void> {
  await stopSidecar();
  await startSidecar();
}
