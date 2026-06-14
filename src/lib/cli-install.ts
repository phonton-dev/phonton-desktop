import { Command } from "@tauri-apps/plugin-shell";
import { isTauri } from "./sidecar";

const PHONTON_CMD_KEY = "phonton.cli.cmd";
/** Must match a published npm version: `npm view phonton-cli version` */
export const CLI_VERSION = "0.19.7";

export type CliInstallState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "installing"; message: string }
  | { status: "done"; message: string }
  | { status: "error"; message: string };

function isWindows(): boolean {
  return navigator.userAgent.includes("Windows");
}

export function getResolvedPhontonCmd(): string {
  return localStorage.getItem(PHONTON_CMD_KEY) ?? "phonton";
}

export function setResolvedPhontonCmd(cmd: string) {
  localStorage.setItem(PHONTON_CMD_KEY, cmd);
}

function npmScope(base: string): string {
  return isWindows() ? `npm-cmd-${base}` : `npm-${base}`;
}

async function executeScoped(name: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const child = await Command.create(name, args).execute();
  return {
    code: child.code ?? 1,
    stdout: child.stdout ?? "",
    stderr: child.stderr ?? "",
  };
}

export function formatCliInstallError(raw: string): string {
  const text = raw.trim();
  if (/ETARGET|notarget|No matching version/i.test(text)) {
    return `phonton-cli@${CLI_VERSION} is not on npm yet. Run manually: npm install -g phonton-cli`;
  }
  if (/ENOENT|not found/i.test(text) && /npm/i.test(text)) {
    return "npm not found. Install Node.js from nodejs.org, then retry.";
  }
  if (/EACCES|permission denied/i.test(text)) {
    return "Permission denied. Try running Terminal as Administrator, or: npm install -g phonton-cli";
  }
  const firstLine = text.split(/\r?\n/).find((l) => l.trim())?.trim();
  return firstLine?.slice(0, 280) || "npm install failed. Try: npm install -g phonton-cli";
}

export async function checkNpmAvailable(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const result = await executeScoped(npmScope("version"), ["--version"]);
    return result.code === 0;
  } catch {
    return false;
  }
}

async function getNpmGlobalBin(): Promise<string | null> {
  try {
    const prefix = await executeScoped(npmScope("prefix"), ["prefix", "-g"]);
    if (prefix.code !== 0) return null;
    const root = prefix.stdout.trim();
    if (!root) return null;
    return isWindows() ? `${root}\\phonton.cmd` : `${root}/bin/phonton`;
  } catch {
    return null;
  }
}

export async function resolvePhontonOnPath(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    if (isWindows()) {
      const result = await executeScoped("where-phonton", ["phonton"]);
      if (result.code === 0) {
        const line = result.stdout.split(/\r?\n/).find((l) => l.trim())?.trim();
        if (line) {
          setResolvedPhontonCmd(line);
          return line;
        }
      }
    }
    const globalBin = await getNpmGlobalBin();
    if (globalBin) {
      setResolvedPhontonCmd(globalBin);
      return globalBin;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function installPhontonCli(
  onProgress?: (message: string) => void,
): Promise<{ ok: boolean; message: string }> {
  if (!isTauri()) {
    return { ok: false, message: "Automatic install requires the Phonton Desktop app." };
  }

  onProgress?.("Checking npm…");
  const hasNpm = await checkNpmAvailable();
  if (!hasNpm) {
    return {
      ok: false,
      message: "npm not found. Install Node.js from nodejs.org, then retry or use the install guide.",
    };
  }

  onProgress?.(`Installing phonton-cli@${CLI_VERSION}…`);
  try {
    const result = await executeScoped(npmScope("install-phonton"), [
      "install",
      "-g",
      `phonton-cli@${CLI_VERSION}`,
    ]);
    if (result.code !== 0) {
      const detail = (result.stderr || result.stdout).trim();
      return { ok: false, message: formatCliInstallError(detail) };
    }
  } catch (err) {
    return {
      ok: false,
      message: formatCliInstallError(err instanceof Error ? err.message : String(err)),
    };
  }

  onProgress?.("Locating phonton binary…");
  const resolved = await resolvePhontonOnPath();
  if (!resolved) {
    return {
      ok: false,
      message:
        "Install finished but phonton was not found on PATH. Restart the app or run: npm install -g phonton-cli",
    };
  }

  return { ok: true, message: `Installed — using ${resolved}` };
}
