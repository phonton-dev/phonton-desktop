import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { AgentWorkspace } from "@/components/shell/AgentWorkspace";
import { AppHeader } from "@/components/shell/AppHeader";
import { AppSidebar } from "@/components/shell/AppSidebar";
import { ContextPanel } from "@/components/shell/ContextPanel";
import { useSessions } from "@/hooks/useSessions";
import { ensureSidecarReady, useSidecar } from "@/hooks/useSidecar";
import { fetchConfig, listTasks, trustGrant, workspaceInfo, type PhontonConfig, type TaskSummary } from "@/lib/config";
import { projectLabel, getActiveProject, setActiveProject } from "@/lib/projects";
import { isTauri, restartSidecar, setSidecarWorkspace } from "@/lib/sidecar";

type Props = {
  onOpenSettings: () => void;
};

export function MainShell({ onOpenSettings }: Props) {
  const [projectPath, setProjectPath] = useState<string | null>(() => getActiveProject());
  const [history, setHistory] = useState<TaskSummary[]>([]);
  const [config, setConfig] = useState<PhontonConfig | null>(null);
  const { state: sidecar, refresh: refreshSidecar } = useSidecar();
  const sessionsApi = useSessions();

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

  const handleSidecarAction = useCallback(async () => {
    await ensureSidecarReady(true, () => undefined);
    await refreshSidecar();
    await refreshConfig();
    await refreshHistory();
  }, [refreshConfig, refreshHistory, refreshSidecar]);

  const openProject = useCallback(async () => {
    if (!isTauri()) return;
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Open project folder",
    });
    if (!selected || Array.isArray(selected)) return;
    setActiveProject(selected);
    setProjectPath(selected);
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
  }, [refreshConfig, refreshHistory, refreshSidecar]);

  useEffect(() => {
    if (!projectPath || !isTauri()) return;
    setSidecarWorkspace(projectPath);
    void restartSidecar(projectPath).then(() => refreshSidecar());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bootstrap once on mount when project stored
  }, []);

  const showProjectCta = !projectPath;

  return (
    <SidebarProvider defaultOpen>
      <div className="flex h-screen w-full flex-col overflow-hidden">
        <AppHeader
          sidecar={sidecar}
          projectPath={projectPath}
          onOpenSettings={onOpenSettings}
          onSidecarAction={() => void handleSidecarAction()}
        />
        <div className="flex min-h-0 flex-1">
          <AppSidebar
            projectPath={projectPath}
            sessions={sessionsApi.sessions}
            activeSessionId={sessionsApi.activeId}
            history={history}
            onOpenProject={() => void openProject()}
            onNewSession={sessionsApi.createSession}
            onSelectSession={sessionsApi.selectSession}
            onTogglePin={sessionsApi.togglePin}
            onRunDoctor={() => void sessionsApi.runDoctor()}
            onSelectHistory={(task) => void sessionsApi.resumeFromTask(task.task_id, task.goal_text)}
          />
          <SidebarInset className="min-h-0 flex-1 p-0">
            {showProjectCta ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
                <h2 className="text-xl font-semibold">Open a project to start</h2>
                <p className="max-w-md text-sm text-muted-foreground">
                  Phonton Desktop runs goals against a local folder. Open your repo, then describe a
                  merge-bound goal.
                </p>
                <button
                  type="button"
                  className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
                  onClick={() => void openProject()}
                >
                  Open project folder
                </button>
              </div>
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
