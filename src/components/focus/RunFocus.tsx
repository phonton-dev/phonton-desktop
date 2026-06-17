import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { GoalSession } from "@/hooks/useSessions";
import { subtaskStatusLabel, taskStatusLabel } from "@/lib/types/global-state";

type Props = { session: GoalSession | undefined };

export function RunFocus({ session }: Props) {
  const state = session?.globalState;
  const workers = state?.active_workers ?? [];

  if (!session?.running && workers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Active subtasks and verify status appear here while a goal runs.
      </p>
    );
  }

  return (
    <ScrollArea className="h-full max-h-[calc(100vh-16rem)]">
      <div className="space-y-3 pr-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Task</span>
          <Badge variant="secondary">{taskStatusLabel(state?.task_status)}</Badge>
          {state?.tokens_used != null ? (
            <span className="text-xs text-muted-foreground">{state.tokens_used.toLocaleString()} tokens</span>
          ) : null}
        </div>
        {workers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{session?.statusLine ?? "Waiting…"}</p>
        ) : (
          <ul className="space-y-2">
            {workers.map((w) => (
              <li key={w.subtask_id} className="rounded-lg border bg-card/40 px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium">{w.subtask_description}</span>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {w.model_tier}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {subtaskStatusLabel(w.status)}
                  {w.is_thinking ? " · thinking…" : ""}
                  {w.tokens_used ? ` · ${w.tokens_used} tok` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ScrollArea>
  );
}
