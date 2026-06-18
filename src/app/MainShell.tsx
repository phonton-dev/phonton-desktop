import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { AgentWorkspace } from "@/components/shell/AgentWorkspace";
import { AppHeader } from "@/components/shell/AppHeader";
import { AppSidebar, type SidebarTab } from "@/components/shell/AppSidebar";
import { ContextPanel } from "@/components/shell/ContextPanel";
import { WelcomeShell } from "@/components/shell/WelcomeShell";
import type { FocusView } from "@/components/focus/FocusShell";
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
import { isTauri, restartSidecar, setSidecarWorkspace } from "@/lib/sidecar";

const SIDEBAR_TAB_KEY = "phonton.shell.sidebarTab";

function loadSidebarTab(): SidebarTab {
  const v = localStorage.getItem(SIDEBAR_TAB_KEY);
  return v === "history" ? "history" : "sessions";
}

type Props = {
  onOpenSettings: () => void;
};

export function MainShell({ onOpenSettings }: Props) {
  const [projectPath, setProjectPath] = useState<string | null>(() => getActiveProject());
  const [recentProjects, setRecentProjects] = useState(() => getRecentProjects());
  const [history, setHistory] = useState<TaskSummary[]>([]);
  const [config, setConfig] = useState<PhontonConfig | null>(null);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>(loadSidebarTab);
  const [activeFocus, setActiveFocus] = useState<FocusView>("run");
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
      setActiveProject(selected);
      setProjectPath(selected);
      refreshRecent();
      setSidecarWorkspace(selected);
      try {
        const info = await workspaceInfo();
        if (!info.trusted) await trustGrant(selected);
      } catch {
        /* optional */
      }
      await restartSidecar(selected);
      await refreshSidecar();
      await refreshHistory();
      await refreshConfig();
    },
    [refreshConfig, refreshHistory, refreshRecent, refreshSidecar],
  );

  const openProject = useCallback(async () => {
    if (!isTauri()) return;
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
    refreshRecent();
  }, [refreshRecent]);

  useEffect(() => {
    if (!projectPath || !isTauri()) return;
    setSidecarWorkspace(projectPath);
    void restartSidecar(projectPath).then(() => refreshSidecar());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bootstrap once on mount when project stored
  }, []);

  const hasProject = Boolean(projectPath);

  return (
    <SidebarProvider defaultOpen>
      <div className="flex h-screen w-full flex-col overflow-hidden">
        <AppHeader
          sidecar={sidecar}
          projectPath={projectPath}
          onOpenSettings={onOpenSettings}
          onOpenProject={() => void openProject()}
          onOpenRecent={(path) => void openProjectPath(path)}
          onClearProject={clearProject}
          onSidecarAction={() => void handleSidecarAction()}
        />
        <div className="flex min-h-0 flex-1">
          <AppSidebar
            projectPath={projectPath}
            hasProject={hasProject}
            sidebarTab={sidebarTab}
            onSidebarTabChange={handleSidebarTabChange}
            sessions={sessionsApi.sessions}
            activeSessionId={sessionsApi.activeId}
            history={history}
            onOpenProject={() => void openProject()}
            onOpenRecent={(path) => void openProjectPath(path)}
            onClearProject={clearProject}
            onNewSession={sessionsApi.createSession}
            onSelectSession={sessionsApi.selectSession}
            onTogglePin={sessionsApi.togglePin}
            onRunDoctor={() => void sessionsApi.runDoctor()}
            onSelectHistory={(task) => void sessionsApi.resumeFromTask(task.task_id, task.goal_text)}
          />
          <SidebarInset className="min-h-0 flex-1 p-0">
            {!hasProject ? (
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
                    onGoalChange={sessionsApi.setGoal}
                    onPreviewPlan={() => void sessionsApi.previewPlan()}
                    onRunGoal={() => void sessionsApi.runGoal()}
                    onRetrySidecar={() => void refreshSidecar()}
                    onUpgradeSidecar={() => void handleSidecarAction()}
                    onFocusChange={setActiveFocus}
                  />
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={38} minSize={24}>
                  <ContextPanel
                    session={sessionsApi.active}
                    activeFocus={activeFocus}
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
