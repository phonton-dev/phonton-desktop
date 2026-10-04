/** Compare displayed workspace paths conservatively; unknown identity blocks writes. */
export function workspacePathMatches(selected: string | null, engine: string | null): boolean {
  if (!selected || !engine) return false;
  const normalize = (path: string) => {
    const windows = /^[a-z]:[\\/]/i.test(path) || path.startsWith("\\\\");
    if (!windows) return path.replace(/\/+$/, "");
    const value = path.replace(/^\\\\\?\\/, "").replaceAll("\\", "/").replace(/\/+$/, "");
    return value.toLowerCase();
  };
  return normalize(selected) === normalize(engine);
}
