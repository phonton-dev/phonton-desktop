import type { GoalSession } from "@/hooks/useSessions";

type Props = { session: GoalSession | undefined };

export function TokensFocus({ session }: Props) {
  const state = session?.globalState;
  const usage = session?.handoff?.token_usage;

  if (!state && !usage) {
    return (
      <p className="text-sm text-muted-foreground">
        Token buckets appear during and after a run. Compare actual vs naive baseline here.
      </p>
    );
  }

  const used = state?.tokens_used ?? usage?.total_tokens ?? 0;
  const baseline = state?.estimated_naive_tokens ?? 0;
  const budget = state?.tokens_budget;
  const saved = baseline > used ? baseline - used : 0;

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Used" value={used.toLocaleString()} />
        <Stat label="Naive baseline" value={baseline.toLocaleString()} />
        <Stat label="Estimated saved" value={saved.toLocaleString()} />
        <Stat label="Budget" value={budget != null ? budget.toLocaleString() : "∞"} />
      </div>
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
