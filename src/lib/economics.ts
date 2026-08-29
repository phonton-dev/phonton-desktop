import type { CostReceipt, GlobalState, HandoffPacket, WorkerState } from "@/lib/types/global-state";

export type EconomicsSource = {
  goal?: string;
  running?: boolean;
  globalState?: GlobalState | null;
  handoff?: HandoffPacket | null;
  planData?: { subtasks?: { model_tier?: string }[] } | null;
};

export function formatUsdMicros(micros: number | undefined | null): string {
  if (micros == null) return "-";
  return `$${(micros / 1_000_000).toFixed(3)}`;
}

export function savedPercent(receipt: CostReceipt | null | undefined): number | null {
  if (!receipt || !receipt.frontier_equivalent_usd_micros) return null;
  const diff = receipt.frontier_equivalent_usd_micros - receipt.actual_usd_micros;
  return Math.round((diff / receipt.frontier_equivalent_usd_micros) * 100);
}

export function costReceiptFromSession(session: EconomicsSource | undefined): CostReceipt | null {
  if (!session) return null;
  const receipt =
    session.globalState?.cost_receipt ??
    session.handoff?.cost_receipt ??
    null;
  if (!receipt) return null;
  const hasSignal =
    receipt.route.length > 0 ||
    receipt.actual_usd_micros > 0 ||
    receipt.frontier_equivalent_usd_micros > 0;
  return hasSignal ? receipt : null;
}

export function routeLabels(session: EconomicsSource | undefined): string {
  const receipt = costReceiptFromSession(session);
  if (receipt?.route?.length) {
    return receipt.route
      .map((step) => {
        const name = step.model?.trim() || step.tier;
        return `${name} (${step.outcome})`;
      })
      .join(" → ");
  }
  const workers = session?.globalState?.active_workers ?? [];
  if (workers.length) {
    return workers
      .map((w) => w.model_name?.trim() || w.model_tier)
      .filter(Boolean)
      .join(" → ");
  }
  const plan = session?.planData?.subtasks ?? [];
  if (plan.length) {
    return plan.map((st) => st.model_tier ?? "cheap").join(" → ");
  }
  return "-";
}

export function verificationSummary(session: EconomicsSource | undefined): string {
  const packet: HandoffPacket | null =
    session?.handoff ?? session?.globalState?.handoff_packet ?? null;
  if (packet?.verification.passed.length) {
    return packet.verification.passed.join(", ");
  }
  if (packet?.verification.findings.length) {
    return "Failed checks";
  }
  const status = session?.globalState?.task_status;
  if (status && typeof status === "object" && "Failed" in status) {
    return "Failed";
  }
  if (session?.running) return "Running checks";
  return "-";
}

export function taskHeadline(session: EconomicsSource | undefined): string {
  const packet = session?.handoff ?? session?.globalState?.handoff_packet;
  if (packet?.headline) return packet.headline;
  if (session?.goal?.trim()) return session.goal.trim();
  return "No goal yet";
}

export function naiveTokenHint(state: GlobalState | null | undefined): string | null {
  if (!state?.estimated_naive_tokens) return null;
  return `${state.tokens_used.toLocaleString()} tok vs ${state.estimated_naive_tokens.toLocaleString()} naive`;
}

export function workerRouteLine(workers: WorkerState[]): string {
  if (!workers.length) return "-";
  return workers.map((w) => w.model_name?.trim() || w.model_tier).join(" → ");
}
