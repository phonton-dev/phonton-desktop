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

function OnlineApp({ themeId, onThemeChange, active }: { themeId: ThemeId; onThemeChange: (id: ThemeId) => void; active: boolean }) {
  const [setupDone, setSetupDone] = useState(
    () => wantsHarnessPreview() || (isSetupComplete() && isAuthenticated()),
  );
  const [setupStep, setSetupStep] = useState<SetupStep>(initialSetupStep);
  const [view, setView] = useState<AppView>("main");

  useAppUpdater(active && setupDone);

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
        onThemeChange={onThemeChange}
        initialStep={setupStep}
        onComplete={() => {
          if (isAuthenticated()) setSetupDone(true);
        }}
      />
    );
  }

  return <>
    <div className="workspace-view" hidden={view === "settings"}><MainShell onOpenSettings={() => setView("settings")} /></div>
    {view === "settings" && (
      <SettingsPage
        themeId={themeId}
        onThemeChange={onThemeChange}
        onBack={() => setView("main")}
        onShowSetup={() => {
          resetSetup();
          clearSessionToken();
          setSetupStep("welcome");
          setSetupDone(false);
          setView("main");
        }}
      />
    )}
  </>;
}

/** Local work is available without an account or an online bootstrap request. */
export default function App() {
  const [onlineSetup, setOnlineSetup] = useState(false);
  const [onlineVisited, setOnlineVisited] = useState(false);
  const [settings, setSettings] = useState(false);
  const [themeId, setThemeId] = useState<ThemeId>(() => loadStoredTheme());
  const returnToWorkspace = () => { setOnlineSetup(false); setSettings(false); setThemeId(loadStoredTheme()); };
  const openOnlineWorkspace = () => { setOnlineVisited(true); setOnlineSetup(true); };
  return <>
    <div className="workspace-view" hidden={settings || onlineSetup}>
      <LocalWorkbench onSettings={() => setSettings(true)} />
    </div>
    {settings && !onlineSetup && <SettingsPage themeId={themeId} onThemeChange={setThemeId}
      onBack={returnToWorkspace} onShowSetup={openOnlineWorkspace} onOpenOnline={openOnlineWorkspace} />}
    {onlineVisited && <div className="online-view workspace-view" hidden={!onlineSetup}><div className="online-return"><button onClick={returnToWorkspace}>← Return to local workspace</button><span>Optional account setup</span></div><OnlineApp active={onlineSetup} themeId={themeId} onThemeChange={setThemeId} /></div>}
  </>;
}
