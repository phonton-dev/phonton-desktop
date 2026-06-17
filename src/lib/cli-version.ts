/** Minimum phonton-cli version required for desktop serve RPC (config.get, tasks.list, …). */
export const MIN_SERVE_CLI_VERSION = "0.21.0";

export function parseVersionParts(version: string): number[] {
  return version
    .replace(/^v/i, "")
    .split(".")
    .map((part) => parseInt(part.replace(/[^0-9].*$/, ""), 10) || 0);
}

export function versionLessThan(a: string, b: string): boolean {
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

export function isServeVersionSupported(version: string): boolean {
  return !versionLessThan(version, MIN_SERVE_CLI_VERSION);
}

/** Target npm install version: at least MIN_SERVE_CLI_VERSION and npm latest when newer. */
export function resolveTargetCliVersion(npmLatest: string): string {
  if (versionLessThan(npmLatest, MIN_SERVE_CLI_VERSION)) {
    return MIN_SERVE_CLI_VERSION;
  }
  return npmLatest;
}

export function isConfigGetError(message: string): boolean {
  return message.includes("unknown method") && message.includes("config.get");
}
