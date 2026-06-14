import { getVersion } from "@tauri-apps/api/app";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { isTauri } from "../lib/sidecar";
import { useEffect, useState } from "react";
import { checkForAppUpdate } from "../lib/app-updater";
import {
  accountUrl,
  clearCloudToken,
  clearSessionToken,
  getStoredCloudToken,
  hasCloudSyncEntitlement,
  isAuthenticated,
  sessionPlan,
  signInUrl,
  storeCloudToken,
} from "../lib/license";
import { themePresets, type ThemeId, applyTheme } from "../themes/presets";

type Props = {
  open: boolean;
  onClose: () => void;
  themeId: ThemeId;
  onThemeChange: (id: ThemeId) => void;
  onShowSetup?: () => void;
};

export function SettingsModal({ open: isOpen, onClose, themeId, onThemeChange, onShowSetup }: Props) {
  const [tokenInput, setTokenInput] = useState(getStoredCloudToken() ?? "");
  const [appVersion, setAppVersion] = useState("");
  const [updateStatus, setUpdateStatus] = useState("");
  const [updateBusy, setUpdateBusy] = useState(false);
  const cloudConnected = hasCloudSyncEntitlement(getStoredCloudToken());

  useEffect(() => {
    if (!isOpen || !isTauri()) return;
    void getVersion().then(setAppVersion).catch(() => setAppVersion(""));
  }, [isOpen]);

  const handleCheckUpdates = async () => {
    if (!isTauri()) return;
    setUpdateBusy(true);
    setUpdateStatus("Checking…");
    const result = await checkForAppUpdate();
    if (result.status === "current") {
      setUpdateStatus("You're on the latest version.");
      setUpdateBusy(false);
      return;
    }
    if (result.status === "available") {
      const install = window.confirm(
        `Phonton ${result.version} is available. Download and install now? The app will restart.`,
      );
      if (!install) {
        setUpdateStatus(`Update ${result.version} available.`);
        setUpdateBusy(false);
        return;
      }
      setUpdateStatus("Downloading…");
      const installed = await checkForAppUpdate({
        install: true,
        onProgress: (pct) => setUpdateStatus(`Downloading… ${pct}%`),
      });
      if (installed.status === "error") {
        setUpdateStatus(installed.message);
      }
      setUpdateBusy(false);
      return;
    }
    if (result.status === "error") {
      setUpdateStatus(result.message);
    } else {
      setUpdateStatus("");
    }
    setUpdateBusy(false);
  };

  if (!isOpen) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-card" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>

        <div className="field">
          <label>Account</label>
          <p style={{ margin: 0, fontSize: 13, color: "var(--ph-muted)" }}>
            {isAuthenticated() ? (
              <>
                Signed in · <span className="capitalize">{sessionPlan()}</span> plan
              </>
            ) : (
              "Not signed in"
            )}
          </p>
          <div className="toolbar">
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                if (isTauri()) void openExternal(signInUrl());
                else window.open(signInUrl(), "_blank");
              }}
            >
              Manage account
            </button>
            {isAuthenticated() ? (
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  clearSessionToken();
                  onClose();
                  onShowSetup?.();
                }}
              >
                Sign out
              </button>
            ) : null}
          </div>
        </div>

        <div className="field">
          <label htmlFor="theme">Appearance</label>
          <select
            id="theme"
            value={themeId}
            onChange={(e) => {
              const id = e.target.value as ThemeId;
              onThemeChange(id);
              applyTheme(id);
            }}
          >
            {themePresets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="cloud-token">
            Cloud sync token {cloudConnected ? <span className="cloud-badge">connected</span> : null}
          </label>
          <textarea
            id="cloud-token"
            className="goal-input"
            rows={4}
            placeholder="Paste cloud sync token from phonton.dev/account (Pro or Ultra)"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
          />
          <div className="toolbar">
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                const t = tokenInput.trim();
                if (!hasCloudSyncEntitlement(t)) return;
                storeCloudToken(t);
              }}
            >
              Save token
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                clearCloudToken();
                setTokenInput("");
              }}
            >
              Clear
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                if (isTauri()) void openExternal(accountUrl());
                else window.open(accountUrl(), "_blank");
              }}
            >
              Open account
            </button>
          </div>
          <p style={{ fontSize: 12, color: "var(--ph-muted)", margin: 0 }}>
            Desktop is free. Cloud sync requires a Pro or Ultra subscription.
          </p>
        </div>

        {isTauri() ? (
          <div className="field">
            <label>App updates</label>
            <p style={{ margin: 0, fontSize: 13, color: "var(--ph-muted)" }}>
              {appVersion ? `Phonton Desktop v${appVersion}` : "Phonton Desktop"}
              {updateStatus ? ` · ${updateStatus}` : null}
            </p>
            <div className="toolbar">
              <button
                type="button"
                className="btn secondary"
                disabled={updateBusy}
                onClick={() => void handleCheckUpdates()}
              >
                {updateBusy ? "Checking…" : "Check for updates"}
              </button>
            </div>
          </div>
        ) : null}

        <div className="toolbar" style={{ justifyContent: "space-between" }}>
          {onShowSetup ? (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                onClose();
                onShowSetup();
              }}
            >
              Show setup again
            </button>
          ) : (
            <span />
          )}
          <button type="button" className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
