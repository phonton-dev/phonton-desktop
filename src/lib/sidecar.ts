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

import { getActiveProject } from "./projects";
import { ensureBundledSidecar } from "./bundled-sidecar-start";
import { spawnObservedShellChild } from "./shell-child-lifecycle";

let sidecarWorkspace: string | null = null;

export function setSidecarWorkspace(path: string | null): void {
  sidecarWorkspace = path;
}

function resolveWorkspaceDir(): string | null {
  return sidecarWorkspace ?? getActiveProject();
}

let child: { kill: () => Promise<void> } | null = null;
let rustSpawned = false;

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function sidecarProcessAlive(): Promise<boolean> {
  if (child) return true;
  try {
    return await invoke<boolean>("phonton_sidecar_alive");
  } catch {
    return false;
  }
}

function isWindows(): boolean {
  return navigator.userAgent.includes("Windows");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function spawnNamed(name: string, args: string[]): Promise<void> {
  await spawnObservedShellChild(Command.create(name, args), () => child, (value) => { child = value; });
}

async function spawnExeViaShell(exe: string): Promise<void> {
  const pathPrefix = await getPathSetPrefix();
  await spawnNamed("win-phonton-serve-resolved", [
    "/c",
    `${pathPrefix}${quoteWindowsArg(exe)} serve`,
  ]);
}

async function spawnViaShell(launch: ReturnType<typeof getPhontonLaunchSpec>, resolved: string): Promise<void> {
  if (isWindows()) {
    const vendorExe = await resolveVendorExeForServe();
    if (vendorExe) {
      await spawnExeViaShell(vendorExe);
      return;
    }
    if (launch) {
      await spawnNamed("win-phonton-serve-resolved", await windowsLaunchServeArgs(launch));
      return;
    }
    const pathPrefix = await getPathSetPrefix();
    await spawnNamed("win-phonton-serve-resolved", windowsServeArgsFromCmd(resolved, pathPrefix));
    return;
  }

  const cmd =
    launch?.kind === "exe"
      ? launch.exe
      : launch?.kind === "node"
        ? launch.script
        : resolved;
  await spawnNamed("unix-phonton-serve-resolved", [
    "-c",
    `'${cmd.replace(/'/g, "'\\''")}' serve`,
  ]);
}

async function verifyRustSidecar(): Promise<boolean> {
  await sleep(400);
  try {
    return await invoke<boolean>("phonton_sidecar_alive");
  } catch {
    return false;
  }
}

export async function startSidecar(): Promise<void> {
  if (!isTauri()) return;
  const bundled = await invoke<{ path: string; version: string; sha256: string } | null>("bundled_phonton_engine");
  if (child) return;
  if (bundled) {
    await ensureBundledSidecar(rustSpawned, {
      health: () => invoke<boolean>("serve_health"),
      spawn: async () => { await invoke<number>("spawn_phonton_serve", { exe: bundled.path, workspaceDir: resolveWorkspaceDir() }); },
      alive: verifyRustSidecar,
    });
    rustSpawned = true;
    return;
  }
  if (rustSpawned && !await invoke<boolean>("phonton_sidecar_alive")) rustSpawned = false;
  if (rustSpawned) return;

  const launch = getPhontonLaunchSpec();
  const resolved = getResolvedPhontonCmd();
  const errors: string[] = [];

  if (isWindows()) {
    const vendorExe = await resolveVendorExeForServe();
    if (vendorExe) {
      try {
        await invoke<number>("spawn_phonton_serve", {
          exe: vendorExe,
          workspaceDir: resolveWorkspaceDir(),
        });
        if (await verifyRustSidecar()) {
          rustSpawned = true;
          return;
        }
        rustSpawned = false;
        try {
          await invoke("stop_phonton_serve");
        } catch {
          /* ignore */
        }
        errors.push(`native spawn exited immediately (${vendorExe})`);
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
      await spawnNamed("win-phonton-serve-resolved", [
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

export async function restartSidecar(workspace?: string | null): Promise<void> {
  if (workspace !== undefined) setSidecarWorkspace(workspace);
  await stopSidecar();
  await startSidecar();
}
