import type { LocalApplyReceipt, LocalCandidate, LocalReceipt } from "./local-run";

export function localMutationConfirmed(action: "apply" | "rollback", runId: string, candidateNumber: number, status: LocalApplyReceipt | null): boolean {
  return status?.run_id === runId && status.candidate_number === candidateNumber
    && status.state === (action === "apply" ? "applied" : "rolled_back");
}

export function localMutationNeedsRecheck(previous: { action: "apply" | "rollback"; retryReady: boolean } | null, action: "apply" | "rollback", runId: string, candidateNumber: number, status: LocalApplyReceipt | null): boolean {
  return previous?.action === action && !localMutationConfirmed(action, runId, candidateNumber, status);
}

export function localRunRepositorySelection(receipt: LocalReceipt | null, activeRepository: string, canonicalMatch: boolean | null, checkError: string | null = null): { allowed: boolean; reason: string | null } {
  if (!receipt) return { allowed: false, reason: "No saved run repository is available." };
  if (!activeRepository.trim()) {
    return { allowed: false, reason: "This run targets a different repository. Switch to the run repository before Apply or Rollback." };
  }
  if (checkError) return { allowed: false, reason: `Repository check failed: ${checkError}` };
  if (canonicalMatch === null) return { allowed: false, reason: "Checking the selected repository…" };
  if (!canonicalMatch) return { allowed: false, reason: "This run targets a different repository. Switch to the run repository before Apply or Rollback." };
  return { allowed: true, reason: null };
}

export function localApplyEligibility(receipt: LocalReceipt | null, candidate: LocalCandidate | undefined): { allowed: boolean; reason: string | null } {
  if (!receipt || !candidate || receipt.state !== "review_ready" || receipt.selected_candidate !== candidate.number) {
    return { allowed: false, reason: "No complete, verified candidate is selected." };
  }
  if (candidate.stage === "creation_pending_edit" || !candidate.content_sha256 || !candidate.diff) {
    return { allowed: false, reason: "The selected candidate has no complete reviewed changeset." };
  }
  if (receipt.git_index?.status !== "passed" || receipt.git_index.stage !== "final review") {
    return { allowed: false, reason: "This saved run has no final Git staging integrity proof. Review its diff or run a fresh goal before Apply." };
  }
  const checks = receipt.request.checks ?? [];
  const preparation = receipt.request.preparation;
  const expected = [...(preparation ? [{ check: preparation, purpose: "preparation" }] : []), ...checks.map(check => ({ check, purpose: "verification" }))];
  if (!checks.length || candidate.checks.length !== expected.length || candidate.checks.some((evidence, index) => {
    const selected = expected[index];
    return (evidence.purpose ?? "verification") !== selected.purpose || evidence.status !== "passed" || evidence.exit_code !== 0 || evidence.check?.program !== selected.check.program || JSON.stringify(evidence.check.args) !== JSON.stringify(selected.check.args);
  })) {
    return { allowed: false, reason: "The selected candidate has no matching passing check evidence." };
  }
  return { allowed: true, reason: null };
}

export function localRollbackEligibility(receipt: LocalReceipt | null, candidate: LocalCandidate | undefined, status: LocalApplyReceipt | null, windows = typeof navigator !== "undefined" && navigator.userAgent.includes("Windows")): { allowed: boolean; reason: string | null } {
  const reviewed = localApplyEligibility(receipt, candidate);
  if (!reviewed.allowed) return reviewed;
  if (!status || status.run_id !== receipt?.id || status.candidate_number !== candidate?.number) {
    return { allowed: false, reason: "No matching Apply journal is available to restore." };
  }
  if (receipt.request.new_file) {
    const mixed = !!receipt.request.editable_existing?.length;
    if (status.schema !== (mixed ? 4 : 3)) {
      return { allowed: false, reason: "This creation journal does not match the reviewed change." };
    }
    if (!windows) {
      return { allowed: false, reason: "Created-file rollback is currently available on Windows only." };
    }
    if (!status.created_file?.anchor || !status.created_file.identity || !status.created_file.publication_attempted) {
      return { allowed: false, reason: "This creation journal has no retained file-identity proof for safe rollback." };
    }
    if (!["applied", "rollback_prepared"].includes(status.state)) {
      return { allowed: false, reason: status.state === "prepared" ? "Finish or inspect the interrupted Apply before rollback." : "This Apply journal has already been rolled back." };
    }
    return { allowed: true, reason: null };
  }
  if (status.schema !== 1 && status.schema !== 2) {
    return { allowed: false, reason: "This Apply journal cannot restore existing files." };
  }
  if (!["prepared", "applied", "rollback_prepared"].includes(status.state)) {
    return { allowed: false, reason: "This Apply journal has already been rolled back." };
  }
  return { allowed: true, reason: null };
}
