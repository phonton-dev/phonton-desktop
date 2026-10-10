import type { ModelStatus } from "./local-models";
import type { ReviewedModelSelection } from "./local-run";
import type { SidecarState } from "../hooks/useSidecar";
import { sameInstalledModel } from "./model-download-availability";

const MANAGED_ENDPOINT = "http://127.0.0.1:11434";

/** Explain whether a goal may use the runtime shown by model status. */
export function localRunRuntimeGate(status: ModelStatus | null): { blocked: boolean; requiresConsent: boolean } {
  const store = status?.model_store;
  // Older engines omit goal_run_blocked. A recovery warning at the managed
  // endpoint must not become permission to send repository context.
  const blocked = store?.goal_run_blocked ?? Boolean(
    status?.endpoint === MANAGED_ENDPOINT && store?.recovery_required,
  );
  return {
    blocked,
    requiresConsent: Boolean(status && !blocked && store?.status !== "verified_managed"),
  };
}

/** A cached plan may run only with the same currently observed runtime and calibrated model. */
export function localRunPlanModelCurrent(status: ModelStatus | null, selection: ReviewedModelSelection | null): boolean {
  if (!status || !selection || !selection.protocol || status.runtime_error || !status.runtime_version ||
      localRunRuntimeGate(status).blocked || status.endpoint !== selection.endpoint ||
      status.runtime_version !== selection.runtime_version || !sameInstalledModel(status.active_model, selection.model)) return false;
  const matching = status.models.filter(row => sameInstalledModel(row.model.name, selection.model));
  if (matching.length !== 1) return false;
  const installed = matching[0];
  const profile = installed?.profile;
  return installed?.model.digest === selection.digest && installed?.profile_sha256 === selection.profile_sha256 &&
    profile?.digest === selection.digest &&
    profile.runtime_version === selection.runtime_version && profile.context_tokens === selection.context_tokens &&
    profile.output_tokens === selection.output_tokens && profile.protocol === selection.protocol;
}

export type LocalRunRuntimePresentation = {
  label: string;
  footer: string;
  tone: "ready" | "idle" | "error";
};

/** Describe observed engine and model-runtime readiness without implying inference before it is available. */
export function localRunRuntimePresentation(
  engineStatus: SidecarState["status"],
  status: ModelStatus | null,
): LocalRunRuntimePresentation {
  if (engineStatus === "idle" || engineStatus === "connecting") {
    return { label: "○ Connecting engine", footer: "Connecting local engine", tone: "idle" };
  }
  if (engineStatus !== "ready") {
    return { label: "× Engine unavailable", footer: "Local engine unavailable", tone: "error" };
  }
  if (!status) {
    return { label: "○ Checking runtime", footer: "Checking local runtime", tone: "idle" };
  }
  if (localRunRuntimeGate(status).blocked) {
    return { label: "× Runtime recovery", footer: "Managed runtime recovery required", tone: "error" };
  }
  if (status.runtime_error || !status.runtime_version) {
    return { label: "× Runtime unavailable", footer: "Local model runtime unavailable", tone: "error" };
  }
  if (status.model_store?.status === "verified_managed") {
    return { label: "● Managed runtime", footer: "Managed runtime connected", tone: "ready" };
  }
  return {
    label: "● Loopback runtime",
    footer: "Loopback runtime connected · origin unverified",
    tone: "ready",
  };
}
