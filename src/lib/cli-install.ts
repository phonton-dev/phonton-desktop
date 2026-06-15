import { Command } from "@tauri-apps/plugin-shell";
import { homeDir, join } from "@tauri-apps/api/path";
import { isTauri } from "./sidecar";

const PHONTON_CMD_KEY = "phonton.cli.cmd";
const PHONTON_LAUNCH_KEY = "phonton.cli.launch";
const PHONTON_EXE_KEY = "phonton.cli.exe";
const PHONTON_NODE_KEY = "phonton.cli.node";
const PHONTON_SCRIPT_KEY = "phonton.cli.script";

/** Last known published npm version when registry is unreachable. */
export const CLI_VERSION_FALLBACK = "0.19.7";

export type CliInstallState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "installing"; message: string }
  | { status: "done"; message: string }
  | { status: "error"; message: string };

export type PhontonLaunchSpec =
  | { kind: "exe"; exe: string; cmd: string }
  | { kind: "node"; node: string; script: string; cmd: string }
  | { kind: "cmd"; cmd: string };

let cachedLatestVersion: string | null = null;

function isWindows(): boolean {
  return navigator.userAgent.includes("Windows");
}

function normalizeShellOutput(text: string): string {
  return text.replace(/\r/g, "").trim();
}

export function getResolvedPhontonCmd(): string {
  return localStorage.getItem(PHONTON_CMD_KEY) ?? "phonton";
}

export function setResolvedPhontonCmd(cmd: string) {
  localStorage.setItem(PHONTON_CMD_KEY, cmd);
}

export function getPhontonLaunchSpec(): PhontonLaunchSpec | null {
  const kind = localStorage.getItem(PHONTON_LAUNCH_KEY);
  const cmd = localStorage.getItem(PHONTON_CMD_KEY);
  if (!cmd) return null;
  if (kind === "exe") {
    const exe = localStorage.getItem(PHONTON_EXE_KEY);
    if (exe) return { kind: "exe", exe, cmd };
  }
  if (kind === "node") {
    const node = localStorage.getItem(PHONTON_NODE_KEY);
    const script = localStorage.getItem(PHONTON_SCRIPT_KEY);
    if (node && script) return { kind: "node", node, script, cmd };
  }
  if (kind === "cmd" || !kind) return { kind: "cmd", cmd };
  return null;
}

export function setPhontonLaunchSpec(spec: PhontonLaunchSpec) {
  setResolvedPhontonCmd(spec.cmd);
  localStorage.setItem(PHONTON_LAUNCH_KEY, spec.kind);
  if (spec.kind === "exe") {
    localStorage.setItem(PHONTON_EXE_KEY, spec.exe);
    localStorage.removeItem(PHONTON_NODE_KEY);
    localStorage.removeItem(PHONTON_SCRIPT_KEY);
  } else if (spec.kind === "node") {
    localStorage.setItem(PHONTON_NODE_KEY, spec.node);
    localStorage.setItem(PHONTON_SCRIPT_KEY, spec.script);
    localStorage.removeItem(PHONTON_EXE_KEY);
  } else {
    localStorage.removeItem(PHONTON_EXE_KEY);
    localStorage.removeItem(PHONTON_NODE_KEY);
    localStorage.removeItem(PHONTON_SCRIPT_KEY);
  }
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

function quoteWindowsArg(path: string): string {
  return `"${path.replace(/"/g, '\\"')}"`;
}

function parseVersionParts(version: string): number[] {
  return version
    .replace(/^v/i, "")
    .split(".")
    .map((part) => parseInt(part.replace(/[^0-9].*$/, ""), 10) || 0);
}

function versionLessThan(a: string, b: string): boolean {
  const left = parseVersionParts(a);
  const right = parseVersionParts(b);
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i += 1) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l < r) return true;
    if (l > r) return false;
  }
  return false;
}

function phontonJsFromCmd(cmdPath: string): string {
  const sep = cmdPath.lastIndexOf("\\");
  const dir = sep >= 0 ? cmdPath.slice(0, sep) : cmdPath;
  return `${dir}\\node_modules\\phonton-cli\\npm\\bin\\phonton.js`;
}

function phontonExeFromGlobalRoot(globalRoot: string): string {
  return `${globalRoot}\\phonton-cli\\npm\\vendor\\phonton.exe`;
}

function phontonJsFromGlobalRoot(globalRoot: string): string {
  return `${globalRoot}\\phonton-cli\\npm\\bin\\phonton.js`;
}

function phontonInstallJsFromGlobalRoot(globalRoot: string): string {
  return `${globalRoot}\\phonton-cli\\npm\\install.js`;
}

let cachedWindowsPathDirs: string[] | null = null;

async function resolveUserHome(): Promise<string> {
  try {
    return await homeDir();
  } catch {
    if (!isWindows()) throw new Error("homeDir unavailable");
    const result = await Command.create("win-test-phonton-cmd", ["/c", "echo %USERPROFILE%"]).execute();
    const home = normalizeShellOutput(result.stdout ?? "");
    if (!home) throw new Error("USERPROFILE unavailable");
    return home;
  }
}

/** Scoop / npm global dirs missing from GUI-app PATH on Windows. */
async function windowsPathDirs(): Promise<string[]> {
  if (cachedWindowsPathDirs) return cachedWindowsPathDirs;
  const home = await resolveUserHome();
  cachedWindowsPathDirs = [
    await join(home, "scoop", "shims"),
    await join(home, "scoop", "apps", "nodejs", "current"),
    await join(home, "scoop", "apps", "nodejs", "current", "bin"),
    await join(home, "scoop", "persist", "nodejs", "bin"),
    await join(home, "AppData", "Roaming", "npm"),
    "C:\\Program Files\\nodejs",
  ];
  return cachedWindowsPathDirs;
}

async function getEnrichedPath(): Promise<string | undefined> {
  if (!isWindows()) return undefined;
  const dirs = await windowsPathDirs();
  let base = "";
  try {
    const result = await Command.create("win-test-phonton-cmd", ["/c", "echo %PATH%"]).execute();
    base = normalizeShellOutput(result.stdout ?? "");
  } catch {
    /* use supplement only */
  }
  return [...dirs, base].filter(Boolean).join(";");
}

/** Prefix for cmd /c so npm/node shims work from the Tauri webview on Windows. */
export async function getPathSetPrefix(): Promise<string> {
  const enriched = await getEnrichedPath();
  if (!enriched) return "";
  return `set "PATH=${enriched};%PATH%" && `;
}

function npmCommandLine(name: string, args: string[]): string {
  if (name.includes("version") && !name.includes("view")) return "npm.cmd --version";
  if (name.includes("prefix")) return "npm.cmd prefix -g";
  if (name.includes("root")) return "npm.cmd root -g";
  if (name.includes("view")) return "npm.cmd view phonton-cli version";
  return `npm.cmd ${args.join(" ")}`;
}

async function executeScoped(name: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  if (isWindows()) {
    const prefix = await getPathSetPrefix();
    if (name === "where-phonton") {
      const child = await Command.create("win-test-phonton-cmd", ["/c", `${prefix}where phonton`]).execute();
      return {
        code: child.code ?? 1,
        stdout: child.stdout ?? "",
        stderr: child.stderr ?? "",
      };
    }
    if (name.startsWith("npm-cmd-") || name.startsWith("npm-")) {
      const child = await Command.create("win-test-phonton-cmd", [
        "/c",
        `${prefix}${npmCommandLine(name, args)}`,
      ]).execute();
      return {
        code: child.code ?? 1,
        stdout: child.stdout ?? "",
        stderr: child.stderr ?? "",
      };
    }
    if (name === "win-phonton-verify" && args[0] === "/c" && args[1]) {
      const child = await Command.create("win-test-phonton-cmd", ["/c", `${prefix}${args[1]}`]).execute();
      return {
        code: child.code ?? 1,
        stdout: child.stdout ?? "",
        stderr: child.stderr ?? "",
      };
    }
    if (name === "win-phonton-run" && args[0] === "/c" && args[1]) {
      const child = await Command.create("win-test-phonton-cmd", ["/c", args[1]]).execute();
      return {
        code: child.code ?? 1,
        stdout: child.stdout ?? "",
        stderr: child.stderr ?? "",
      };
    }
    if (name === "win-test-phonton-cmd" && args[0] === "/c" && args[1]) {
      const child = await Command.create("win-test-phonton-cmd", ["/c", args[1]]).execute();
      return {
        code: child.code ?? 1,
        stdout: child.stdout ?? "",
        stderr: child.stderr ?? "",
      };
    }
  }

  const child = await Command.create(name, args).execute();
  return {
    code: child.code ?? 1,
    stdout: child.stdout ?? "",
    stderr: child.stderr ?? "",
  };
}

async function fileExists(path: string): Promise<boolean> {
  if (!isWindows()) {
    try {
      const result = await executeScoped("unix-phonton-verify", [
        "-c",
        `test -e '${path.replace(/'/g, "'\\''")}'`,
      ]);
      return result.code === 0;
    } catch {
      return false;
    }
  }

  const lower = path.toLowerCase();
  if (lower.endsWith(".exe") || lower.endsWith(".cmd")) {
    try {
      const line =
        lower.endsWith(".exe") || lower.endsWith(".cmd")
          ? `${quoteWindowsArg(path)} --version`
          : `${quoteWindowsArg(path)} --version`;
      const result = await runWindowsLaunchLine(line);
      if (result.code === 0 && /\d/.test(`${result.stdout}${result.stderr}`)) return true;
    } catch {
      /* try existence checks */
    }
  }

  try {
    const quoted = quoteWindowsArg(path);
    const exist = await executeScoped("win-test-phonton-cmd", ["/c", `if exist ${quoted} echo yes`]);
    if (/\byes\b/i.test(exist.stdout)) return true;

    const dir = await executeScoped("win-test-phonton-cmd", ["/c", `dir /a-d /b ${quoted} 2>nul`]);
    return dir.code === 0 && Boolean(dir.stdout.trim());
  } catch {
    return false;
  }
}

async function runWindowsLaunchLine(line: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return executeScoped("win-phonton-run", ["/c", line]);
}

function launchVersionLine(spec: PhontonLaunchSpec): string {
  if (spec.kind === "exe") return `${quoteWindowsArg(spec.exe)} --version`;
  if (spec.kind === "node") {
    return `${quoteWindowsArg(spec.node)} ${quoteWindowsArg(spec.script)} --version`;
  }
  return `${quoteWindowsArg(normalizeWindowsPhontonCmd(spec.cmd))} --version`;
}

function launchServeLine(spec: PhontonLaunchSpec): string {
  if (spec.kind === "exe") return `${quoteWindowsArg(spec.exe)} serve`;
  if (spec.kind === "node") {
    return `${quoteWindowsArg(spec.node)} ${quoteWindowsArg(spec.script)} serve`;
  }
  return `${quoteWindowsArg(normalizeWindowsPhontonCmd(spec.cmd))} serve`;
}

export function windowsLaunchServeArgs(spec: PhontonLaunchSpec): string[] {
  return ["/c", launchServeLine(spec)];
}

async function verifyLaunchSpec(spec: PhontonLaunchSpec): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    if (isWindows()) {
      const result = await runWindowsLaunchLine(launchVersionLine(spec));
      return result.code === 0 && /\d/.test(`${result.stdout}${result.stderr}`);
    }
    const cmd = spec.kind === "exe" ? spec.exe : spec.kind === "node" ? spec.script : spec.cmd;
    const result = await executeScoped("unix-phonton-verify", [
      "-c",
      `'${cmd.replace(/'/g, "'\\''")}' --version`,
    ]);
    return result.code === 0 && /\d/.test(result.stdout);
  } catch {
    return false;
  }
}

async function readInstalledVersion(spec: PhontonLaunchSpec): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    if (isWindows()) {
      const result = await runWindowsLaunchLine(launchVersionLine(spec));
      const text = `${result.stdout}\n${result.stderr}`;
      const match = text.match(/(\d+\.\d+\.\d+)/);
      return match?.[1] ?? null;
    }
    const cmd = spec.kind === "exe" ? spec.exe : spec.kind === "node" ? spec.script : spec.cmd;
    const result = await executeScoped("unix-phonton-verify", [
      "-c",
      `'${cmd.replace(/'/g, "'\\''")}' --version`,
    ]);
    const match = result.stdout.match(/(\d+\.\d+\.\d+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

async function getNpmGlobalPrefix(): Promise<string | null> {
  try {
    const prefix = await executeScoped(npmScope("prefix"), ["prefix", "-g"]);
    if (prefix.code !== 0) return null;
    const root = normalizeShellOutput(prefix.stdout);
    return root || null;
  } catch {
    return null;
  }
}

async function getNpmGlobalRoot(): Promise<string | null> {
  try {
    const root = await executeScoped(npmScope("root"), ["root", "-g"]);
    if (root.code !== 0) return null;
    const value = normalizeShellOutput(root.stdout);
    return value || null;
  } catch {
    return null;
  }
}

async function getNpmGlobalBin(): Promise<string | null> {
  const prefix = await getNpmGlobalPrefix();
  if (!prefix) return null;
  return isWindows() ? `${prefix}\\phonton.cmd` : `${prefix}/bin/phonton`;
}

type NpmLayout = {
  cmd: string;
  globalRoot: string;
  exe: string;
  script: string;
};

async function getNpmLayout(): Promise<NpmLayout | null> {
  const prefix = await getNpmGlobalPrefix();
  const globalRoot = await getNpmGlobalRoot();
  if (!prefix || !globalRoot) return null;
  const cmd = isWindows() ? `${prefix}\\phonton.cmd` : `${prefix}/bin/phonton`;
  return {
    cmd,
    globalRoot,
    exe: isWindows() ? phontonExeFromGlobalRoot(globalRoot) : `${globalRoot}/phonton-cli/npm/vendor/phonton`,
    script: isWindows() ? phontonJsFromGlobalRoot(globalRoot) : `${globalRoot}/phonton-cli/npm/bin/phonton.js`,
  };
}

async function nodeExeCandidates(cmdDir: string, home: string): Promise<string[]> {
  return [
    await join(home, "scoop", "apps", "nodejs", "current", "node.exe"),
    `${cmdDir}\\node.exe`,
    await join(home, "scoop", "apps", "nodejs", "current", "bin", "node.exe"),
    "C:\\Program Files\\nodejs\\node.exe",
  ];
}

async function resolveNodeForLayout(layout: NpmLayout): Promise<string | null> {
  const home = await resolveUserHome();
  const sep = layout.cmd.lastIndexOf("\\");
  const cmdDir = sep >= 0 ? layout.cmd.slice(0, sep) : layout.cmd;
  for (const node of await nodeExeCandidates(cmdDir, home)) {
    try {
      const result = await runWindowsLaunchLine(`${quoteWindowsArg(node)} --version`);
      if (result.code === 0 && /\d/.test(`${result.stdout}${result.stderr}`)) return node;
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

/** npm postinstall downloads vendor/phonton.exe — may be skipped on reinstall. */
async function bootstrapVendorBinary(
  layout: NpmLayout,
  onProgress?: (message: string) => void,
): Promise<boolean> {
  const exeSpec: PhontonLaunchSpec = { kind: "exe", exe: layout.exe, cmd: layout.cmd };
  if (await verifyLaunchSpec(exeSpec)) return true;

  const node = await resolveNodeForLayout(layout);
  if (!node) return false;

  const installJs = phontonInstallJsFromGlobalRoot(layout.globalRoot);
  onProgress?.("Downloading phonton native binary…");
  const installResult = await runWindowsLaunchLine(
    `${quoteWindowsArg(node)} ${quoteWindowsArg(installJs)}`,
  );
  if (installResult.code === 0 && (await verifyLaunchSpec(exeSpec))) return true;

  onProgress?.("Verifying phonton-cli wrapper…");
  const wrapperResult = await runWindowsLaunchLine(
    `${quoteWindowsArg(node)} ${quoteWindowsArg(layout.script)} --version`,
  );
  return wrapperResult.code === 0;
}

async function resolveLaunchFromLayout(
  layout: NpmLayout,
  onProgress?: (message: string) => void,
): Promise<PhontonLaunchSpec | null> {
  if (isWindows()) {
    await bootstrapVendorBinary(layout, onProgress);

    const exeSpec: PhontonLaunchSpec = { kind: "exe", exe: layout.exe, cmd: layout.cmd };
    if (await verifyLaunchSpec(exeSpec)) {
      setPhontonLaunchSpec(exeSpec);
      return exeSpec;
    }
  }

  const node = await resolveNodeForLayout(layout);
  if (node) {
    const spec: PhontonLaunchSpec = { kind: "node", node, script: layout.script, cmd: layout.cmd };
    if (await verifyLaunchSpec(spec)) {
      setPhontonLaunchSpec(spec);
      return spec;
    }
    // phonton.js runs ensureBinary() on serve — accept when node resolves
    setPhontonLaunchSpec(spec);
    return spec;
  }

  if (await fileExists(layout.cmd)) {
    const cmdSpec: PhontonLaunchSpec = { kind: "cmd", cmd: layout.cmd };
    if (await verifyLaunchSpec(cmdSpec)) {
      setPhontonLaunchSpec(cmdSpec);
      return cmdSpec;
    }
  }

  return null;
}

async function resolveLaunchFromCmd(cmdPath: string): Promise<PhontonLaunchSpec | null> {
  const cmd = normalizeWindowsPhontonCmd(cmdPath);
  const sep = cmd.lastIndexOf("\\");
  const cmdDir = sep >= 0 ? cmd.slice(0, sep) : cmd;
  const globalRoot = `${cmdDir}\\node_modules`;
  const layout: NpmLayout = {
    cmd,
    globalRoot,
    exe: phontonExeFromGlobalRoot(globalRoot),
    script: phontonJsFromCmd(cmd),
  };
  return resolveLaunchFromLayout(layout);
}

async function layoutsToTry(): Promise<NpmLayout[]> {
  const layouts: NpmLayout[] = [];
  const fromNpm = await getNpmLayout();
  if (fromNpm) layouts.push(fromNpm);

  for (const cmd of await listWindowsPhontonCandidates()) {
    const sep = cmd.lastIndexOf("\\");
    const cmdDir = sep >= 0 ? cmd.slice(0, sep) : cmd;
    const globalRoot = `${cmdDir}\\node_modules`;
    layouts.push({
      cmd,
      globalRoot,
      exe: phontonExeFromGlobalRoot(globalRoot),
      script: phontonJsFromCmd(cmd),
    });
  }

  const seen = new Set<string>();
  return layouts.filter((layout) => {
    const key = `${layout.cmd}|${layout.globalRoot}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function listWindowsPhontonCandidates(): Promise<string[]> {
  const home = await resolveUserHome();
  const fromNpm = await getNpmGlobalBin();
  const candidates = [
    fromNpm,
    await join(home, "scoop", "persist", "nodejs", "bin", "phonton.cmd"),
    await join(home, "scoop", "apps", "nodejs", "current", "bin", "phonton.cmd"),
    await join(home, "AppData", "Roaming", "npm", "phonton.cmd"),
  ].filter((p): p is string => Boolean(p));
  return [...new Set(candidates)];
}


function pickWindowsWhereLine(lines: string[]): string | null {
  const trimmed = lines.map((l) => l.trim()).filter(Boolean);
  const cmdLine = trimmed.find((l) => l.toLowerCase().endsWith(".cmd"));
  if (cmdLine) return cmdLine;
  const exeLine = trimmed.find((l) => l.toLowerCase().endsWith(".exe"));
  if (exeLine) return exeLine;
  return trimmed[0] ?? null;
}

export function formatCliInstallError(raw: string, version = CLI_VERSION_FALLBACK): string {
  const text = raw.trim();
  if (/ETARGET|notarget|No matching version/i.test(text)) {
    return `phonton-cli@${version} is not on npm yet. Run manually: npm install -g phonton-cli`;
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

export async function resolveLatestCliVersion(): Promise<string> {
  if (cachedLatestVersion) return cachedLatestVersion;
  if (!isTauri()) return CLI_VERSION_FALLBACK;
  try {
    const result = await executeScoped(npmScope("view-phonton"), ["view", "phonton-cli", "version"]);
    const version = normalizeShellOutput(result.stdout).split(/\n/)[0]?.trim();
    if (result.code === 0 && /^\d+\.\d+\.\d+/.test(version)) {
      cachedLatestVersion = version;
      return version;
    }
  } catch {
    /* fallback */
  }
  return CLI_VERSION_FALLBACK;
}

export async function verifyPhontonCli(cmd?: string): Promise<boolean> {
  const stored = getPhontonLaunchSpec();
  if (stored && !cmd) return verifyLaunchSpec(stored);
  if (!isTauri()) return false;
  const resolved = cmd ?? getResolvedPhontonCmd();
  if (isWindows()) {
    const spec = await resolveLaunchFromCmd(resolved);
    return spec !== null;
  }
  try {
    const result = await executeScoped("unix-phonton-verify", [
      "-c",
      `'${resolved.replace(/'/g, "'\\''")}' --version`,
    ]);
    return result.code === 0 && /\d/.test(result.stdout);
  } catch {
    return false;
  }
}

export async function resolvePhontonLaunch(
  onProgress?: (message: string) => void,
): Promise<{ spec: PhontonLaunchSpec | null; reason?: string }> {
  if (!isTauri()) return { spec: null, reason: "not in desktop app" };
  try {
    if (isWindows()) {
      for (const layout of await layoutsToTry()) {
        const fromLayout = await resolveLaunchFromLayout(layout, onProgress);
        if (fromLayout) return { spec: fromLayout };
      }

      const result = await executeScoped("where-phonton", ["phonton"]);
      if (result.code === 0) {
        const line = pickWindowsWhereLine(result.stdout.split(/\r?\n/));
        if (line) {
          const spec = await resolveLaunchFromCmd(line);
          if (spec) return { spec };
        }
      }

      const layout = (await layoutsToTry())[0];
      if (layout) {
        const node = await resolveNodeForLayout(layout);
        if (node) {
          const spec: PhontonLaunchSpec = {
            kind: "node",
            node,
            script: layout.script,
            cmd: layout.cmd,
          };
          setPhontonLaunchSpec(spec);
          return { spec };
        }
        return {
          spec: null,
          reason: `node.exe not found for phonton-cli (checked Scoop and npm global bin)`,
        };
      }

      return { spec: null, reason: "could not read npm global paths (prefix/root)" };
    }

    const globalBin = await getNpmGlobalBin();
    if (globalBin) {
      const spec = await resolveLaunchFromCmd(globalBin);
      if (spec) return { spec };
    }

    const result = await executeScoped("unix-phonton-verify", ["-c", "command -v phonton"]);
    if (result.code === 0) {
      const path = normalizeShellOutput(result.stdout);
      if (path) {
        const cmdSpec: PhontonLaunchSpec = { kind: "cmd", cmd: path };
        setPhontonLaunchSpec(cmdSpec);
        return { spec: cmdSpec };
      }
    }
    return { spec: null, reason: "phonton not found on PATH" };
  } catch (err) {
    return {
      spec: null,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/** @deprecated Use resolvePhontonLaunch — returns cmd path for compatibility. */
export async function resolvePhontonOnPath(): Promise<string | null> {
  const { spec } = await resolvePhontonLaunch();
  if (!spec) return null;
  return spec.cmd;
}

/** Detect, upgrade, and install phonton-cli to npm latest. */
export async function ensurePhontonCli(
  onProgress?: (message: string) => void,
): Promise<{ ok: boolean; message: string; installed: boolean }> {
  if (!isTauri()) {
    return { ok: false, message: "Automatic install requires the Phonton Desktop app.", installed: false };
  }

  onProgress?.("Checking for phonton-cli…");
  const latest = await resolveLatestCliVersion();
  let resolved = await resolvePhontonLaunch(onProgress);
  let spec = resolved.spec;

  if (spec) {
    const installed = await readInstalledVersion(spec);
    if (installed && !versionLessThan(installed, latest)) {
      for (const layout of await layoutsToTry()) {
        await bootstrapVendorBinary(layout, onProgress);
      }
      resolved = await resolvePhontonLaunch(onProgress);
      spec = resolved.spec;
      if (spec) {
        return {
          ok: true,
          message: `Found phonton-cli v${installed} — ${spec.kind === "exe" ? spec.exe : spec.kind === "node" ? spec.script : spec.cmd}`,
          installed: false,
        };
      }
    }
    if (installed) {
      onProgress?.(`Upgrading phonton-cli to ${latest}…`);
    }
  }

  if (!spec) {
    onProgress?.("Checking npm…");
    const hasNpm = await checkNpmAvailable();
    if (!hasNpm) {
      return {
        ok: false,
        message: "npm not found. Install Node.js from nodejs.org, then retry or use the install guide.",
        installed: false,
      };
    }
    onProgress?.(`Installing phonton-cli@${latest}…`);
  } else {
    onProgress?.(`Upgrading phonton-cli to ${latest}…`);
  }

  const installedVersion = spec ? await readInstalledVersion(spec) : null;
  const shouldRunNpm = !spec || !installedVersion || versionLessThan(installedVersion, latest);

  if (shouldRunNpm) {
    try {
      const result = await executeScoped(npmScope("install-phonton"), [
        "install",
        "-g",
        `phonton-cli@${latest}`,
      ]);
      if (result.code !== 0) {
        const detail = (result.stderr || result.stdout).trim();
        return { ok: false, message: formatCliInstallError(detail, latest), installed: false };
      }
    } catch (err) {
      return {
        ok: false,
        message: formatCliInstallError(err instanceof Error ? err.message : String(err), latest),
        installed: false,
      };
    }
  }

  for (const layout of await layoutsToTry()) {
    await bootstrapVendorBinary(layout, onProgress);
  }

  onProgress?.("Locating phonton binary…");
  resolved = await resolvePhontonLaunch(onProgress);
  spec = resolved.spec;
  if (!spec) {
    const detail = resolved.reason ? ` (${resolved.reason})` : "";
    return {
      ok: false,
      message: `Install finished but phonton could not be started${detail}. Restart the app or run: npm install -g phonton-cli`,
      installed: true,
    };
  }

  const version = await readInstalledVersion(spec);
  const label = spec.kind === "exe" ? spec.exe : spec.kind === "node" ? spec.script : spec.cmd;
  return {
    ok: true,
    message: version ? `Using phonton-cli v${version} — ${label}` : `Installed — using ${label}`,
    installed: true,
  };
}

export async function installPhontonCli(
  onProgress?: (message: string) => void,
): Promise<{ ok: boolean; message: string }> {
  const result = await ensurePhontonCli(onProgress);
  return { ok: result.ok, message: result.message };
}
