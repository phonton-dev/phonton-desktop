import { useState } from "react";
import { SetupPage, type SetupStep } from "../components/setup/SetupPage";
import { useAppUpdater } from "../hooks/useAppUpdater";
import { isSetupComplete, resetSetup } from "../lib/setup";
import { loadStoredTheme, type ThemeId } from "../themes/presets";
import { MainShell } from "./MainShell";
import { LocalWorkbench } from "./LocalWorkbench";
import { SettingsPage } from "../pages/SettingsPage";

type AppView = "main" | "settings";

function wantsHarnessPreview() {
  if (!import.meta.env.DEV) return false;
  return new URLSearchParams(window.location.search).has("preview");
}

function OnlineApp() {
  const [setupDone, setSetupDone] = useState(
    () => wantsHarnessPreview() || isSetupComplete(),
  );
  const [themeId, setThemeId] = useState<ThemeId>(() => loadStoredTheme());
  const [setupStep, setSetupStep] = useState<SetupStep>("welcome");
  const [view, setView] = useState<AppView>("main");

  useAppUpdater();

  if (!setupDone && !wantsHarnessPreview()) {
    return (
      <SetupPage
        themeId={themeId}
        onThemeChange={setThemeId}
        initialStep={setupStep}
        onComplete={() => setSetupDone(true)}
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
  // Opens the workbench; its setup wizard runs only if it never finished.
  if (settings) return <SettingsPage themeId={themeId} onThemeChange={setThemeId}
    onBack={() => setSettings(false)} onShowSetup={() => setOnlineSetup(true)}
    setupLabel="Open provider-key workbench" />;
  return <LocalWorkbench onSettings={() => setSettings(true)} />;
}
