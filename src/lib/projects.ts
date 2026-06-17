const RECENT_KEY = "phonton.projects.recent";
const ACTIVE_KEY = "phonton.projects.active";
const MAX_RECENT = 12;

export function getActiveProject(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveProject(path: string): void {
  localStorage.setItem(ACTIVE_KEY, path);
  addRecentProject(path);
}

export function clearActiveProject(): void {
  localStorage.removeItem(ACTIVE_KEY);
}

export function getRecentProjects(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addRecentProject(path: string): void {
  const next = [path, ...getRecentProjects().filter((p) => p !== path)].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export function projectLabel(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}
