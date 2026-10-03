import { useEffect, useState } from "react";
import { SetupPage, type SetupStep } from "../components/setup/SetupPage";
import { useAppUpdater } from "../hooks/useAppUpdater";
import { initAuthHandoff } from "../lib/auth-handoff";
import { isAuthenticated, clearSessionToken } from "../lib/license";
import { isSetupComplete, resetSetup } from "../lib/setup";
import { loadStoredTheme, type ThemeId } from "../themes/presets";
import { MainShell } from "./MainShell";
import { LocalWorkbench } from "./LocalWorkbench";
import { SettingsPage } from "../pages/SettingsPage";

type AppView = "main" | "settings";

function initialSetupStep(): SetupStep {
  if (!isAuthenticated() && isSetupComplete()) return "auth";
  if (!isSetupComplete() && isAuthenticated()) return "theme";
  return "welcome";
}

function wantsHarnessPreview() {
  if (!import.meta.env.DEV) return false;
  return new URLSearchParams(window.location.search).has("preview");
}

function OnlineApp() {
  const [setupDone, setSetupDone] = useState(
    () => wantsHarnessPreview() || (isSetupComplete() && isAuthenticated()),
  );
  const [themeId, setThemeId] = useState<ThemeId>(() => loadStoredTheme());
  const [setupStep, setSetupStep] = useState<SetupStep>(initialSetupStep);
  const [view, setView] = useState<AppView>("main");

  useAppUpdater();

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    void initAuthHandoff().then((unlisten) => {
      cleanup = unlisten;
    });
    return () => cleanup?.();
  }, []);

  useEffect(() => {
    const onAuth = () => {
      if (isAuthenticated() && isSetupComplete()) {
        setSetupDone(true);
      }
    };
    window.addEventListener("phonton-auth-handoff", onAuth);
    return () => window.removeEventListener("phonton-auth-handoff", onAuth);
  }, []);

  if ((!setupDone || !isAuthenticated()) && !wantsHarnessPreview()) {
    return (
      <SetupPage
        themeId={themeId}
        onThemeChange={setThemeId}
        initialStep={setupStep}
        onComplete={() => {
          if (isAuthenticated()) setSetupDone(true);
        }}
      />
    );
  }

  if (view === "settings") {
    return (
      <SettingsPage
        themeId={themeId}
        onThemeChange={setThemeId}
        onBack={() => setView("main")}
        onShowSetup={() => {
          resetSetup();
          clearSessionToken();
          setSetupStep("welcome");
          setSetupDone(false);
          setView("main");
        }}
      />
    );
  }

  return (
    <MainShell onOpenSettings={() => setView("settings")} />
  );
}

/** Local work is available without an account or an online bootstrap request. */
export default function App() {
  const [onlineSetup, setOnlineSetup] = useState(false);
  const [settings, setSettings] = useState(false);
  const [themeId, setThemeId] = useState<ThemeId>(() => loadStoredTheme());
  if (onlineSetup) return <OnlineApp />;
  if (settings) return <SettingsPage themeId={themeId} onThemeChange={setThemeId}
    onBack={() => setSettings(false)} onShowSetup={() => setOnlineSetup(true)} />;
  return <LocalWorkbench onSettings={() => setSettings(true)} />;
}
