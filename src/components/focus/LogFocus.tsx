import { ScrollArea } from "@/components/ui/scroll-area";
import type { GoalSession } from "@/hooks/useSessions";
import { formatEventLine } from "@/lib/types/global-state";

type Props = { session: GoalSession | undefined };

export function LogFocus({ session }: Props) {
  const lines = session?.eventLog ?? [];

  if (lines.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Orchestrator events stream here while a goal runs.
      </p>
    );
  }

  return (
    <ScrollArea className="h-full max-h-[calc(100vh-16rem)]">
      <pre className="log-view pr-3">
        {lines.map((line, i) => (
          <div key={`${i}-${line.slice(0, 24)}`}>{formatEventLine(line)}</div>
        ))}
      </pre>
    </ScrollArea>
  );
}
