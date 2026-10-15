import type { GoalSession } from "@/hooks/useSessions";
import { costReceiptFromSession, formatUsdMicros, savedPercent } from "@/lib/economics";
import { AsciiBar } from "@/components/ascii/ascii";

type Props = { session: GoalSession | undefined };

export function TokensFocus({ session }: Props) {
  const state = session?.globalState;
  const usage = session?.handoff?.token_usage;
  const receipt = costReceiptFromSession(session);

  if (!state && !usage && !receipt) {
    return (
      <p className="text-sm text-muted-foreground">
        Cost and token buckets appear during and after a run. Compare estimated model spend with the frontier estimate here.
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
        <Stat label="Cost estimate" value={receipt ? formatUsdMicros(receipt.actual_usd_micros) : "-"} />
        <Stat
          label="Frontier estimate"
          value={receipt ? formatUsdMicros(receipt.frontier_equivalent_usd_micros) : "-"}
        />
        <Stat
          label="Est. saved vs frontier"
          value={receipt && saved != null ? `${formatUsdMicros(receipt.saved_usd_micros)} (${saved}%)` : "-"}
        />
        <Stat label="Tokens used" value={used.toLocaleString()} />
        <Stat label="Naive token baseline" value={baseline.toLocaleString()} />
        <Stat label="Tokens saved vs naive" value={savedTok.toLocaleString()} />
      </div>
      {baseline > 0 ? (
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>Tokens used against the naive baseline</p>
          <AsciiBar label="Tokens used of the naive baseline" value={used} max={baseline} cells={32} />
        </div>
      ) : null}
      {receipt ? (
        <p className="text-xs text-muted-foreground">
          {receipt.pricing_known
            ? "Dollar figures use registered model rates and token counts. Discounts and cache pricing may change the billed amount."
            : "Dollar figures use a model-tier price proxy because complete model pricing was unavailable. They are not a bill."}
        </p>
      ) : null}
      {usage ? (
        <div className="border p-3 text-xs text-muted-foreground space-y-1 tabular-nums">
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
    <div className="border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
