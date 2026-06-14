import { open as openExternal } from "@tauri-apps/plugin-shell";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AUTH_HANDOFF_EVENT, applySessionToken, setPendingAuthState } from "../../lib/auth-handoff";
import {
  accountUrl,
  getStoredSessionToken,
  isAuthenticated,
  parseTokenPayload,
  sessionPlan,
  signInUrl,
  signUpUrl,
} from "../../lib/license";
import { isTauri } from "../../lib/sidecar";

type Props = {
  authState: string;
};

export function SetupStepAuth({ authState }: Props) {
  const [waiting, setWaiting] = useState(false);
  const [pasteToken, setPasteToken] = useState("");
  const [error, setError] = useState("");

  const signedIn = isAuthenticated();

  const refresh = useCallback(() => {
    setWaiting(false);
    setError("");
  }, []);

  useEffect(() => {
    const onHandoff = () => refresh();
    window.addEventListener(AUTH_HANDOFF_EVENT, onHandoff);
    return () => window.removeEventListener(AUTH_HANDOFF_EVENT, onHandoff);
  }, [refresh]);

  const openSignIn = () => {
    setWaiting(true);
    setError("");
    setPendingAuthState(authState);
    const url = signInUrl(authState);
    if (isTauri()) void openExternal(url);
    else window.open(url, "_blank");
  };

  const openSignUp = () => {
    setWaiting(true);
    setError("");
    setPendingAuthState(authState);
    const url = signUpUrl(authState);
    if (isTauri()) void openExternal(url);
    else window.open(url, "_blank");
  };

  const applyPaste = () => {
    const token = pasteToken.trim();
    if (!applySessionToken(token)) {
      setError("Invalid session token. Sign in on phonton.dev and copy from the account page.");
      return;
    }
    setError("");
    setPasteToken("");
    refresh();
  };

  const token = getStoredSessionToken();
  const payload = token ? parseTokenPayload(token) : null;
  const plan = sessionPlan();

  return (
    <div>
      <h2 className="setup-section-title">Sign in to Phonton</h2>
      <p className="setup-section-desc">
        A free account is required to use Phonton Desktop. Sign in or create an account on phonton.dev — we&apos;ll
        return you here automatically.
      </p>

      {signedIn ? (
        <div className="cli-status-card">
          <div className="cli-status-row">
            <CheckCircle2 size={20} color="var(--ph-ok)" />
            <span className="cli-status-label">Signed in</span>
          </div>
          <p className="cli-status-detail">
            Account {payload?.account_id?.slice(0, 8)}… · Plan: <span className="capitalize">{plan}</span>
          </p>
        </div>
      ) : (
        <>
          <div className="toolbar" style={{ marginBottom: 16 }}>
            <button type="button" className="btn" onClick={openSignIn}>
              Sign in with browser
            </button>
            <button type="button" className="btn secondary" onClick={openSignUp}>
              Create account
            </button>
          </div>

          {waiting ? (
            <p className="cli-status-detail" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
              Waiting for browser sign-in… On phonton.dev, click <strong>Open Phonton Desktop</strong> after you
              sign in, or paste your token below.
            </p>
          ) : null}

          <div className="field" style={{ marginTop: 16 }}>
            <label htmlFor="session-paste">Manual token (if deep link fails)</label>
            <textarea
              id="session-paste"
              className="goal-input"
              rows={3}
              placeholder="Paste session token from phonton.dev/account"
              value={pasteToken}
              onChange={(e) => setPasteToken(e.target.value)}
            />
            <div className="toolbar">
              <button type="button" className="btn secondary" onClick={applyPaste}>
                Apply token
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  if (isTauri()) void openExternal(accountUrl(true));
                  else window.open(accountUrl(true), "_blank");
                }}
              >
                Open account page
              </button>
            </div>
          </div>
        </>
      )}

      {error ? (
        <p className="cli-hint" style={{ color: "var(--ph-danger)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
