import { isAuthenticated, storeSessionToken } from "./license";

export const AUTH_HANDOFF_EVENT = "phonton-auth-handoff";

export function parseAuthCallbackUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "phonton:") return null;
    const path = `${url.hostname}${url.pathname}`;
    if (path !== "auth/callback" && path !== "auth/callback/") return null;
    const token = url.searchParams.get("token");
    if (!token || !isAuthenticated(token)) return null;
    return token;
  } catch {
    return null;
  }
}

export function applySessionToken(token: string): boolean {
  if (!isAuthenticated(token)) return false;
  storeSessionToken(token);
  window.dispatchEvent(new CustomEvent(AUTH_HANDOFF_EVENT, { detail: { token } }));
  return true;
}

export async function initAuthHandoff(): Promise<() => void> {
  if (!("__TAURI_INTERNALS__" in window)) {
    return () => {};
  }

  try {
    const { onOpenUrl, getCurrent } = await import("@tauri-apps/plugin-deep-link");
    const unlisten = await onOpenUrl((urls) => {
      for (const url of urls) {
        const token = parseAuthCallbackUrl(url);
        if (token) applySessionToken(token);
      }
    });

    const current = await getCurrent();
    for (const url of current ?? []) {
      const token = parseAuthCallbackUrl(url);
      if (token) applySessionToken(token);
    }

    return unlisten;
  } catch (err) {
    console.warn("Deep link auth unavailable", err);
    return () => {};
  }
}
