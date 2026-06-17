import { ScrollArea } from "@/components/ui/scroll-area";
import type { GoalSession } from "@/hooks/useSessions";

type Props = { session: GoalSession | undefined };

export function CodeFocus({ session }: Props) {
  const files = session?.handoff?.changed_files ?? session?.globalState?.handoff_packet?.changed_files ?? [];

  if (files.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Per-file diff summaries appear after verification. Use the CLI Code focus for full hunks.
      </p>
    );
  }

  return (
    <ScrollArea className="h-full max-h-[calc(100vh-16rem)]">
      <ul className="space-y-3 pr-3">
        {files.map((f) => (
          <li key={f.path} className="rounded-lg border bg-muted/20 p-3">
            <div className="font-mono text-xs font-medium">{f.path}</div>
            <div className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">
              {f.summary || `+${f.added_lines} / -${f.removed_lines} lines`}
            </div>
          </li>
        ))}
      </ul>
    </ScrollArea>
  );
}
