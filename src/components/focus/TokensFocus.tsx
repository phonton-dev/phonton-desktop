import type { GoalSession } from "@/hooks/useSessions";
import { costReceiptFromSession, formatUsdMicros, savedPercent } from "@/lib/economics";

type Props = { session: GoalSession | undefined };

export function TokensFocus({ session }: Props) {
  const state = session?.globalState;
  const usage = session?.handoff?.token_usage;
  const receipt = costReceiptFromSession(session);

  if (!state && !usage && !receipt) {
    return (
      <p className="text-sm text-muted-foreground">
        Cost and token buckets appear during and after a run. Compare actual dollars vs the frontier estimate here.
      </p>
    );
  }

  const used = state?.tokens_used ?? usage?.total_tokens ?? 0;
  const baseline = state?.estimated_naive_tokens ?? 0;
  const savedTok = baseline > used ? baseline - used : 0;
  const saved = savedPercent(receipt);

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Actual cost" value={receipt ? formatUsdMicros(receipt.actual_usd_micros) : "-"} />
        <Stat
          label="Frontier estimate"
          value={receipt ? formatUsdMicros(receipt.frontier_equivalent_usd_micros) : "-"}
        />
        <Stat
          label="Saved vs frontier"
          value={receipt && saved != null ? `${formatUsdMicros(receipt.saved_usd_micros)} (${saved}%)` : "-"}
        />
        <Stat label="Tokens used" value={used.toLocaleString()} />
        <Stat label="Naive token baseline" value={baseline.toLocaleString()} />
        <Stat label="Tokens saved vs naive" value={savedTok.toLocaleString()} />
      </div>
      {receipt && !receipt.pricing_known ? (
        <p className="text-xs text-muted-foreground">
          Dollar figures are estimated from published list prices for the model tier, not a live invoice.
        </p>
      ) : null}
      {usage ? (
        <div className="rounded-md border p-3 text-xs text-muted-foreground space-y-1">
          <div>Input: {(usage.input_tokens ?? 0).toLocaleString()}</div>
          <div>Output: {(usage.output_tokens ?? 0).toLocaleString()}</div>
          <div>Cached: {(usage.cached_tokens ?? 0).toLocaleString()}</div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card/40 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
