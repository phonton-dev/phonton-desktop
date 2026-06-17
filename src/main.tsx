import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { TooltipProvider } from "@/components/ui/tooltip";
import App from "./app/App";
import { applyTheme, loadStoredTheme } from "./themes/presets";
import { isTauri } from "./lib/sidecar";
import "./styles/globals.css";

applyTheme(loadStoredTheme());

function Root() {
  useEffect(() => {
    if (!isTauri()) return;
    void (async () => {
      try {
        const win = getCurrentWindow();
        await win.setIcon("/phonton-logo.png");
      } catch (err) {
        console.warn("Failed to set window icon", err);
      }
    })();
  }, []);

  return (
    <TooltipProvider>
      <div className="ambient-bg" aria-hidden />
      <div className="app-root">
        <App />
      </div>
    </TooltipProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
