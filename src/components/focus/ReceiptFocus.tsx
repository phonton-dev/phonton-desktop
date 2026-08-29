import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { GoalSession } from "@/hooks/useSessions";
import type { HandoffPacket } from "@/lib/types/global-state";
import {
  costReceiptFromSession,
  formatUsdMicros,
  routeLabels,
  savedPercent,
  taskHeadline,
} from "@/lib/economics";

type Props = {
  session: GoalSession | undefined;
  compact?: boolean;
  filesOnly?: boolean;
};

function EconomicsBlock({ session }: { session: GoalSession | undefined }) {
  const receipt = costReceiptFromSession(session);
  const saved = savedPercent(receipt);
  const route = routeLabels(session);

  return (
    <>
      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border bg-card/40 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Cost</p>
          <p className="text-lg font-semibold tabular-nums">
            {receipt ? formatUsdMicros(receipt.actual_usd_micros) : "-"}
          </p>
        </div>
        <div className="rounded-lg border bg-card/40 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Saved vs frontier</p>
          <p className="text-lg font-semibold tabular-nums text-emerald-400">
            {receipt && saved != null
              ? `${formatUsdMicros(receipt.saved_usd_micros)} (${saved}%)`
              : "-"}
          </p>
        </div>
      </section>
      <section>
        <h4 className="text-sm font-medium mb-2">Models</h4>
        <p className="text-xs text-muted-foreground">{route}</p>
        {receipt && !receipt.pricing_known ? (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Cost is estimated from published list prices for the model tier.
          </p>
        ) : null}
      </section>
    </>
  );
}

function ReceiptBody({
  packet,
  session,
  filesOnly,
}: {
  packet: HandoffPacket;
  session: GoalSession | undefined;
  filesOnly?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">{packet.headline}</h3>
        <p className="text-xs text-muted-foreground mt-1">{packet.goal}</p>
      </div>
      {filesOnly ? null : <EconomicsBlock session={session} />}
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
    </div>
  );
}

export function ReceiptFocus({ session, compact, filesOnly }: Props) {
  const packet = session?.handoff ?? session?.globalState?.handoff_packet ?? null;
  const receipt = costReceiptFromSession(session);

  if (!packet) {
    if (receipt && !filesOnly) {
      return (
        <ScrollArea className={compact ? "h-[calc(100vh-14rem)]" : "h-full max-h-[calc(100vh-16rem)]"}>
          <div className="space-y-4 pr-3">
            <div>
              <h3 className="text-base font-semibold">{taskHeadline(session)}</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Cost receipt from this run. File-level handoff appears when the engine publishes one.
              </p>
            </div>
            <EconomicsBlock session={session} />
          </div>
        </ScrollArea>
      );
    }
    return (
      <p className="text-sm text-muted-foreground">
        {filesOnly
          ? "Changed files and checks appear here after a goal finishes."
          : compact
            ? "Run a goal to generate a receipt: files, checks, models, and cost."
            : "Complete a goal to see the receipt: changed files, verification, models used, cost vs frontier, and known gaps."}
      </p>
    );
  }

  return (
    <ScrollArea className={compact ? "h-[calc(100vh-14rem)]" : "h-full max-h-[calc(100vh-16rem)]"}>
      <div className="pr-3">
        <ReceiptBody packet={packet} session={session} filesOnly={filesOnly} />
      </div>
    </ScrollArea>
  );
}
