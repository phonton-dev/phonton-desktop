import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
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
import { FolderOpen, History, Pin, Plus, Stethoscope } from "lucide-react";
import { useMemo, useState } from "react";

type Props = {
  projectPath: string | null;
  sessions: GoalSession[];
  activeSessionId: string;
  history: TaskSummary[];
  onOpenProject: () => void;
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
  onTogglePin: (id: string) => void;
  onRunDoctor: () => void;
  onSelectHistory: (task: TaskSummary) => void;
};

function statusBadge(session: GoalSession) {
  if (session.running) return <Badge className="text-[10px] h-5">Running</Badge>;
  if (session.statusTone === "success")
    return (
      <Badge variant="secondary" className="text-[10px] h-5 bg-emerald-500/15 text-emerald-600">
        Review ready
      </Badge>
    );
  if (session.statusTone === "destructive")
    return (
      <Badge variant="destructive" className="text-[10px] h-5">
        Failed
      </Badge>
    );
  return null;
}

export function AppSidebar({
  projectPath,
  sessions,
  activeSessionId,
  history,
  onOpenProject,
  onNewSession,
  onSelectSession,
  onTogglePin,
  onRunDoctor,
  onSelectHistory,
}: Props) {
  const [query, setQuery] = useState("");

  const filteredSessions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...sessions].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.createdAt - a.createdAt;
    });
    if (!q) return sorted;
    return sorted.filter(
      (s) => s.title.toLowerCase().includes(q) || s.goal.toLowerCase().includes(q),
    );
  }, [query, sessions]);

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
        <Input
          placeholder="Search sessions…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 text-xs"
        />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Sessions</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredSessions.map((session) => (
                <SidebarMenuItem key={session.id}>
                  <SidebarMenuButton
                    isActive={session.id === activeSessionId}
                    onClick={() => onSelectSession(session.id)}
                    onDoubleClick={() => onTogglePin(session.id)}
                    className="flex-col items-start gap-1 h-auto py-2"
                    title="Double-click to pin"
                  >
                    <div className="flex w-full items-center gap-1">
                      {session.pinned ? <Pin className="size-3 shrink-0 text-primary" /> : null}
                      <span className="truncate flex-1 text-left text-sm">{session.title}</span>
                      {statusBadge(session)}
                    </div>
                    <span className="text-[10px] text-muted-foreground truncate w-full text-left">
                      {session.statusLine}
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
                  <p className="px-2 text-xs text-muted-foreground">No runs yet — run a goal to populate history.</p>
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
