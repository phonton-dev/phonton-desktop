import { useEffect, useState } from "react";
import { SetupPage, type SetupStep } from "../components/setup/SetupPage";
import { useAppUpdater } from "../hooks/useAppUpdater";
import { initAuthHandoff } from "../lib/auth-handoff";
import { isAuthenticated, clearSessionToken } from "../lib/license";
import { isSetupComplete, resetSetup } from "../lib/setup";
import { loadStoredTheme, type ThemeId } from "../themes/presets";
import { MainShell } from "./MainShell";
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

export default function App() {
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
