import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { GoalSession } from "@/hooks/useSessions";
import type { HandoffPacket } from "@/lib/types/global-state";

type Props = {
  session: GoalSession | undefined;
  compact?: boolean;
};

function ReceiptBody({ packet }: { packet: HandoffPacket }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">{packet.headline}</h3>
        <p className="text-xs text-muted-foreground mt-1">{packet.goal}</p>
      </div>
      {packet.changed_files.length > 0 ? (
        <section>
          <h4 className="text-sm font-medium mb-2">Changed files</h4>
          <ul className="space-y-2 text-sm">
            {packet.changed_files.map((f) => (
              <li key={f.path} className="rounded-md border px-3 py-2">
                <div className="font-mono text-xs">{f.path}</div>
                <div className="text-muted-foreground text-xs mt-1">
                  +{f.added_lines} / -{f.removed_lines}
                  {f.summary ? ` · ${f.summary}` : ""}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {packet.verification.passed.length > 0 || packet.verification.findings.length > 0 ? (
        <section>
          <h4 className="text-sm font-medium mb-2">Verification</h4>
          {packet.verification.passed.map((p) => (
            <Badge key={p} variant="secondary" className="mr-1 mb-1">
              ✓ {p}
            </Badge>
          ))}
          {packet.verification.findings.map((f) => (
            <p key={f} className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              {f}
            </p>
          ))}
        </section>
      ) : null}
      {packet.run_commands.length > 0 ? (
        <section>
          <h4 className="text-sm font-medium mb-2">Run commands</h4>
          <ul className="space-y-2">
            {packet.run_commands.map((rc) => (
              <li key={rc.label} className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs font-mono"
                  onClick={() => void navigator.clipboard.writeText(rc.command.join(" "))}
                >
                  {rc.label}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {packet.known_gaps.length > 0 ? (
        <section className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
          <h4 className="text-sm font-medium mb-1">Known gaps</h4>
          <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
            {packet.known_gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Tokens: {(packet.token_usage.total_tokens ?? packet.token_usage.input_tokens ?? 0).toLocaleString()}
      </p>
    </div>
  );
}

export function ReceiptFocus({ session, compact }: Props) {
  const packet = session?.handoff ?? session?.globalState?.handoff_packet ?? null;

  if (!packet) {
    return (
      <p className="text-sm text-muted-foreground">
        {compact
          ? "Run a goal to generate a HandoffPacket receipt."
          : "Complete a goal to see the typed receipt: changed files, verification, run commands, and known gaps."}
      </p>
    );
  }

  return (
    <ScrollArea className={compact ? "h-[calc(100vh-14rem)]" : "h-full max-h-[calc(100vh-16rem)]"}>
      <div className="pr-3">
        <ReceiptBody packet={packet} />
      </div>
    </ScrollArea>
  );
}
