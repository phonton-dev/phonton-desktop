export const SETUP_STORAGE_KEY = "phonton.setup.complete";

export function isSetupComplete(): boolean {
  return localStorage.getItem(SETUP_STORAGE_KEY) === "true";
}

export function completeSetup(): void {
  localStorage.setItem(SETUP_STORAGE_KEY, "true");
}

export function resetSetup(): void {
  localStorage.removeItem(SETUP_STORAGE_KEY);
}
