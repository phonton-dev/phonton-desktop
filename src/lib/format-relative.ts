/** Compact relative time for sidebar rows. */
export function formatRelativeTime(timestampMs: number): string {
  const diff = Date.now() - timestampMs;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(timestampMs).toLocaleDateString();
}

/** Parse task status from history row for display. */
export function historyStatusLabel(status: unknown): string {
  if (!status) return "Unknown";
  if (typeof status === "string") return status;
  if (typeof status === "object" && status !== null) {
    const keys = Object.keys(status as object);
    if (keys.length > 0) return keys[0];
  }
  return "Unknown";
}
