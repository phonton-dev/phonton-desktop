import { ScrollArea } from "@/components/ui/scroll-area";
import type { GoalSession } from "@/hooks/useSessions";

type Props = { session: GoalSession | undefined };

export function ProblemsFocus({ session }: Props) {
  const status = session?.globalState?.task_status;
  const handoff = session?.handoff ?? session?.globalState?.handoff_packet;

  const failed =
    status && typeof status === "object" && "Failed" in status ? status.Failed : null;

  const findings = handoff?.verification.findings ?? [];
  const gaps = handoff?.known_gaps ?? [];

  if (!failed && findings.length === 0 && gaps.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No problems reported. Failures, verifier diagnostics, and known gaps surface here.
      </p>
    );
  }

  return (
    <ScrollArea className="h-full max-h-[calc(100vh-16rem)]">
      <div className="space-y-4 pr-3 text-sm">
        {failed ? (
          <section className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
            <h3 className="font-medium text-destructive">Task failed</h3>
            <p className="mt-1 text-muted-foreground">{failed.reason}</p>
          </section>
        ) : null}
        {findings.length > 0 ? (
          <section>
            <h3 className="font-medium mb-2">Verifier findings</h3>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              {findings.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </section>
        ) : null}
        {gaps.length > 0 ? (
          <section>
            <h3 className="font-medium mb-2">Known gaps</h3>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              {gaps.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </ScrollArea>
  );
}
