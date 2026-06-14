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

/** Prefer phonton.cmd on Windows — extensionless npm shims are not runnable via cmd.exe. */
export function normalizeWindowsPhontonCmd(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".cmd") || lower.endsWith(".exe")) return path;
  return `${path}.cmd`;
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

async function fileExists(path: string): Promise<boolean> {
  try {
    const quoted = `"${path.replace(/"/g, '\\"')}"`;
    const result = await executeScoped("win-test-phonton-cmd", ["/c", `if exist ${quoted} (echo yes)`]);
    return result.stdout.trim().toLowerCase() === "yes";
  } catch {
    return false;
  }
}

function pickWindowsWhereLine(lines: string[]): string | null {
  const trimmed = lines.map((l) => l.trim()).filter(Boolean);
  const cmdLine = trimmed.find((l) => l.toLowerCase().endsWith(".cmd"));
  if (cmdLine) return cmdLine;
  const exeLine = trimmed.find((l) => l.toLowerCase().endsWith(".exe"));
  if (exeLine) return exeLine;
  return trimmed[0] ?? null;
}

async function normalizeResolvedPath(path: string): Promise<string> {
  if (!isWindows()) return path;
  const cmdPath = normalizeWindowsPhontonCmd(path);
  if (cmdPath !== path && (await fileExists(cmdPath))) return cmdPath;
  if (await fileExists(path)) return path;
  return cmdPath;
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

export async function verifyPhontonCli(cmd?: string): Promise<boolean> {
  if (!isTauri()) return false;
  const resolved = cmd ?? getResolvedPhontonCmd();
  try {
    if (isWindows()) {
      const winCmd = normalizeWindowsPhontonCmd(resolved);
      const quoted = `"${winCmd.replace(/"/g, '\\"')}"`;
      const result = await executeScoped("win-phonton-verify", ["/c", `${quoted} --version`]);
      return result.code === 0 && /\d/.test(result.stdout);
    }
    const result = await executeScoped("unix-phonton-verify", [
      "-c",
      `'${resolved.replace(/'/g, "'\\''")}' --version`,
    ]);
    return result.code === 0 && /\d/.test(result.stdout);
  } catch {
    return false;
  }
}

export async function resolvePhontonOnPath(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    if (isWindows()) {
      const result = await executeScoped("where-phonton", ["phonton"]);
      if (result.code === 0) {
        const line = pickWindowsWhereLine(result.stdout.split(/\r?\n/));
        if (line) {
          const normalized = await normalizeResolvedPath(line);
          if (await verifyPhontonCli(normalized)) {
            setResolvedPhontonCmd(normalized);
            return normalized;
          }
        }
      }
    }
    const globalBin = await getNpmGlobalBin();
    if (globalBin && (await verifyPhontonCli(globalBin))) {
      setResolvedPhontonCmd(globalBin);
      return globalBin;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Detect existing CLI before running npm install. */
export async function ensurePhontonCli(
  onProgress?: (message: string) => void,
): Promise<{ ok: boolean; message: string; installed: boolean }> {
  if (!isTauri()) {
    return { ok: false, message: "Automatic install requires the Phonton Desktop app.", installed: false };
  }

  onProgress?.("Checking for phonton-cli…");
  const existing = await resolvePhontonOnPath();
  if (existing) {
    return { ok: true, message: `Found phonton-cli — ${existing}`, installed: false };
  }

  onProgress?.("Checking npm…");
  const hasNpm = await checkNpmAvailable();
  if (!hasNpm) {
    return {
      ok: false,
      message: "npm not found. Install Node.js from nodejs.org, then retry or use the install guide.",
      installed: false,
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
      return { ok: false, message: formatCliInstallError(detail), installed: false };
    }
  } catch (err) {
    return {
      ok: false,
      message: formatCliInstallError(err instanceof Error ? err.message : String(err)),
      installed: false,
    };
  }

  onProgress?.("Locating phonton binary…");
  const resolved = await resolvePhontonOnPath();
  if (!resolved) {
    return {
      ok: false,
      message:
        "Install finished but phonton was not found on PATH. Restart the app or run: npm install -g phonton-cli",
      installed: true,
    };
  }

  return { ok: true, message: `Installed — using ${resolved}`, installed: true };
}

export async function installPhontonCli(
  onProgress?: (message: string) => void,
): Promise<{ ok: boolean; message: string }> {
  const result = await ensurePhontonCli(onProgress);
  return { ok: result.ok, message: result.message };
}
