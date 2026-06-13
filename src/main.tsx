import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import { applyTheme, loadStoredTheme } from "./themes/presets";
import "./styles/globals.css";

applyTheme(loadStoredTheme());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <>
      <div className="ambient-bg" aria-hidden />
      <div className="app-root">
        <App />
      </div>
    </>
  </StrictMode>,
);
