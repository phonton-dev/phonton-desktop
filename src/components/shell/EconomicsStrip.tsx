import { Badge } from "@/components/ui/badge";
import type { GoalSession } from "@/hooks/useSessions";
import {
  costReceiptFromSession,
  formatUsdMicros,
  routeLabels,
  savedPercent,
  taskHeadline,
  verificationSummary,
} from "@/lib/economics";

type Props = {
  session: GoalSession | undefined;
};

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "muted";
}) {
  const valueClass =
    tone === "ok"
      ? "text-emerald-400"
      : tone === "warn"
        ? "text-amber-400"
        : "text-foreground";
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-0.5 truncate text-sm font-medium tabular-nums ${valueClass}`} title={value}>
        {value}
      </p>
    </div>
  );
}

export function EconomicsStrip({ session }: Props) {
  const receipt = costReceiptFromSession(session);
  const saved = savedPercent(receipt);
  const verify = verificationSummary(session);
  const verifyOk = verify !== "-" && verify !== "Failed" && verify !== "Failed checks";

  return (
    <div className="border-b border-border/60 bg-card/40 px-4 py-2.5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Cell label="Task" value={taskHeadline(session)} />
        <Cell label="Models" value={routeLabels(session)} />
        <Cell
          label="Est. cost"
          value={receipt ? formatUsdMicros(receipt.actual_usd_micros) : "-"}
        />
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Verification</p>
          <div className="mt-0.5">
            {verify === "-" ? (
              <span className="text-sm text-muted-foreground">-</span>
            ) : (
              <Badge variant={verifyOk ? "secondary" : "destructive"} className="max-w-full truncate font-normal">
                {verifyOk ? `✓ ${verify}` : verify}
              </Badge>
            )}
          </div>
        </div>
        <Cell
          label="Est. saved vs frontier"
          value={
            receipt && saved != null
              ? `${formatUsdMicros(receipt.saved_usd_micros)} (${saved}%)`
              : "-"
          }
          tone={saved != null && saved > 0 ? "ok" : "muted"}
        />
      </div>
    </div>
  );
}
