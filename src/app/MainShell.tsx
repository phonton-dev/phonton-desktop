import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { AgentWorkspace } from "@/components/shell/AgentWorkspace";
import { AppHeader } from "@/components/shell/AppHeader";
import { AppSidebar } from "@/components/shell/AppSidebar";
import { ContextPanel } from "@/components/shell/ContextPanel";
import { useSessions } from "@/hooks/useSessions";
import { useSidecar } from "@/hooks/useSidecar";
import { listTasks, trustGrant, workspaceInfo, type TaskSummary } from "@/lib/config";
import {
  getActiveProject,
  setActiveProject,
} from "@/lib/projects";
import { isTauri, restartSidecar, setSidecarWorkspace } from "@/lib/sidecar";

type Props = {
  onOpenSettings: () => void;
};

export function MainShell({ onOpenSettings }: Props) {
  const [projectPath, setProjectPath] = useState<string | null>(() => getActiveProject());
  const [history, setHistory] = useState<TaskSummary[]>([]);
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

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory, sessionsApi.active?.running]);

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
  }, [refreshHistory, refreshSidecar]);

  useEffect(() => {
    if (!projectPath || !isTauri()) return;
    setSidecarWorkspace(projectPath);
    void restartSidecar(projectPath).then(() => refreshSidecar());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bootstrap once on mount when project stored
  }, []);

  return (
    <SidebarProvider defaultOpen>
      <div className="flex h-screen w-full flex-col overflow-hidden">
        <AppHeader
          sidecar={sidecar}
          projectPath={projectPath}
          onOpenSettings={onOpenSettings}
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
            onRunDoctor={() => void sessionsApi.runDoctor()}
            onSelectHistory={(task) => sessionsApi.resumeFromTask(task.task_id, task.goal_text)}
          />
          <SidebarInset className="min-h-0 flex-1 p-0">
            <ResizablePanelGroup orientation="horizontal" className="h-full min-h-0">
              <ResizablePanel defaultSize={62} minSize={40}>
                <AgentWorkspace
                  session={sessionsApi.active}
                  sidecar={sidecar}
                  onGoalChange={sessionsApi.setGoal}
                  onPreviewPlan={() => void sessionsApi.previewPlan()}
                  onRunGoal={() => void sessionsApi.runGoal()}
                  onRetrySidecar={() => void refreshSidecar()}
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
          </SidebarInset>
        </div>
      </div>
    </SidebarProvider>
  );
}
