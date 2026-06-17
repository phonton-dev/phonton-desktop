import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { TaskSummary } from "@/lib/config";
import { projectLabel } from "@/lib/projects";
import type { GoalSession } from "@/hooks/useSessions";
import { FolderOpen, History, Plus, Stethoscope } from "lucide-react";

type Props = {
  projectPath: string | null;
  sessions: GoalSession[];
  activeSessionId: string;
  history: TaskSummary[];
  onOpenProject: () => void;
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
  onRunDoctor: () => void;
  onSelectHistory: (task: TaskSummary) => void;
};

export function AppSidebar({
  projectPath,
  sessions,
  activeSessionId,
  history,
  onOpenProject,
  onNewSession,
  onSelectSession,
  onRunDoctor,
  onSelectHistory,
}: Props) {
  return (
    <Sidebar collapsible="icon" className="border-r border-border/60">
      <SidebarHeader className="gap-2 p-3">
        <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={onOpenProject}>
          <FolderOpen className="size-4" />
          {projectPath ? projectLabel(projectPath) : "Open project"}
        </Button>
        <Button size="sm" className="w-full justify-start gap-2" onClick={onNewSession}>
          <Plus className="size-4" />
          New goal
        </Button>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Sessions</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {sessions.map((session) => (
                <SidebarMenuItem key={session.id}>
                  <SidebarMenuButton
                    isActive={session.id === activeSessionId}
                    onClick={() => onSelectSession(session.id)}
                    className="flex-col items-start gap-0.5 h-auto py-2"
                  >
                    <span className="truncate w-full text-left">{session.title}</span>
                    <span className="text-[10px] text-muted-foreground truncate w-full">
                      {session.running ? "Running…" : session.statusLine}
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center justify-between">
            <span>History</span>
            <Button variant="ghost" size="icon" className="size-6" onClick={onRunDoctor} title="Run doctor">
              <Stethoscope className="size-3.5" />
            </Button>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <ScrollArea className="h-[220px]">
              <SidebarMenu>
                {history.length === 0 ? (
                  <p className="px-2 text-xs text-muted-foreground">No runs yet</p>
                ) : (
                  history.map((task) => (
                    <SidebarMenuItem key={task.task_id}>
                      <SidebarMenuButton
                        onClick={() => onSelectHistory(task)}
                        className="flex-col items-start gap-0.5 h-auto py-2"
                      >
                        <span className="truncate w-full text-left">{task.goal_text}</span>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <History className="size-3" />
                          {new Date(task.created_at * 1000).toLocaleDateString()}
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))
                )}
              </SidebarMenu>
            </ScrollArea>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3 text-[10px] text-muted-foreground">
        Agent workspace
      </SidebarFooter>
    </Sidebar>
  );
}
