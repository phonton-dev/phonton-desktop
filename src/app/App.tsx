import { useEffect, useState } from "react";
import { SetupPage, type SetupStep } from "../components/setup/SetupPage";
import { initAuthHandoff } from "../lib/auth-handoff";
import { isAuthenticated, clearSessionToken } from "../lib/license";
import { isSetupComplete, resetSetup } from "../lib/setup";
import { loadStoredTheme, type ThemeId } from "../themes/presets";
import { MainShell } from "./MainShell";

function initialStep(): SetupStep {
  if (!isAuthenticated()) return "auth";
  if (!isSetupComplete()) return "welcome";
  return "welcome";
}

export default function App() {
  const [setupDone, setSetupDone] = useState(() => isSetupComplete() && isAuthenticated());
  const [themeId, setThemeId] = useState<ThemeId>(() => loadStoredTheme());
  const [setupStep, setSetupStep] = useState<SetupStep>(initialStep);

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

  if (!setupDone || !isAuthenticated()) {
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

  return (
    <MainShell
      themeId={themeId}
      onThemeChange={setThemeId}
      onShowSetup={() => {
        resetSetup();
        clearSessionToken();
        setSetupStep("welcome");
        setSetupDone(false);
      }}
    />
  );
}
