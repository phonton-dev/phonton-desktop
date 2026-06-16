import { invoke } from "@tauri-apps/api/core";
import { Command } from "@tauri-apps/plugin-shell";
import {
  getPathSetPrefix,
  getPhontonLaunchSpec,
  getResolvedPhontonCmd,
  normalizeWindowsPhontonCmd,
  resolveVendorExeForServe,
  windowsLaunchServeArgs,
} from "./cli-install";

let child: { kill: () => Promise<void> } | null = null;
let rustSpawned = false;

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

function spawnDetail(launch: ReturnType<typeof getPhontonLaunchSpec>): string {
  if (!launch) return "no launch spec";
  if (launch.kind === "exe") return `exe ${launch.exe}`;
  if (launch.kind === "node") return `node ${launch.script}`;
  return `cmd ${launch.cmd}`;
}

async function spawnNamed(name: string, args: string[]) {
  return Command.create(name, args).spawn();
}

async function spawnViaShell(launch: ReturnType<typeof getPhontonLaunchSpec>, resolved: string): Promise<void> {
  if (isWindows()) {
    if (launch) {
      child = await spawnNamed("win-phonton-serve-resolved", await windowsLaunchServeArgs(launch));
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
}

export async function startSidecar(): Promise<void> {
  if (!isTauri()) return;
  if (child || rustSpawned) return;

  const launch = getPhontonLaunchSpec();
  const resolved = getResolvedPhontonCmd();
  const errors: string[] = [];

  if (isWindows()) {
    const vendorExe = await resolveVendorExeForServe();
    if (vendorExe) {
      try {
        await invoke<number>("spawn_phonton_serve", { exe: vendorExe });
        rustSpawned = true;
        return;
      } catch (err) {
        errors.push(
          `native spawn (${vendorExe}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  try {
    await spawnViaShell(launch, resolved);
    return;
  } catch (err) {
    errors.push(`shell spawn (${spawnDetail(launch)}): ${err instanceof Error ? err.message : String(err)}`);
  }

  if (isWindows()) {
    try {
      const pathPrefix = await getPathSetPrefix();
      child = await spawnNamed("win-phonton-serve-resolved", [
        "/c",
        `${pathPrefix}${quoteWindowsArg("phonton.cmd")} serve`,
      ]);
      return;
    } catch (err) {
      errors.push(`phonton.cmd fallback: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new Error(errors.join("; ") || "spawn failed");
}

export async function stopSidecar(): Promise<void> {
  if (rustSpawned) {
    try {
      await invoke("stop_phonton_serve");
    } catch {
      /* ignore */
    }
    rustSpawned = false;
  }
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
