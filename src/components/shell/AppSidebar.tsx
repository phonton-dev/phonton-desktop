import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { formatRelativeTime, historyStatusLabel } from "@/lib/format-relative";
import { getRecentProjects, projectLabel } from "@/lib/projects";
import { taskStatusTone } from "@/lib/types/global-state";
import type { GoalSession } from "@/hooks/useSessions";
import { ProjectSwitcher } from "@/components/shell/ProjectSwitcher";
import { FolderOpen, Pin, Plus, Stethoscope } from "lucide-react";
import { useMemo, useState } from "react";

export type SidebarTab = "sessions" | "history";

type Props = {
  projectPath: string | null;
  hasProject: boolean;
  sidebarTab: SidebarTab;
  onSidebarTabChange: (tab: SidebarTab) => void;
  sessions: GoalSession[];
  activeSessionId: string;
  history: TaskSummary[];
  onOpenProject: () => void;
  onOpenRecent: (path: string) => void;
  onClearProject: () => void;
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
  onTogglePin: (id: string) => void;
  onRunDoctor: () => void;
  onSelectHistory: (task: TaskSummary) => void;
};

function sessionStatusDot(session: GoalSession): string {
  if (session.running) return "bg-primary animate-pulse";
  if (session.statusTone === "success") return "bg-emerald-500";
  if (session.statusTone === "destructive") return "bg-red-500";
  if (session.statusTone === "warning") return "bg-amber-500";
  return "bg-muted-foreground/40";
}

function historyStatusDot(status: unknown): string {
  const tone = taskStatusTone(status as Parameters<typeof taskStatusTone>[0]);
  if (tone === "success") return "bg-emerald-500";
  if (tone === "destructive") return "bg-red-500";
  if (tone === "warning") return "bg-amber-500";
  return "bg-muted-foreground/40";
}

export function AppSidebar({
  projectPath,
  hasProject,
  sidebarTab,
  onSidebarTabChange,
  sessions,
  activeSessionId,
  history,
  onOpenProject,
  onOpenRecent,
  onClearProject,
  onNewSession,
  onSelectSession,
  onTogglePin,
  onRunDoctor,
  onSelectHistory,
}: Props) {
  const [query, setQuery] = useState("");
  const recentProjects = getRecentProjects();

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

  if (!hasProject) {
    return (
      <Sidebar collapsible="icon" className="border-r border-border/60">
        <SidebarHeader className="gap-2 p-3">
          <ProjectSwitcher
            compact
            projectPath={projectPath}
            onOpenProject={onOpenProject}
            onOpenRecent={onOpenRecent}
          />
          <Button size="sm" className="w-full justify-start gap-2" onClick={onOpenProject}>
            <FolderOpen className="size-4" />
            Open project
          </Button>
        </SidebarHeader>
        <SidebarContent className="shell-muted-scroll">
          <SidebarGroup className="flex min-h-0 flex-1 flex-col">
            <SidebarGroupLabel className="shell-section-label">Recent</SidebarGroupLabel>
            <SidebarGroupContent className="min-h-0 flex-1">
              <ScrollArea className="h-full min-h-[120px]">
                <SidebarMenu>
                  {recentProjects.length === 0 ? (
                    <p className="px-2 text-xs text-muted-foreground">
                      No recent projects yet.
                    </p>
                  ) : (
                    recentProjects.map((path) => (
                      <SidebarMenuItem key={path}>
                        <SidebarMenuButton
                          onClick={() => onOpenRecent(path)}
                          className="flex-col items-start gap-0.5 h-auto py-2"
                          title={path}
                        >
                          <span className="truncate w-full text-left text-sm">
                            {projectLabel(path)}
                          </span>
                          <span className="text-[10px] text-muted-foreground truncate w-full text-left">
                            {path}
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
          v0.3.2 · Ctrl+B sidebar
        </SidebarFooter>
      </Sidebar>
    );
  }

  return (
    <Sidebar collapsible="icon" className="border-r border-border/60">
      <SidebarHeader className="gap-2 p-3">
        <ProjectSwitcher
          compact
          projectPath={projectPath}
          onOpenProject={onOpenProject}
          onOpenRecent={onOpenRecent}
          onClearProject={onClearProject}
        />
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
      <SidebarContent className="flex min-h-0 flex-1 flex-col shell-muted-scroll">
        <Tabs
          value={sidebarTab}
          onValueChange={(v) => onSidebarTabChange(v as SidebarTab)}
          className="flex min-h-0 flex-1 flex-col px-2"
        >
          <TabsList className="w-full h-8 bg-muted/40">
            <TabsTrigger value="sessions" className="flex-1 text-xs">
              Sessions
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1 text-xs">
              History
            </TabsTrigger>
          </TabsList>
          <TabsContent value="sessions" className="mt-2 min-h-0 flex-1 data-[state=inactive]:hidden">
            <ScrollArea className="h-[calc(100vh-13rem)]">
              <SidebarMenu>
                {filteredSessions.length === 0 ? (
                  <p className="px-2 text-xs text-muted-foreground">No sessions match your search.</p>
                ) : (
                  filteredSessions.map((session) => (
                    <SidebarMenuItem key={session.id}>
                      <SidebarMenuButton
                        isActive={session.id === activeSessionId}
                        onClick={() => onSelectSession(session.id)}
                        onDoubleClick={() => onTogglePin(session.id)}
                        className="flex-col items-start gap-1 h-auto py-2"
                        title="Double-click to pin"
                      >
                        <div className="flex w-full items-center gap-2">
                          <span className={`size-2 shrink-0 rounded-full ${sessionStatusDot(session)}`} />
                          {session.pinned ? <Pin className="size-3 shrink-0 text-primary" /> : null}
                          <span className="truncate flex-1 text-left text-sm">{session.title}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {formatRelativeTime(session.createdAt)}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground truncate w-full text-left pl-4">
                          {session.statusLine}
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))
                )}
              </SidebarMenu>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="history" className="mt-2 min-h-0 flex-1 data-[state=inactive]:hidden">
            <div className="mb-2 flex justify-end">
              <Button variant="ghost" size="icon" className="size-6" onClick={onRunDoctor} title="Run doctor">
                <Stethoscope className="size-3.5" />
              </Button>
            </div>
            <ScrollArea className="h-[calc(100vh-14rem)]">
              <SidebarMenu>
                {history.length === 0 ? (
                  <p className="px-2 text-xs text-muted-foreground">
                    No runs yet — run a goal to populate history.
                  </p>
                ) : (
                  history.map((task) => (
                    <SidebarMenuItem key={task.task_id}>
                      <SidebarMenuButton
                        onClick={() => onSelectHistory(task)}
                        className="flex-col items-start gap-1 h-auto py-2"
                      >
                        <div className="flex w-full items-center gap-2">
                          <span className={`size-2 shrink-0 rounded-full ${historyStatusDot(task.status)}`} />
                          <span className="truncate flex-1 text-left text-sm">{task.goal_text}</span>
                        </div>
                        <div className="flex w-full items-center gap-2 pl-4 text-[10px] text-muted-foreground">
                          <span>{historyStatusLabel(task.status)}</span>
                          <span>·</span>
                          <span>{new Date(task.created_at * 1000).toLocaleDateString()}</span>
                        </div>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))
                )}
              </SidebarMenu>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </SidebarContent>
      <SidebarFooter className="p-3 text-[10px] text-muted-foreground">
        v0.3.2 · Ctrl+B sidebar
      </SidebarFooter>
    </Sidebar>
  );
}
