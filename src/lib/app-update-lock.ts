let installing = false;
let pendingWork = 0;
let uncertainWork = false;

/** Exclude Desktop-originated mutations while admitting or installing an update. */
export function beginAppUpdate(): () => void {
  if (installing) throw new Error("An app update is already in progress.");
  if (pendingWork) throw new Error("Phonton is finishing a change. Wait for it to finish before updating.");
  if (uncertainWork) throw new Error("A previous change could not be confirmed. Reopen Phonton and review its saved state before updating.");
  installing = true;
  let released = false;
  return () => { if (!released) { released = true; installing = false; } };
}

/** Keep pending RPC mutations and engine lifecycle changes visible to updates. */
export function beginDesktopWork(): () => void {
  if (installing) throw new Error("Phonton is updating. Wait for the update to finish before starting work.");
  pendingWork++;
  let released = false;
  return () => { if (!released) { released = true; pendingWork--; } };
}

/** A lost mutation reply cannot certify that a source-changing request stopped. */
export function markDesktopWorkUncertain(): void { uncertainWork = true; }

export async function withDesktopWork<T>(work: () => Promise<T>): Promise<T> {
  const finish = beginDesktopWork();
  try { return await work(); } finally { finish(); }
}

const readOnly = new Set([
  "ping", "config.get", "workspace.info", "tasks.list", "tasks.get", "record.read", "trust.list",
  "extensions.list", "extensions.read", "extensions.validate", "review.get",
  "goal.active", "goal.status", "models.status", "models.operation", "models.catalog.snapshot",
  "local.run.status", "local.run.list", "local.run.read", "local.run.has_evidence",
  "local.run.apply_status", "local.run.repository_match",
]);

/** New RPC methods default to work until their read-only behavior is reviewed. */
export function isReadOnlyEngineMethod(method: string): boolean { return readOnly.has(method); }
