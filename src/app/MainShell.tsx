import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { AgentWorkspace } from "@/components/shell/AgentWorkspace";
import { AppHeader } from "@/components/shell/AppHeader";
import { AppSidebar, type SidebarTab } from "@/components/shell/AppSidebar";
import { ContextPanel } from "@/components/shell/ContextPanel";
import { WelcomeShell } from "@/components/shell/WelcomeShell";
import { LocalModelsPage } from "@/pages/LocalModelsPage";
import { useSessions } from "@/hooks/useSessions";
import { ensureSidecarReady, useSidecar } from "@/hooks/useSidecar";
import { fetchConfig, listTasks, trustGrant, workspaceInfo, type PhontonConfig, type TaskSummary } from "@/lib/config";
import {
  clearActiveProject,
  getActiveProject,
  getRecentProjects,
  projectLabel,
  setActiveProject,
} from "@/lib/projects";
import { isTauri, restartSidecar, setSidecarWorkspace, sidecarProcessAlive } from "@/lib/sidecar";
import { modelOperation } from "@/lib/local-models";
import { projectSwitchBlockReason } from "@/lib/project-switch";
import { goalActive } from "@/lib/serve";
import { localRunStatus } from "@/lib/local-run";

const SIDEBAR_TAB_KEY = "phonton.shell.sidebarTab";

function previewProjectPath(): string | null {
  if (!import.meta.env.DEV) return null;
  if (!new URLSearchParams(window.location.search).has("preview")) return null;
  return "preview-workspace";
}

function loadSidebarTab(): SidebarTab {
  const v = localStorage.getItem(SIDEBAR_TAB_KEY);
  return v === "history" ? "history" : "sessions";
}

function LocalModelsRoute({ onBack }: { onBack: () => void }) {
  const { state, refresh } = useSidecar({ requireLocalHarness: true });
  return <LocalModelsPage
    connected={state.status === "ready"}
    connectionIssue={state.status === "offline" || state.status === "upgrade_required" ? state.error : undefined}
    onBack={onBack}
    onReconnect={refresh}
  />;
}

type Props = {
  onOpenSettings: () => void;
};

export function MainShell({ onOpenSettings }: Props) {
  const [showModels, setShowModels] = useState(false);
  const [projectPath, setProjectPath] = useState<string | null>(
    () => getActiveProject() ?? previewProjectPath(),
  );
  const [recentProjects, setRecentProjects] = useState(() => getRecentProjects());
  const [history, setHistory] = useState<TaskSummary[]>([]);
  const [config, setConfig] = useState<PhontonConfig | null>(null);
  const [workspaceTrusted, setWorkspaceTrusted] = useState<boolean | null>(null);
  const [trustError, setTrustError] = useState<string | null>(null);
  const [projectSwitchError, setProjectSwitchError] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>(loadSidebarTab);
  const { state: sidecar, refresh: refreshSidecar } = useSidecar();
  const sessionsApi = useSessions();

  const refreshRecent = useCallback(() => {
    setRecentProjects(getRecentProjects());
  }, []);

  const refreshHistory = useCallback(async () => {
    if (sidecar.status !== "ready") return;
    try {
      const tasks = await listTasks(30);
      setHistory(tasks);
    } catch {
      setHistory([]);
    }
  }, [sidecar.status]);

  const refreshConfig = useCallback(async () => {
    if (sidecar.status !== "ready") return;
    try {
      const result = await fetchConfig();
      setConfig(result.config);
    } catch {
      setConfig(null);
    }
  }, [sidecar.status]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory, sessionsApi.active?.running]);

  useEffect(() => {
    void refreshConfig();
  }, [refreshConfig]);

  useEffect(() => {
    let cancelled = false;
    if (!projectPath || sidecar.status !== "ready") {
      setWorkspaceTrusted(null);
      return;
    }
    void workspaceInfo()
      .then((info) => {
        if (!cancelled) setWorkspaceTrusted(info.trusted);
      })
      .catch(() => {
        if (!cancelled) setWorkspaceTrusted(null);
      });
    return () => { cancelled = true; };
  }, [projectPath, sidecar.status]);

  const handleSidebarTabChange = useCallback((tab: SidebarTab) => {
    setSidebarTab(tab);
    localStorage.setItem(SIDEBAR_TAB_KEY, tab);
  }, []);

  const handleSidecarAction = useCallback(async () => {
    await ensureSidecarReady(true, () => undefined);
    await refreshSidecar();
    await refreshConfig();
    await refreshHistory();
  }, [refreshConfig, refreshHistory, refreshSidecar]);

  const openProjectPath = useCallback(
    async (selected: string) => {
      if (selected === projectPath) { setProjectSwitchError(null); return; }
      if (isTauri()) {
        const reason = await projectSwitchBlockReason(
          { modelPageOpen: showModels, sessions: sessionsApi.sessions }, modelOperation, goalActive, localRunStatus, sidecarProcessAlive,
        );
        if (reason) { setProjectSwitchError(reason); return; }
      }
      setProjectSwitchError(null);
      setActiveProject(selected);
      setProjectPath(selected);
      setWorkspaceTrusted(null);
      setTrustError(null);
      refreshRecent();
      setSidecarWorkspace(selected);
      await restartSidecar(selected);
      await refreshSidecar();
      await refreshHistory();
      await refreshConfig();
    },
    [projectPath, refreshConfig, refreshHistory, refreshRecent, refreshSidecar, sessionsApi.sessions, showModels],
  );

  const openProject = useCallback(async () => {
    if (!isTauri()) {
      const typed = window.prompt("Project folder path");
      if (typed?.trim()) await openProjectPath(typed.trim());
      return;
    }
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Open project folder",
    });
    if (!selected || Array.isArray(selected)) return;
    await openProjectPath(selected);
  }, [openProjectPath]);

  const clearProject = useCallback(() => {
    clearActiveProject();
    setProjectPath(null);
    setWorkspaceTrusted(null);
    setTrustError(null);
    refreshRecent();
  }, [refreshRecent]);

  const trustProject = useCallback(async () => {
    if (!projectPath || sidecar.status !== "ready") return;
    try {
      const result = await trustGrant(projectPath);
      setWorkspaceTrusted(result.trusted);
      setTrustError(null);
    } catch (error) {
      setTrustError(String(error));
    }
  }, [projectPath, sidecar.status]);

  useEffect(() => {
    if (projectPath && isTauri()) setSidecarWorkspace(projectPath);
    // The initial sidecar hook starts in the stored project directory. A
    // WebView reload must not stop a still-running model operation.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialize once from the stored project
  }, []);

  const hasProject = Boolean(projectPath);

  return (
    <SidebarProvider defaultOpen>
      <div className="flex h-screen w-full flex-col overflow-hidden">
        <AppHeader
          sidecar={sidecar}
          projectPath={projectPath}
          onOpenSettings={onOpenSettings}
          onOpenModels={() => setShowModels(true)}
          onOpenProject={() => void openProject()}
          onOpenRecent={(path) => void openProjectPath(path)}
          onClearProject={clearProject}
          onSidecarAction={() => void handleSidecarAction()}
        />
        {projectSwitchError && <div role="alert" className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-950/30 px-4 py-2 text-sm text-amber-100"><span>{projectSwitchError}</span><button className="underline" onClick={() => setProjectSwitchError(null)}>Dismiss</button></div>}
        <div className="flex min-h-0 flex-1">
          <AppSidebar
            hasProject={hasProject}
            sidebarTab={sidebarTab}
            onSidebarTabChange={handleSidebarTabChange}
            sessions={sessionsApi.sessions}
            activeSessionId={sessionsApi.activeId}
            history={history}
            onOpenProject={() => void openProject()}
            onOpenRecent={(path) => void openProjectPath(path)}
            onNewSession={sessionsApi.createSession}
            onSelectSession={sessionsApi.selectSession}
            onTogglePin={sessionsApi.togglePin}
            onRunDoctor={() => void sessionsApi.runDoctor()}
            onSelectHistory={(task) => void sessionsApi.resumeFromTask(task.task_id, task.goal_text)}
          />
          <SidebarInset className="min-h-0 flex-1 p-0">
            {showModels ? <LocalModelsRoute onBack={() => setShowModels(false)} /> : !hasProject ? (
              <WelcomeShell
                recentProjects={recentProjects}
                sidecar={sidecar}
                onOpenProject={() => void openProject()}
                onOpenRecent={(path) => void openProjectPath(path)}
                onSidecarAction={() => void handleSidecarAction()}
              />
            ) : (
              <ResizablePanelGroup orientation="horizontal" className="h-full min-h-0">
                <ResizablePanel defaultSize={62} minSize={40}>
                  <AgentWorkspace
                    session={sessionsApi.active}
                    sidecar={sidecar}
                    projectLabel={projectPath ? projectLabel(projectPath) : null}
                    providerModel={config?.provider.model ?? config?.provider.name ?? null}
                    workspaceTrusted={workspaceTrusted}
                    trustError={trustError}
                    onTrustProject={() => void trustProject()}
                    onGoalChange={sessionsApi.setGoal}
                    onPreviewPlan={() => void sessionsApi.previewPlan()}
                    onRunGoal={() => void sessionsApi.runGoal()}
                    onRetrySidecar={() => void refreshSidecar()}
                    onUpgradeSidecar={() => void handleSidecarAction()}
                  />
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={38} minSize={24}>
                  <ContextPanel
                    session={sessionsApi.active}
                    onLoadReview={() => void sessionsApi.loadReview()}
                  />
                </ResizablePanel>
              </ResizablePanelGroup>
            )}
          </SidebarInset>
        </div>
      </div>
    </SidebarProvider>
  );
}
