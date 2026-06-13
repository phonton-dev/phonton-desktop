import {
  Activity,
  FileText,
  History,
  Settings,
  Stethoscope,
  Target,
} from "lucide-react";
import { useCallback, useState } from "react";
import { SettingsModal } from "../components/SettingsModal";
import { useGoalRun } from "../hooks/useGoalRun";
import { useSidecar } from "../hooks/useSidecar";
import { pricingUrl, sessionPlan } from "../lib/license";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { isTauri } from "../lib/sidecar";
import type { ThemeId } from "../themes/presets";

type RailView = "goals" | "history" | "doctor";
type WorkspaceTab = "run" | "plan" | "output";

type Props = {
  themeId: ThemeId;
  onThemeChange: (id: ThemeId) => void;
  onShowSetup: () => void;
};

export function MainShell({ themeId, onThemeChange, onShowSetup }: Props) {
  const [rail, setRail] = useState<RailView>("goals");
  const [tab, setTab] = useState<WorkspaceTab>("run");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [eventLog, setEventLog] = useState<string[]>([]);

  const appendLog = useCallback((line: string) => {
    setEventLog((prev) => [...prev.slice(-400), line]);
  }, []);

  const { state: sidecar, refresh: refreshSidecar } = useSidecar();
  const goals = useGoalRun(appendLog);

  const sidecarLabel =
    sidecar.status === "ready"
      ? `Sidecar v${sidecar.version}`
      : sidecar.status === "offline"
        ? "Sidecar offline"
        : "Connecting…";

  return (
    <div className="app-shell">
      <header className="top-bar">
        <span className="brand">
          <img src="/phonton-logo.png" alt="" className="brand-logo" aria-hidden />
          Phonton
        </span>
        <span
          className={`status-dot ${sidecar.status === "ready" ? "ok" : sidecar.status === "offline" ? "warn" : ""}`}
          title={sidecarLabel}
        />
        <span style={{ fontSize: 12, color: "var(--ph-muted)" }}>{sidecarLabel}</span>
        <span className="cloud-badge" style={{ textTransform: "capitalize" }}>
          {sessionPlan()}
        </span>
        <span className="spacer" />
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            const url = pricingUrl();
            if (isTauri()) void openExternal(url);
            else window.open(url, "_blank");
          }}
        >
          Cloud plans
        </button>
        <button type="button" className="btn ghost" onClick={() => setSettingsOpen(true)}>
          <Settings size={16} />
        </button>
      </header>

      <div className="main-grid">
        <nav className="activity-rail" aria-label="Activity">
          <button
            type="button"
            className={`rail-btn ${rail === "goals" ? "active" : ""}`}
            onClick={() => setRail("goals")}
          >
            <Target size={18} />
            Goals
          </button>
          <button
            type="button"
            className={`rail-btn ${rail === "history" ? "active" : ""}`}
            onClick={() => setRail("history")}
          >
            <History size={18} />
            History
          </button>
          <button
            type="button"
            className={`rail-btn ${rail === "doctor" ? "active" : ""}`}
            onClick={() => {
              setRail("doctor");
              goals.runDoctor();
            }}
          >
            <Stethoscope size={18} />
            Doctor
          </button>
        </nav>

        <aside className="sidebar">
          <div className="panel-header">Goal</div>
          <div className="panel-body">
            {rail === "history" ? (
              <div className="placeholder-card">
                <Activity size={28} style={{ marginBottom: 8, opacity: 0.5 }} />
                <p>Run history — coming soon</p>
              </div>
            ) : (
              <>
                <textarea
                  className="goal-input"
                  placeholder="Fix the config panic in src/config.js"
                  value={goals.goal}
                  onChange={(e) => goals.setGoal(e.target.value)}
                />
                <div className="toolbar">
                  <button type="button" className="btn secondary" onClick={goals.previewPlan}>
                    Preview plan
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={goals.runGoal}
                    disabled={goals.running || sidecar.status !== "ready"}
                  >
                    {goals.running ? "Running…" : "Run goal"}
                  </button>
                </div>
                {sidecar.status === "offline" ? (
                  <p style={{ fontSize: 12, color: "var(--ph-warn)", marginTop: 12 }}>
                    {sidecar.error}{" "}
                    <button type="button" className="btn ghost" onClick={refreshSidecar}>
                      Retry
                    </button>
                  </p>
                ) : null}
              </>
            )}
          </div>
        </aside>

        <section className="workspace">
          <div className="tab-row">
            {(["run", "plan", "output"] as const).map((id) => (
              <button
                key={id}
                type="button"
                className={`tab ${tab === id ? "active" : ""}`}
                onClick={() => setTab(id)}
              >
                {id === "run" ? "Run" : id === "plan" ? "Plan" : "Output"}
              </button>
            ))}
          </div>
          <div className="workspace-body">
            {tab === "run" ? (
              <pre className="json-block log-view" style={{ minHeight: 200 }}>
                {eventLog.length ? eventLog.join("\n") : "Live events appear here when you run a goal."}
              </pre>
            ) : null}
            {tab === "plan" ? <pre className="json-block mono">{goals.planJson}</pre> : null}
            {tab === "output" ? (
              <p className="mono" style={{ color: "var(--ph-muted)" }}>
                {goals.statusLine}
              </p>
            ) : null}
          </div>
        </section>

        <aside className="right-panel">
          <div className="panel-header">
            <FileText size={14} style={{ display: "inline", marginRight: 6 }} />
            Receipt
          </div>
          <div className="panel-body">
            <button type="button" className="btn secondary" onClick={goals.loadReview}>
              Load review
            </button>
            <pre className="json-block mono" style={{ marginTop: 12 }}>
              {goals.receiptJson}
            </pre>
          </div>
        </aside>
      </div>

      <footer className="bottom-panel">
        <div className="panel-header">Event stream</div>
        <div className="log-view mono">
          {eventLog.length ? eventLog.slice(-12).join("\n") : "Waiting for activity…"}
        </div>
      </footer>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        themeId={themeId}
        onThemeChange={onThemeChange}
        onShowSetup={onShowSetup}
      />
    </div>
  );
}
