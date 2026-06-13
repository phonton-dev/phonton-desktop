const APP_URL = import.meta.env.VITE_PHONTON_APP_URL ?? "https://www.phonton.dev";
const SESSION_STORAGE_KEY = "phonton.session.token";
const CLOUD_STORAGE_KEY = "phonton.cloud.token";

export function getStoredSessionToken(): string | null {
  return localStorage.getItem(SESSION_STORAGE_KEY);
}

export function storeSessionToken(token: string) {
  localStorage.setItem(SESSION_STORAGE_KEY, token);
}

export function clearSessionToken() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

export function getStoredCloudToken(): string | null {
  return localStorage.getItem(CLOUD_STORAGE_KEY);
}

export function storeCloudToken(token: string) {
  localStorage.setItem(CLOUD_STORAGE_KEY, token);
}

export function clearCloudToken() {
  localStorage.removeItem(CLOUD_STORAGE_KEY);
}

export function parseTokenPayload(token: string) {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as {
      plan?: string;
      entitlements?: string[];
      account_id?: string;
      exp?: number;
    };
  } catch {
    return null;
  }
}

export function isTokenValid(token: string | null): boolean {
  if (!token) return false;
  const payload = parseTokenPayload(token);
  if (!payload?.exp) return false;
  return payload.exp * 1000 > Date.now();
}

/** Signed-in desktop session (free or paid). */
export function isAuthenticated(token: string | null = getStoredSessionToken()): boolean {
  if (!isTokenValid(token)) return false;
  const payload = parseTokenPayload(token!);
  return Boolean(payload?.account_id);
}

export function sessionPlan(token: string | null = getStoredSessionToken()): string {
  const payload = parseTokenPayload(token ?? "");
  return payload?.plan ?? "free";
}

/** Paid cloud sync entitlements (settings, vault, memory, team). */
export function hasCloudSyncEntitlement(token: string | null): boolean {
  const cloud = token ?? getStoredCloudToken();
  if (!cloud || !isTokenValid(cloud)) return false;
  const payload = parseTokenPayload(cloud);
  if (!payload) return false;
  const ents = payload.entitlements ?? [];
  return (
    payload.plan === "pro" ||
    payload.plan === "ultra" ||
    ents.some((e) =>
      ["settings_sync", "receipt_vault", "personal_memory_sync", "org_memory"].includes(e),
    )
  );
}

export function signInUrl(state?: string) {
  const redirect = encodeURIComponent("/account/?desktop=1");
  const base = `${APP_URL.replace(/\/$/, "")}/sign-in/?redirect_url=${redirect}`;
  if (state) return `${base}&state=${encodeURIComponent(state)}`;
  return base;
}

export function signUpUrl(state?: string) {
  const redirect = encodeURIComponent("/account/?desktop=1");
  const base = `${APP_URL.replace(/\/$/, "")}/sign-up/?redirect_url=${redirect}`;
  if (state) return `${base}&state=${encodeURIComponent(state)}`;
  return base;
}

export function accountUrl(desktop = false) {
  const base = `${APP_URL.replace(/\/$/, "")}/account/`;
  return desktop ? `${base}?desktop=1` : base;
}

export function pricingUrl() {
  return `${APP_URL.replace(/\/$/, "")}/pricing/`;
}

export function installDocsUrl() {
  return `${APP_URL.replace(/\/$/, "")}/docs/install/`;
}
