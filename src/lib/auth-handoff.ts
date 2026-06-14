import { getCurrentWindow } from "@tauri-apps/api/window";
import { isAuthenticated, storeSessionToken } from "./license";

export const AUTH_HANDOFF_EVENT = "phonton-auth-handoff";
const PENDING_AUTH_STATE_KEY = "phonton.auth.pendingState";

export function setPendingAuthState(state: string) {
  localStorage.setItem(PENDING_AUTH_STATE_KEY, state);
}

function consumePendingAuthState(): string | null {
  const value = localStorage.getItem(PENDING_AUTH_STATE_KEY);
  localStorage.removeItem(PENDING_AUTH_STATE_KEY);
  return value;
}

export function parseAuthCallbackUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "phonton:") return null;
    const path = `${url.hostname}${url.pathname}`;
    if (path !== "auth/callback" && path !== "auth/callback/") return null;

    const pending = consumePendingAuthState();
    const callbackState = url.searchParams.get("state");
    if (pending && callbackState && pending !== callbackState) {
      console.warn("Auth callback state mismatch — ignoring token");
      return null;
    }

    const token = url.searchParams.get("token");
    if (!token || !isAuthenticated(token)) return null;
    return token;
  } catch {
    return null;
  }
}

function focusMainWindow(): void {
  if (!("__TAURI_INTERNALS__" in window)) return;
  try {
    const win = getCurrentWindow();
    void win.unminimize();
    void win.show();
    void win.setFocus();
  } catch {
    /* ignore */
  }
}

export function applySessionToken(token: string): boolean {
  if (!isAuthenticated(token)) return false;
  storeSessionToken(token);
  window.dispatchEvent(new CustomEvent(AUTH_HANDOFF_EVENT, { detail: { token } }));
  focusMainWindow();
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
