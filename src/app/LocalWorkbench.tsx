import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useSidecar } from "@/hooks/useSidecar";
import { sidecarProcessAlive, isTauri } from "@/lib/sidecar";
import { getActiveProject, setActiveProject, subscribeActiveProject } from "@/lib/projects";
import { memorySize, modelStatus, modelOperation, type ModelStatus } from "@/lib/local-models";
import { applyLocalRun, rollbackLocalRun, cancelLocalRun, localRunApplyStatus, localRunHasEvidence, localRunList, localRunRead, localRunRepositoryMatch, localRunStatus, previewLocalRun, startLocalRun, type CheckEvidence, type LocalApplyReceipt, type LocalReceipt, type LocalPlan, type LocalRunAttempt, type LocalRunList } from "@/lib/local-run";
import { createPendingLocalStart } from "@/lib/local-run-start";
import { localPlanBudgetSummary } from "@/lib/local-plan-budget";
import { localPlanFileAction } from "@/lib/local-plan-file-action";
import { displayLocalRunCommand, parseLocalRunChecks } from "@/lib/local-run-checks";
import { localRunPlanModelCurrent, localRunRuntimeGate, localRunRuntimePresentation } from "@/lib/local-run-runtime-gate";
import { summarizeLocalRunUsage, tokenReading } from "@/lib/local-run-usage";
import { sameInstalledModel } from "@/lib/model-download-availability";
import { localApplyEligibility, localMutationConfirmed, localMutationNeedsRecheck, localRollbackEligibility, localRunRepositorySelection } from "@/lib/local-run-apply";
import { localEngineErrorMessage, RpcRemoteError } from "@/lib/serve";
import { LocalModelsPage } from "@/pages/LocalModelsPage";
import { projectSwitchBlockReason } from "@/lib/project-switch";
import { goalActive, rpc } from "@/lib/serve";
import { Gauge, LoopTrack, Receipt, Spinner, type Track, type Verdict } from "@/components/ink/Ink";
import "./local-workbench.css";

const RUN_KEY = "phonton.local.lastRun";
const MODEL_STATUS_REFRESH_MS = 20_000;
const MODEL_STATUS_STALE_MS = 45_000;
const label = (state: string) => state.replaceAll("_", " ");
/** Last path segment of a repository path, for the composer heading. */
const repositoryName = (path: string) => path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "";
function Checks({ checks }: { checks: CheckEvidence[] }) {
  return <div className="lw-checks">{checks.map((check, i) => <details key={i}>
    <summary><span data-status={check.status}>{check.status === "passed" ? "✓" : check.status === "failed" ? "×" : "·"} {check.purpose === "preparation" ? "Setup" : "Check"} · {label(check.status)}</span> {check.check ? displayLocalRunCommand(check.check) : "Verification"}</summary>
    <p>{check.detail}</p>{check.stdout && <pre>{check.stdout}</pre>}{check.stderr && <pre>{check.stderr}</pre>}
  </details>)}</div>;
}

type RunRecord = { runs: number; verified_runs: number; streak: number; best_streak: number; local_tokens: number };

/** Where a receipt sits on the ADE loop. */
function receiptTrack(receipt: LocalReceipt | null, busy: boolean, applied: boolean): Track {
  if (!receipt) return { kind: "active", stage: busy ? 1 : 0 };
  const s = receipt.state;
  if (s === "baseline") return { kind: "active", stage: 1 };
  if (s.startsWith("generating") || s.startsWith("hypothesizing") || s === "awaiting_existing_edit") return { kind: "active", stage: 2 };
  if (s.startsWith("verifying") || s === "finalizing") return { kind: "active", stage: 3 };
  if (s === "review_ready") return applied ? { kind: "complete" } : { kind: "active", stage: 4 };
  if (s === "review_unverified") return { kind: "failed", stage: 3 };
  return { kind: "failed", stage: receipt.candidates.length ? 3 : 2 };
}

/** What the evidence supports, for the receipt stamp. */
function receiptVerdict(receipt: LocalReceipt): Verdict {
  if (receipt.state === "review_ready") return "verified";
  if (receipt.state === "review_unverified") return receipt.candidates.some(c => c.checks.some(k => k.status === "passed")) ? "partial" : "unverified";
  return "failed";
}

/** Unified diff with signal colours per line. */
function Diff({ diff, label }: { diff: string; label: string }) {
  return <pre className="lw-diff" aria-label={label}>{diff.split("\n").map((line, i) => <span key={i} data-kind={line.startsWith("+++") || line.startsWith("---") ? "file" : line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : line.startsWith("@@") ? "hunk" : undefined}>{line}{"\n"}</span>)}</pre>;
}

function RunEnvironment({ receipt }: { receipt: LocalReceipt }) {
  const { profile, hardware, resident_reuse: resident } = receipt;
  return <details className="lw-environment"><summary>Model identity & admission machine</summary>
    <p>Model <code>{profile.model}</code> · digest <code>{profile.digest || "not recorded"}</code></p>
    <p>Runtime {profile.runtime_version || "not recorded"} · endpoint <code>{profile.endpoint || "not recorded"}</code></p>
    <p>Measured profile: {profile.context_tokens.toLocaleString()} context tokens · {profile.output_tokens.toLocaleString()} output-token ceiling · {profile.protocol ? label(profile.protocol) : "no edit protocol"}</p>
    <p>CPU {hardware?.cpu || "not recorded"} · {hardware?.logical_cpus || "unknown"} logical threads · RAM {memorySize(hardware?.ram_available_bytes)} available / {memorySize(hardware?.ram_total_bytes)} total</p>
    {hardware?.gpus?.length ? hardware.gpus.map((gpu, index) => <p key={`${gpu.name}-${index}`}>GPU {gpu.name} · VRAM {memorySize(gpu.available_bytes)} available / {memorySize(gpu.total_bytes)} total</p>) : <p>GPU memory reading not recorded.</p>}
    {resident && <p>Resident model observed at admission: {resident.name} · {memorySize(resident.size_vram_bytes)} allocated VRAM · {resident.context_length.toLocaleString()} context tokens</p>}
    {hardware?.warnings?.map((warning, index) => <p key={index}>Hardware reading: {warning}</p>)}
    <p>These are point-in-time admission readings, not live telemetry or a resource reservation.</p>
  </details>;
}

export function LocalWorkbench({ onSettings }: { onSettings: () => void }) {
  const { state: engine, refresh } = useSidecar({ requireLocalHarness: true });
  const [modelsOpen, setModelsOpen] = useState(false);
  const [machine, setMachine] = useState<ModelStatus | null>(null);
  const [machineRefresh, setMachineRefresh] = useState(0);
  const machineReadEpoch = useRef(0);
  const [repository, setRepository] = useState(getActiveProject() ?? "");
  const [repositoryEntry, setRepositoryEntry] = useState(false);
  const [repositoryDraft, setRepositoryDraft] = useState(repository);
  const [goal, setGoal] = useState("");
  const [files, setFiles] = useState("");
  const [newFile, setNewFile] = useState("");
  const [editableExisting, setEditableExisting] = useState("");
  const [checkText, setCheckText] = useState("");
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [hostApproved, setHostApproved] = useState(false);
  const [unverifiedRuntimeApproved, setUnverifiedRuntimeApproved] = useState(false);
  const [plan, setPlan] = useState<LocalPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const planVersion = useRef(0);
  const invalidatePlan = () => { planVersion.current += 1; setPlan(null); setPlanning(false); setHostApproved(false); setUnverifiedRuntimeApproved(false); };
  const openModels = () => { invalidatePlan(); setModelsOpen(true); };
  const [receipt, setReceipt] = useState<LocalReceipt | null>(null);
  const [attempt, setAttempt] = useState<LocalRunAttempt | null>(null);
  const [runId, setRunId] = useState(localStorage.getItem(RUN_KEY) ?? "");
  const mainView = useRef<HTMLElement>(null);
  const layoutView = useRef<HTMLDivElement>(null);
  // Reset only for a different run or a new goal, never for receipt polling.
  useEffect(() => {
    mainView.current?.scrollTo({ top: 0 });
    layoutView.current?.scrollTo({ top: 0 });
  }, [runId]);
  const pendingStart = useRef<ReturnType<typeof createPendingLocalStart> | null>(null);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [checkingReadiness, setCheckingReadiness] = useState(false);
  const runPreflight = useRef(false);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [endedWithoutReceipt, setEndedWithoutReceipt] = useState(false);
  const [applyStatus, setApplyStatus] = useState<LocalApplyReceipt | null>(null);
  const [repositoryCheck, setRepositoryCheck] = useState<{ runId: string; activeRepository: string; engine: typeof engine; matches: boolean | null; error: string | null } | null>(null);
  const [repositoryCheckAttempt, setRepositoryCheckAttempt] = useState(0);
  const [applying, setApplying] = useState(false);
  const [mutationRecovery, setMutationRecovery] = useState<{ action: "apply" | "rollback"; retryReady: boolean } | null>(null);
  const [savedRunId, setSavedRunId] = useState("");
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [recentRuns, setRecentRuns] = useState<LocalRunList | null>(null);
  const [recentRunsError, setRecentRunsError] = useState<string | null>(null);
  const [recentRunsRefresh, setRecentRunsRefresh] = useState(0);
  const [showAllRuns, setShowAllRuns] = useState(false);
  const [record, setRecord] = useState<RunRecord | null>(null);
  const connected = engine.status === "ready";
  useEffect(() => {
    if (!connected) return;
    let live = true;
    void rpc<RunRecord>("record.read").then(value => { if (live) setRecord(value); }).catch(() => { if (live) setRecord(null); });
    return () => { live = false; };
  }, [connected, receipt?.id, receipt?.state, running]);
  const matchingActiveModels = machine?.models.filter(({ model }) => sameInstalledModel(model.name, machine.active_model)) ?? [];
  const activeModel = matchingActiveModels.length === 1 ? matchingActiveModels[0] : undefined;
  const selectedModelReady = Boolean(connected && machine?.runtime_version && machine?.active_model && !machine.runtime_error && activeModel?.profile?.protocol);
  const planModelCurrent = localRunPlanModelCurrent(machine, plan?.model_selection ?? null);
  const runtimeGate = localRunRuntimeGate(machine);
  const runtimePresentation = localRunRuntimePresentation(engine.status, machine);
  const creationStatus = activeModel?.creation_status ?? "not_run";
  const busy = running || starting;
  const restoring = !!runId && !receipt && !busy;
  const reportError = (e: unknown) => {
    setConnectionError(localEngineErrorMessage(e) !== (e instanceof Error ? e.message : String(e)));
    setError(localEngineErrorMessage(e));
  };
  useEffect(() => {
    if (!connected || modelsOpen || running) { setMachine(null); return; }
    let live = true;
    let inFlight = false;
    let retryAfterFlight = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let staleTimer: ReturnType<typeof setTimeout> | undefined;
    let lastStatusError: string | null = null;
    setMachine(null);
    const read = async () => {
      if (!live || inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      const request = ++machineReadEpoch.current;
      try {
        const value = await modelStatus();
        if (live && request === machineReadEpoch.current) {
          setMachine(value);
          clearTimeout(staleTimer);
          staleTimer = setTimeout(() => { if (live) setMachine(null); }, MODEL_STATUS_STALE_MS);
          if (lastStatusError) {
            const prior = lastStatusError;
            setError(current => current === prior ? null : current);
            setConnectionError(false);
            lastStatusError = null;
          } else if (connectionError) { setError(null); setConnectionError(false); }
        }
      } catch (e) {
        if (live && request === machineReadEpoch.current) { clearTimeout(staleTimer); setMachine(null); lastStatusError = localEngineErrorMessage(e); reportError(e); }
      } finally {
        inFlight = false;
        if (live && retryAfterFlight) { retryAfterFlight = false; void read(); }
        else if (live) refreshTimer = setTimeout(() => void read(), MODEL_STATUS_REFRESH_MS);
      }
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(refreshTimer);
      setMachine(null);
      if (inFlight) { retryAfterFlight = true; machineReadEpoch.current++; }
      else void read();
    };
    if (!running) void read();
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      clearTimeout(refreshTimer);
      clearTimeout(staleTimer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [connected, modelsOpen, running, machineRefresh]);
  useEffect(() => {
    if (!connected || runId) return;
    let live = true;
    setRecentRunsError(null);
    void localRunList()
      .then(value => { if (live) setRecentRuns(value); })
      .catch(e => { if (live) { setRecentRuns(null); setRecentRunsError(localEngineErrorMessage(e)); } });
    return () => { live = false; };
  }, [connected, runId, recentRunsRefresh]);
  useEffect(() => {
    if (!connected || !runId) return;
    setRestoreError(null);
    let live = true; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const status = await localRunStatus();
        if (!live) return;
        if (status.id === runId) {
          setRunning(status.running); if (!status.running) setCancelRequested(false); setReceipt(status.receipt); if (status.error && status.receipt) setError(status.error);
          if (status.receipt) { setAttempt(null); setRestoreError(null); setEndedWithoutReceipt(false); }
          else if (!status.running) {
            try {
              const saved = await localRunRead(runId);
              if (!live) return;
              if ("request" in saved) { setReceipt(saved); setAttempt(null); setRestoreError(null); setEndedWithoutReceipt(false); }
              else { setAttempt(saved); setRestoreError(saved.error ?? status.error ?? "The goal ended before a receipt was saved."); setEndedWithoutReceipt(true); }
            } catch (e) { if (live) { setAttempt(null); setRestoreError(e instanceof Error ? e.message : String(e)); setEndedWithoutReceipt(false); } }
          }
          if (status.running) timer = setTimeout(() => void poll(), 1000);
        } else {
          try {
            const saved = await localRunRead(runId);
            if (live) {
              setRunning(false); setCancelRequested(false);
              if ("request" in saved) { setReceipt(saved); setAttempt(null); setRestoreError(null); setEndedWithoutReceipt(false); }
              else { setReceipt(null); setAttempt(saved); setRestoreError(saved.error ?? "The engine stopped before saving a receipt."); setEndedWithoutReceipt(true); }
            }
          }
          catch (e) { if (live) { setRestoreError(e instanceof Error ? e.message : String(e)); setEndedWithoutReceipt(false); } }
        }
      } catch (e) { if (live) { reportError(e); setRestoreError(e instanceof Error ? e.message : String(e)); timer = setTimeout(() => void poll(), 3000); } }
    };
    void poll(); return () => { live = false; clearTimeout(timer); };
  }, [connected, runId, restoreAttempt]);
  useEffect(() => {
    if (!connected || !receipt?.id || !receipt.selected_candidate) return;
    let live = true;
    void localRunApplyStatus(receipt.id).then(saved => { if (live) setApplyStatus(saved); }).catch(e => { if (live) reportError(e); });
    return () => { live = false; };
  }, [connected, receipt?.id, receipt?.selected_candidate]);
  useEffect(() => {
    setRepositoryCheck(null);
    if (!connected || !receipt?.id || !repository.trim()) return;
    let live = true;
    void localRunRepositoryMatch(receipt.id, repository)
      .then(result => { if (live) setRepositoryCheck({ runId: receipt.id, activeRepository: repository, engine, matches: result.matches, error: null }); })
      .catch(e => { if (live) setRepositoryCheck({ runId: receipt.id, activeRepository: repository, engine, matches: null, error: localEngineErrorMessage(e) }); });
    return () => { live = false; };
  }, [engine, receipt?.id, repository, repositoryCheckAttempt]);
  const chooseRepository = async () => {
    try {
      setError(null);
      if (!isTauri()) { setRepositoryDraft(repository); setRepositoryEntry(true); return; }
      const path = await open({ directory: true, multiple: false, title: "Open repository" });
      if (typeof path === "string" && path.trim()) selectRepository(path);
    } catch (e) { reportError(e); }
  };
  useEffect(() => subscribeActiveProject(() => {
    const next = getActiveProject() ?? "";
    setRepository(next); setRepositoryDraft(next); invalidatePlan();
    setFiles(""); setNewFile(""); setEditableExisting(""); setCheckText("");
    setMachineRefresh(value => value + 1);
  }), []);
  const selectRepository = async (path: string) => {
    const next = path.trim();
    if (!next || busy || applying || checkingReadiness) return;
    if (next === repository) { setRepositoryEntry(false); return; }
    try {
      if (isTauri()) {
        const reason = await projectSwitchBlockReason({ modelPageOpen: modelsOpen, sessions: [] }, modelOperation, goalActive, localRunStatus, sidecarProcessAlive);
        if (reason) { setError(reason); return; }
      }
      setActiveProject(next); setRepositoryEntry(false);
    } catch (e) { reportError(e); }
  };
  const scope = files.split(/[\n,]/).map(s => s.trim().replaceAll("\\", "/")).filter(Boolean);
  const existingEdits = editableExisting.split(/[\n,]/).map(s => s.trim().replaceAll("\\", "/")).filter(Boolean);
  const review = async () => {
    const version = ++planVersion.current;
    setPlanning(true); setError(null);
    try {
      const creating = newFile.trim().replaceAll("\\", "/") || null;
      const result = await previewLocalRun({ goal, repository, files: creating ? [...new Set([...scope, ...existingEdits])] : scope, new_file: creating, editable_existing: creating ? existingEdits : [], checks: parseLocalRunChecks(checkText), approve_host_execution: false });
      if (version !== planVersion.current) return;
      // The reviewed plan shows inferred files and checks. Keep blank draft
      // fields blank so a changed goal can infer fresh choices next time.
      setPlan(result); setVerificationOpen(true); setNewFile(result.request.new_file ?? ""); setEditableExisting((result.request.editable_existing ?? []).join(", ")); setHostApproved(false); setUnverifiedRuntimeApproved(false);
    } catch (e) { if (version === planVersion.current) reportError(e); } finally { if (version === planVersion.current) setPlanning(false); }
  };
  const start = async () => {
    if (!plan || runPreflight.current) return;
    if (!plan.model_selection) { setError("Select and calibrate a local model, then review the plan again."); return; }
    const version = planVersion.current;
    runPreflight.current = true;
    setCheckingReadiness(true); setError(null);
    const statusRequest = ++machineReadEpoch.current;
    try {
      const current = await modelStatus();
      // Background refreshes may finish after this explicit preflight. They
      // must not cancel a Run click; the engine checks the model again at admission.
      if (statusRequest === machineReadEpoch.current) setMachine(current);
      if (version !== planVersion.current) return;
      if (!localRunPlanModelCurrent(current, plan.model_selection)) {
        setError("The local runtime or calibrated model changed since this plan was reviewed. Restore it or review the plan again.");
        return;
      }
      if (localRunRuntimeGate(current).requiresConsent && !unverifiedRuntimeApproved) {
        setError("Approve this unverified loopback runtime before sending repository context.");
        return;
      }
    } catch (e) { if (statusRequest === machineReadEpoch.current) setMachine(null); reportError(e); return; }
    finally { runPreflight.current = false; setCheckingReadiness(false); }
    const requestedId = crypto.randomUUID();
    const pending = createPendingLocalStart(requestedId);
    pendingStart.current = pending;
    setReceipt(null); setAttempt(null); setEndedWithoutReceipt(false); setApplyStatus(null); setMutationRecovery(null);
    localStorage.setItem(RUN_KEY, requestedId);
    setStarting(true); setCancelRequested(false); setError(null);
    try {
      const result = await startLocalRun({ ...plan.request, approve_host_execution: hostApproved, allow_unverified_runtime: unverifiedRuntimeApproved }, requestedId, plan.model_selection);
      const cancellation = pending.admit(result, cancelLocalRun);
      setRunId(requestedId); setRunning(true); setPlan(null);
      if (cancellation) {
        try {
          const cancelled = await cancellation;
          if (!cancelled.cancel_requested) setCancelRequested(false);
        } catch (e) { setCancelRequested(false); reportError(e); }
      }
    } catch (e) {
      if (pending.cancelRequested) {
        // The start reply may have failed after admission. The exact new ID is
        // safe to try; recovery retains it if the engine cannot be reached.
        try { await cancelLocalRun(requestedId); } catch { /* Keep the start failure and recoverable ID visible. */ }
      }
      setCancelRequested(false);
      reportError(e);
      if (e instanceof RpcRemoteError) {
        try {
          if (!await localRunHasEvidence(requestedId)) {
            localStorage.removeItem(RUN_KEY);
            setRunId("");
            return;
          }
        } catch { /* Evidence lookup is uncertain; retain the recoverable run ID. */ }
      }
      setRunId(requestedId);
    } finally { if (pendingStart.current === pending) pendingStart.current = null; setStarting(false); }
  };
  const cancel = async () => {
    if (cancelRequested) return;
    setCancelRequested(true);
    const pending = pendingStart.current;
    if (pending) { pending.requestCancel(); return; }
    if (!runId) { setCancelRequested(false); return; }
    try {
      const result = await cancelLocalRun(runId);
      if (!result.cancel_requested) setCancelRequested(false);
    } catch (e) { setCancelRequested(false); reportError(e); }
  };
  const selected = receipt?.candidates.find(candidate => candidate.number === receipt.selected_candidate);
  const usage = receipt ? summarizeLocalRunUsage(receipt) : null;
  const currentRepositoryCheck = repositoryCheck && receipt && repositoryCheck.engine === engine && repositoryCheck.runId === receipt.id && repositoryCheck.activeRepository === repository ? repositoryCheck : null;
  const repositorySelection = localRunRepositorySelection(receipt, repository, currentRepositoryCheck?.matches ?? null, currentRepositoryCheck?.error ?? null);
  const applyEligibility = repositorySelection.allowed ? localApplyEligibility(receipt, selected) : repositorySelection;
  const rollbackEligibility = repositorySelection.allowed ? localRollbackEligibility(receipt, selected, applyStatus) : repositorySelection;
  const creatingFile = Boolean(receipt?.request.new_file);
  const mixingEdits = creatingFile && Boolean(receipt?.request.editable_existing?.length);
  const changedFileCount = selected?.diff.split("\n").filter(line => line.startsWith("--- ")).length ?? 0;
  const mutationBlocked = (action: "apply" | "rollback") => !!mutationRecovery && (mutationRecovery.action !== action || !mutationRecovery.retryReady);
  const reconcileMutationError = async (action: "apply" | "rollback", e: unknown) => {
    if (!receipt || !selected) return;
    if (e instanceof RpcRemoteError) {
      let saved: LocalApplyReceipt | null = null;
      try { saved = await localRunApplyStatus(receipt.id); setApplyStatus(saved); } catch { /* Preserve the engine's explicit error. */ }
      if (mutationRecovery?.action === action) {
        if (localMutationNeedsRecheck(mutationRecovery, action, receipt.id, selected.number, saved)) {
          setMutationRecovery({ action, retryReady: false });
          setError(`Guarded ${action} did not complete: ${localEngineErrorMessage(e)} Recheck the saved journal before another retry.`);
          setConnectionError(false);
        } else { setMutationRecovery(null); setError(null); setConnectionError(false); }
      } else reportError(e);
      return;
    }
    const actionLabel = action === "apply" ? "Apply" : "Rollback";
    try {
      const saved = await localRunApplyStatus(receipt.id);
      setApplyStatus(saved);
      if (localMutationConfirmed(action, receipt.id, selected.number, saved)) {
        setMutationRecovery(null); setError(null); setConnectionError(false);
        return;
      }
      setConnectionError(false);
    } catch { setConnectionError(true); }
    setMutationRecovery({ action, retryReady: false });
    setError(`${actionLabel} returned without a confirmed result: ${localEngineErrorMessage(e)} The saved journal may still change. Recheck it before a guarded retry.`);
  };
  const recheckMutation = async () => {
    if (!receipt || !selected || !mutationRecovery) return;
    try {
      const saved = await localRunApplyStatus(receipt.id);
      setApplyStatus(saved);
      if (localMutationConfirmed(mutationRecovery.action, receipt.id, selected.number, saved)) {
        setMutationRecovery(null); setError(null); setConnectionError(false);
      } else {
        setMutationRecovery({ ...mutationRecovery, retryReady: true });
        setError(`The saved Apply journal ${saved ? `reports ${label(saved.state)}` : "has no entry"}; the ${mutationRecovery.action} result is not confirmed. A guarded retry checks the current files and exclusive engine lease before changing them.`);
        setConnectionError(false);
      }
    } catch (e) { reportError(e); }
  };
  const applySelected = async () => {
    if (!receipt || !selected?.content_sha256 || !applyEligibility.allowed || mutationBlocked("apply")) return;
    setApplying(true); setError(null);
    try { setApplyStatus(await applyLocalRun(receipt.id, selected.number, selected.content_sha256, repository)); setMutationRecovery(null); }
    catch (e) { await reconcileMutationError("apply", e); }
    finally { setApplying(false); }
  };
  const rollbackSelected = async () => {
    if (!receipt || !selected?.content_sha256 || !rollbackEligibility.allowed || mutationBlocked("rollback")) return;
    setApplying(true); setError(null);
    try { setApplyStatus(await rollbackLocalRun(receipt.id, selected.number, selected.content_sha256, repository)); setMutationRecovery(null); }
    catch (e) { await reconcileMutationError("rollback", e); }
    finally { setApplying(false); }
  };
  const openSavedRunId = (requestedId: string) => {
    const id = requestedId.trim().toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
      setError("Enter the run ID shown in its receipt.");
      return;
    }
    setError(null); setRestoreError(null); setReceipt(null); setAttempt(null); setApplyStatus(null); setMutationRecovery(null);
    localStorage.setItem(RUN_KEY, id); setRunId(id);
  };
  const openSavedRun = () => openSavedRunId(savedRunId);
  if (modelsOpen) return <div className="local-workbench"><LocalModelsPage connected={connected} connectionIssue={engine.status === "offline" || engine.status === "upgrade_required" ? engine.error : undefined} onBack={() => setModelsOpen(false)} onReconnect={refresh} /></div>;
  const gpu = machine?.hardware.gpus?.[0];
  const settled = !!receipt && !busy;
  const verdict = receipt ? receiptVerdict(receipt) : "unverified";
  const changes = (selected?.diff ?? "").split("\n").reduce((sum, line) => ({ add: sum.add + (line.startsWith("+") && !line.startsWith("+++") ? 1 : 0), del: sum.del + (line.startsWith("-") && !line.startsWith("---") ? 1 : 0) }), { add: 0, del: 0 });
  const selectedChecks = selected?.checks.filter(check => check.purpose !== "preparation") ?? [];
  return <div className="local-workbench">
    <header className="lw-header"><span className="lw-wordmark"><b aria-hidden="true">φ</b>phonton</span>
      <span className="lw-engine">{connected ? `engine ${engine.version}` : label(engine.status)}</span>
      {record && <span className="lw-record" title={`${record.verified_runs} of ${record.runs} finished runs verified · best streak ${record.best_streak}`}><b>{record.verified_runs.toLocaleString()}</b> verified · streak <b data-hot={record.streak > 0 || undefined}>{record.streak}</b></span>}
      <span className="lw-header-note">Your code stays under your control.</span>
    </header>
    <div className="lw-layout" ref={layoutView}>
      <aside className="lw-sidebar" aria-label="Workspace navigation">
        <div className="lw-sidebar-project"><span className="lw-eyebrow">WORKSPACE</span><strong title={repository}>{repositoryName(repository) || "No repository open"}</strong><button disabled={busy || restoring || applying} onClick={() => void chooseRepository()}>Change folder ↗</button></div>
        <nav aria-label="Workspace"><span className="lw-nav-current" aria-current="page"><span aria-hidden="true">▱</span> Workbench</span><button aria-label="Local models" onClick={openModels}><span aria-hidden="true">◈</span> Local models</button><button aria-label="Settings" onClick={onSettings}><span aria-hidden="true">⚙</span> Settings</button></nav>
        {!receipt && !busy && !restoring && <div className="lw-sidebar-history">        <section className="lw-recent" aria-label="Recent saved runs">
          <div className="lw-recent-heading"><h2>Recent runs</h2><button disabled={!connected} onClick={() => setRecentRunsRefresh(value => value + 1)}>Refresh</button></div>
          {recentRuns?.runs.length ? <ul id="recent-runs">{(showAllRuns ? recentRuns.runs : recentRuns.runs.slice(0, 3)).map(run => <li key={run.id}><button disabled={!connected} onClick={() => openSavedRunId(run.id)} title={run.goal}><span className="lw-recent-goal">{run.goal}</span><span className="lw-recent-meta">{run.model} · {run.recorded_at_unix_ms ? new Date(run.recorded_at_unix_ms).toLocaleString() : run.id.slice(0, 8)} · Open →</span></button></li>)}</ul> : <p>{recentRunsError ? `Saved runs unavailable: ${recentRunsError}` : recentRuns ? "No saved runs yet. Your first receipt will appear here." : connected ? "Loading saved runs…" : "Connect the engine to show saved runs."}</p>}
          {recentRuns && recentRuns.runs.length > 3 && <button className="lw-show-runs" aria-expanded={showAllRuns} aria-controls="recent-runs" onClick={() => setShowAllRuns(value => !value)}>{showAllRuns ? "Show fewer runs ↑" : `Show ${recentRuns.runs.length - 3} more runs ↓`}</button>}
          {showAllRuns && recentRuns?.limited && <p>Showing the latest saved runs. Open older evidence by run ID below.</p>}
        </section>
        <details className="lw-saved"><summary>Open by run ID</summary><label htmlFor="saved-run-id">Run ID from a previous receipt</label><div><input id="saved-run-id" value={savedRunId} onChange={e => setSavedRunId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" /><button disabled={!connected || !savedRunId.trim()} onClick={openSavedRun}>Open evidence →</button></div></details></div>}
        <div className="lw-sidebar-machine">        <details className="lw-machine-details"><summary>This machine <span>{selectedModelReady ? machine?.active_model : "Choose a local model"}{gpu ? ` · ${memorySize(gpu.available_bytes)} VRAM free` : ""}</span></summary>
        <dl className="lw-machine" aria-label="This machine">
          <div><dt>model</dt><dd>{selectedModelReady ? <>{machine?.active_model}{activeModel?.profile && <span> · {activeModel.profile.context_tokens.toLocaleString()} ctx · {activeModel.profile.protocol ? label(activeModel.profile.protocol) : "no edit format"}</span>}</> : <button onClick={openModels}>choose a local model →</button>}</dd></div>
          {gpu && <div><dt>vram</dt><dd><Gauge frac={gpu.total_bytes ? 1 - gpu.available_bytes / gpu.total_bytes : 0} /> {memorySize(gpu.available_bytes)} free of {memorySize(gpu.total_bytes)}</dd></div>}
          {machine && <div><dt>ram</dt><dd><Gauge frac={machine.hardware.ram_total_bytes ? 1 - (machine.hardware.ram_available_bytes ?? 0) / machine.hardware.ram_total_bytes : 0} /> {memorySize(machine.hardware.ram_available_bytes)} free of {memorySize(machine.hardware.ram_total_bytes)}</dd></div>}
          <div><dt>inference</dt><dd>{runtimeGate.blocked ? "Runtime needs recovery" : machine?.model_store?.status === "verified_managed" ? "Managed local model · no API charges" : runtimeGate.requiresConsent ? "External loopback runtime · API cost not established" : "Checking runtime"}</dd></div>
        </dl>
        </details></div>
      </aside>
    <main className={`lw-main ${receipt || busy || restoring ? "has-run" : ""}`} ref={mainView} tabIndex={0} aria-label="Workbench">
      {!receipt && !busy && !restoring && <div className="lw-intro">
        <div className="lw-intro-heading"><div><p className="lw-eyebrow">NEW GOAL</p>
        <h1>{repositoryName(repository) ? <>What’s next for <span className="lw-repo-name">{repositoryName(repository)}</span>?</> : "What would you like to build?"}</h1>
        <p className="lw-intro-copy">Start with a goal. Review the plan. Keep the final say.</p></div></div>


      </div>}
      {(receipt || busy || restoring) && <section className="lw-run" aria-label="Local goal progress">
        <div className="lw-run-heading"><span>{busy ? <Spinner /> : restoring && restoreError ? "×" : receipt?.selected_candidate ? "◇" : "·"} {receipt ? label(receipt.state) : restoring ? restoreError ? endedWithoutReceipt ? "Goal stopped" : "Recovery needs attention" : "Restoring saved goal" : "Preparing local goal"}</span>
          {busy ? <button disabled={cancelRequested} onClick={() => void cancel()}>{cancelRequested ? "Cancel requested…" : "Cancel run"}</button> : <button disabled={restoring && !restoreError || applying} onClick={() => { setReceipt(null); setAttempt(null); setApplyStatus(null); setMutationRecovery(null); setRunId(""); setCancelRequested(false); setGoal(""); setFiles(""); setNewFile(""); setEditableExisting(""); setCheckText(""); setVerificationOpen(false); setHostApproved(false); setError(null); setRestoreError(null); setEndedWithoutReceipt(false); setMachine(null); setMachineRefresh(value => value + 1); invalidatePlan(); localStorage.removeItem(RUN_KEY); }}>New goal</button>}</div>
        {starting && cancelRequested && <p role="status">Cancellation will be sent when the local engine accepts this run.</p>}
        <h1>{receipt?.request.goal ?? attempt?.goal ?? (restoring ? restoreError ? endedWithoutReceipt ? "Goal stopped before a receipt" : "Saved goal unavailable" : "Loading local evidence…" : goal)}</h1>
        {!restoring && <LoopTrack track={receiptTrack(receipt, busy, applyStatus?.state === "applied")} />}
        {receipt && <><p className="lw-run-repository">Run repository: <code>{receipt.request.repository.replace(/^\\\\\?\\/, "")}</code></p>{!repositorySelection.allowed && <p className="lw-run-repository" role="status">Current repository: <code>{repository || "none selected"}</code>. {repositorySelection.reason} {(!repository.trim() || currentRepositoryCheck?.matches === false || currentRepositoryCheck?.error) && <button onClick={() => selectRepository(receipt.request.repository)}>Switch to run repository →</button>}{currentRepositoryCheck?.error && <button onClick={() => setRepositoryCheckAttempt(value => value + 1)}>Retry repository check →</button>}</p>}</>}
        {restoring && restoreError && <><p>{endedWithoutReceipt ? attempt?.state === "ended_before_receipt" ? "The goal failed before its first receipt. No project check or model generation is recorded. Review the error and start a new goal." : "The engine stopped before its first receipt. No project check or model generation is recorded for this attempt. Review the error and start a new goal." : "Retry loading the saved receipt, or start a new goal."}</p>{!endedWithoutReceipt && <button disabled={!connected} onClick={() => { setError(null); setRestoreAttempt(value => value + 1); }}>Retry loading</button>}<details><summary>Recovery details</summary><p>Run {runId}{attempt ? ` · ${attempt.model}` : ""}</p><pre>{restoreError}</pre></details></>}
        {receipt && <>
          {settled && <Receipt verdict={verdict} stampKey={`${receipt.id}-${receipt.state}`} headline={selected ? `Candidate ${selected.number} · ${selected.approach}` : `${receipt.candidates.length} ${receipt.candidates.length === 1 ? "candidate" : "candidates"} tried; none passed the checks`} rows={[
            ["files", selected ? <>{changedFileCount} <span className="lw-add">+{changes.add}</span> <span className="lw-del">−{changes.del}</span></> : "nothing to apply"],
            ["checks", selected ? `${selectedChecks.filter(check => check.status === "passed").length}/${selectedChecks.length} passed` : "no candidate passed"],
            ["tokens in", usage ? tokenReading(usage.inputTokens, usage.inputReported, usage.attempts, usage.attemptsComplete) : "not reported"],
            ["tokens out", usage ? tokenReading(usage.outputTokens, usage.outputReported, usage.attempts, usage.attemptsComplete) : "not reported"],
            ["time", `${(receipt.elapsed_ms / 1000).toFixed(1)} s`],
            ["model", `${receipt.profile.model} · ${receipt.runtime_origin === "managed_verified" ? "this machine" : "external runtime"}`],
            ["API cost", receipt.runtime_origin === "managed_verified" ? "$0.00" : "not established"],
            ...(record ? [["current streak", `${record.streak} verified in a row`] as [string, string]] : []),
          ]} />}
          {receipt.candidates.map(candidate => {
            const chosen = receipt.selected_candidate === candidate.number;
            return <article className="lw-candidate" key={candidate.number} data-chosen={chosen || undefined}>
              <div className="lw-candidate-heading"><span><b data-tone={chosen ? "ok" : candidate.rejection ? "bad" : undefined}>{chosen ? "✓" : candidate.rejection ? "✗" : "├"}</b> candidate {candidate.number} · {candidate.approach}</span><span>{(candidate.elapsed_ms / 1000).toFixed(1)} s · {candidate.output_tokens ?? "?"} tok out</span></div>
              {candidate.stage === "creation_pending_edit" && <p>Staged new file. The existing edit and combined checks have not run; this candidate cannot be applied.</p>}
              {candidate.rejection && <p className="lw-error">{candidate.rejection}</p>}
              {candidate.decision && <p className="lw-decision">{candidate.decision.parent_candidate ? `From candidate ${candidate.decision.parent_candidate}. ` : ""}{candidate.decision.action === "initial" ? "Started from captured source." : candidate.decision.reason}</p>}
              {candidate.diff && (chosen || !receipt.selected_candidate ? <Diff diff={candidate.diff} label={`Candidate ${candidate.number} diff`} /> : <details><summary>Diff</summary><Diff diff={candidate.diff} label={`Candidate ${candidate.number} diff`} /></details>)}
              <Checks checks={candidate.checks} />
              {candidate.context && <details><summary>Source seen by the model · {candidate.context.excerpts.length} {candidate.context.excerpts.length === 1 ? "excerpt" : "excerpts"}</summary>
                <p>{candidate.context.selected_source_bytes.toLocaleString()} of {candidate.context.source_bytes_scanned.toLocaleString()} source bytes selected · {candidate.context.elapsed_ms}ms retrieval</p>
                {candidate.context.omitted_source && <p>Other source was omitted from this prompt. It remains in the captured candidate.</p>}
                {candidate.context.excerpts.map((excerpt, index) => <div key={index}><p>{excerpt.path}:{excerpt.start_line}–{excerpt.end_line} · {excerpt.reason}</p><pre>{excerpt.text}</pre></div>)}
                {candidate.context.feedback_omitted && <p>Prior feedback was shortened to leave room for source. Complete outputs remain in candidate evidence.</p>}
                {candidate.context.feedback && <details><summary>Check and rejected-edit feedback sent to the model</summary><pre>{candidate.context.feedback}</pre></details>}
                <p>Admission: {candidate.context.prompt_bytes.toLocaleString()} prompt bytes + {candidate.context.constraint_bytes.toLocaleString()} constraint bytes + {candidate.context.output_tokens_reserved} reserved output tokens + 256 framing allowance within {candidate.context.context_capacity.toLocaleString()} context. This conservative bound is separate from runtime token measurements.</p>
              </details>}
              <details><summary>Candidate evidence</summary><p>Saved at {candidate.directory}</p><p>SHA-256 {candidate.content_sha256 ?? "not available"}</p><p>Input tokens {candidate.input_tokens ?? "not reported"} · output tokens {candidate.output_tokens ?? "not reported"}</p><pre>{candidate.raw_output}</pre></details>
            </article>;
          })}
          {receipt.state === "review_ready" && selected && <section className="lw-apply" aria-label="Apply selected change">
            <h2>{applyStatus?.state === "rolled_back" ? mixingEdits ? "Created file removed and source restored" : creatingFile ? "Created file removed" : "Original files restored" : applyStatus?.state === "rollback_prepared" ? mixingEdits ? "Resume combined rollback" : creatingFile ? "Resume created-file rollback" : "Resume original-file restore" : applyStatus?.state === "applied" ? "✓ Applied" : "Apply selected change"}</h2>
            {mutationRecovery && <p role="status">The {mutationRecovery.action} reply was lost and its result is not confirmed. Check the saved journal before another file change. <button disabled={!connected || applying} onClick={() => void recheckMutation()}>Recheck saved journal →</button></p>}
            {applyStatus?.state === "rolled_back" ? <p>{applyStatus.detail}</p> : applyStatus?.state === "rollback_prepared" ? <p>{mixingEdits ? "The earlier rollback stopped before confirmation. Phonton checks the backups, source, file identity, retained witness, and Git index before restoring source and removing the created file. Unknown edits or an ambiguous deletion need manual recovery." : creatingFile ? "The earlier deletion stopped before confirmation. Phonton will recheck the created file’s identity, retained witness, existing source, and Git index. A replacement or unknown edit needs manual recovery." : "The earlier restore stopped before confirmation. Phonton will recheck every original-byte backup, current source, temporary, and Git index before continuing. Unknown edits need manual recovery."}</p> : applyStatus?.state === "applied" ? <p>{mixingEdits ? `Created ${applyStatus.created_file?.path ?? receipt.request.new_file} and updated ${applyStatus.files?.map(file => file.path).join(", ")}.` : creatingFile ? `Created ${applyStatus.created_file?.path ?? receipt.request.new_file}.` : `Applied ${(applyStatus.files?.map(file => file.path) ?? [applyStatus.path]).filter(Boolean).join(", ")}.`} The recorded Git index stayed unchanged; inspect the current files for any later edits.</p> : <>
              <p>{mixingEdits ? `This creates ${receipt.request.new_file} and replaces the reviewed existing edits as one changeset. Apply checks the candidate, original source, empty target, and Git index; interrupted work can be rolled forward from its journal.` : creatingFile ? `This creates only ${receipt.request.new_file}. Phonton refuses an occupied path and checks the saved candidate, existing source, and Git index before publishing.` : `This replaces ${changedFileCount} reviewed source ${changedFileCount === 1 ? "file" : "files"}. Original bytes stay in per-file run backups; Phonton does not stage or commit them.`}</p>
              <p className="lw-fine">Selected commands reported a pass on this exact candidate. Candidate code can terminate a test runner or forge its output; inspect the diff and captured logs before applying.</p>
              {applyStatus?.state === "prepared" && <p>{mixingEdits ? "An earlier combined apply stopped before confirmation. Retry checks the created file, every changed source, saved temporaries, backups, and Git index; unknown bytes require manual recovery." : creatingFile ? "An earlier creation stopped before confirmation. Retry checks the new file, saved temporary, existing source, and Git index; unknown bytes require manual recovery." : "Earlier application stopped before confirmation. Some files may already contain the candidate. Retry checks every source file and the Git index before continuing; unknown edits require manual recovery."}</p>}
              {!applyEligibility.allowed ? <p role="status">{applyEligibility.reason}</p> : changedFileCount > 0 ? <button className="lw-primary" disabled={applying || !connected || mutationBlocked("apply")} onClick={() => void applySelected()}>{applying ? "Checking source and Git index…" : mutationRecovery?.retryReady ? "Retry guarded Apply →" : applyStatus?.state === "prepared" ? "Resume guarded apply →" : "Apply selected changes →"}</button> : <p>No source changes are available to apply.</p>}
            </>}
            {applyStatus && applyStatus.state !== "rolled_back" && <>
              {rollbackEligibility.allowed ? <><p>{mixingEdits ? "Restore the reviewed existing edits from their original-byte backups, then remove the witnessed created file. Source, file identity, and Git staging must still match the saved evidence; unknown edits need manual review." : creatingFile ? "Remove the witnessed created file only while its identity, bytes, current source, and Git staging still match. A different-file replacement is refused; an ambiguous interrupted deletion needs manual review." : "Restore the original existing-file bytes from this run’s backups. Current source and Git staging must still match the saved states; observed later edits are refused."}</p><button disabled={applying || !connected || mutationBlocked("rollback")} onClick={() => void rollbackSelected()}>{applying ? creatingFile ? "Checking file identity…" : "Checking backups and source…" : mutationRecovery?.retryReady ? "Retry guarded Rollback →" : applyStatus.state === "rollback_prepared" ? "Resume guarded rollback →" : mixingEdits ? "Restore source and remove file →" : creatingFile ? "Remove created file →" : "Restore original files →"}</button></> : (applyStatus.state === "applied" || applyStatus.state === "rollback_prepared") && <p role="status">{rollbackEligibility.reason}</p>}
            </>}
          </section>}
          <details className="lw-evidence"><summary>Evidence · model, baseline, plan, integrity</summary>
            <p className="lw-telemetry">{receipt.profile.model} · digest {receipt.profile.digest?.slice(0, 12) || "unknown"} · {receipt.runtime_origin === "managed_verified" ? "Phonton-managed runtime" : receipt.runtime_origin === "external_unverified" ? "External runtime · inference location unverified" : "Runtime origin unknown"} · {(receipt.elapsed_ms / 1000).toFixed(1)}s · {receipt.candidates.length} {receipt.candidates.length === 1 ? "candidate" : "candidates"} · {receipt.model_calls_reserved != null ? receipt.model_calls_reserved : `≥${usage?.attempts ?? 0}`} model attempts reserved · {receipt.checks_used} check/setup slots reserved</p>
            {usage && <p className="lw-telemetry">Runtime-reported tokens: {tokenReading(usage.inputTokens, usage.inputReported, usage.attempts, usage.attemptsComplete)} input / {tokenReading(usage.outputTokens, usage.outputReported, usage.attempts, usage.attemptsComplete)} output · {usage.repairs} {usage.repairs === 1 ? "repair" : "repairs"} · {usage.restarts} baseline {usage.restarts === 1 ? "restart" : "restarts"}{(usage.inputReported < usage.attempts || usage.outputReported < usage.attempts || !usage.attemptsComplete) && ` · counters saved for ${usage.inputReported} input and ${usage.outputReported} output ${usage.attemptsComplete ? `of ${usage.attempts} attempts` : "replies; older attempt total unknown"}`}</p>}
            <RunEnvironment receipt={receipt} />
            <details><summary>Baseline verification</summary><Checks checks={receipt.baseline_checks} /></details>
            {!!receipt.hypotheses?.length && <details><summary>Baseline restart strategies · {receipt.hypotheses.length}</summary>{receipt.hypotheses.map(hypothesis => <div className="lw-candidate" key={hypothesis.candidate_number}>
              <p>Candidate {hypothesis.candidate_number} · {label(hypothesis.status)} · {hypothesis.path ?? "no scoped path"}</p>
              {hypothesis.mechanism && <p>Proposed mechanism: {hypothesis.mechanism}</p>}
              {hypothesis.difference && <p>Claimed difference: {hypothesis.difference}</p>}
              <p>{hypothesis.detail} · {hypothesis.output_tokens ?? "?"} output tokens</p>
              {hypothesis.context && <details><summary>Strategy source · {hypothesis.context.excerpts.length} excerpts</summary>{hypothesis.context.excerpts.map((excerpt, index) => <pre key={index}>{`${excerpt.path}:${excerpt.start_line}–${excerpt.end_line}\n${excerpt.text}`}</pre>)}</details>}
              <details><summary>Raw strategy reply</summary><pre>{hypothesis.raw_output || "No reply recorded"}</pre></details>
            </div>)}</details>}
            {receipt.git_index && <details><summary>Git staging integrity · {label(receipt.git_index.status)}</summary><p>{receipt.git_index.detail}</p><p>Observed at: {receipt.git_index.stage}</p><pre>{`Index: ${receipt.git_index.path}\nBefore: ${receipt.git_index.before_sha256 ?? "index absent"}\nAfter: ${receipt.git_index.after_sha256 ?? (receipt.git_index.status === "not_run" ? "not checked" : receipt.git_index.status === "unavailable" ? "not available" : "index absent")}`}</pre></details>}
            {receipt.contract && <details><summary>Accepted plan</summary>{receipt.contract.acceptance_criteria.map(criterion => <p key={criterion}>{criterion}</p>)}<p>Scope: {receipt.contract.likely_files.join(", ")}</p></details>}
            <div className="lw-gaps">{receipt.known_gaps.map(gap => <p key={gap}>{gap}</p>)}<p>Run {receipt.id}</p></div>
          </details>
        </>}
      </section>}
      {error && <div className="lw-error" role="alert"><p>{error}</p>{connectionError && <button onClick={() => { setError(null); void refresh(); }}>Reconnect engine</button>}</div>}
      {!connected && <div className="lw-offline" role="status"><div><strong>{engine.status === "offline" ? "Connect your local engine" : engine.status === "upgrade_required" ? "Your engine needs an update" : "Connecting to the local engine…"}</strong><p>Your draft stays here while you connect.</p>{(engine.status === "offline" || engine.status === "upgrade_required") && <details><summary>Connection details</summary><p>{engine.error}</p>{engine.status === "offline" && <code>phonton serve</code>}</details>}</div><button onClick={() => void refresh()}>Reconnect ↗</button></div>}
      {!receipt && !busy && !restoring && <section className="lw-compose" aria-label="New local goal">
        <div className="lw-context"><button onClick={() => void chooseRepository()}>{repository ? `⌑ ${repository.split(/[\\/]/).pop()}` : "⌑ Open repository"}</button><span data-tone={runtimePresentation.tone}>{runtimePresentation.label}</span><span className="lw-path" title={repository}>{repository}</span></div>
        {activeModel?.profile && activeModel.context_error && <p className="lw-creation-note" role="status">Current model metadata: {activeModel.context_error} A goal checks it again before sending repository context.</p>}
        {repositoryEntry && <form className="lw-repository" onSubmit={e => { e.preventDefault(); selectRepository(repositoryDraft); }}><label htmlFor="repository-path">Repository folder path</label><input id="repository-path" autoFocus value={repositoryDraft} onChange={e => setRepositoryDraft(e.target.value)} /><div><button type="submit" disabled={!repositoryDraft.trim()}>Open folder →</button><button type="button" onClick={() => setRepositoryEntry(false)}>Cancel</button></div></form>}
        <div className="lw-frame"><span className="lw-frame-label">goal</span>
          <label className="sr-only" htmlFor="local-goal">Coding goal</label><textarea id="local-goal" value={goal} onChange={e => { setGoal(e.target.value); invalidatePlan(); }} placeholder="Describe a change to your code…" rows={3} />
          <div className="lw-compose-footer"><span>{hostApproved ? "checks may run on this machine" : "review only until you approve checks"}</span><button onClick={openModels}>{selectedModelReady ? machine?.active_model : "Choose a local model"} ▾</button></div>
        </div>
        {runtimeGate.blocked && <p className="lw-creation-note" role="alert"><strong>Managed runtime needs recovery.</strong> {machine?.model_store?.reason ?? "Its process identity could not be verified."} <button onClick={openModels}>Open Local models →</button></p>}
        <details className="lw-scope-details"><summary>Scope · files, new file</summary>
        <div className="lw-scope">
          <label htmlFor="local-files">{newFile.trim() ? "Existing source context" : "Files to edit"} <span>{newFile.trim() ? "optional — blank searches read-only source" : "optional — leave blank to discover from the goal"}</span></label>
          <input id="local-files" value={files} onChange={e => { setFiles(e.target.value); invalidatePlan(); }} placeholder={newFile.trim() ? "Search matching source, or enter paths" : "Discover relevant source, or enter paths"} />
          <label htmlFor="local-new-file">New file to create <span>optional — exact repository-relative path</span></label>
          <input id="local-new-file" value={newFile} onChange={e => { setNewFile(e.target.value); if (!e.target.value.trim()) setEditableExisting(""); invalidatePlan(); }} placeholder="src/new-module.ts" />
          {newFile.trim() && <><label htmlFor="local-edit-existing">Existing files to edit too <span>optional — up to 3 reviewed paths</span></label><input id="local-edit-existing" value={editableExisting} onChange={e => { setEditableExisting(e.target.value); invalidatePlan(); }} placeholder="src/caller.ts" /></>}
          {newFile.trim() && selectedModelReady && creationStatus !== "passed" && <p className="lw-creation-note" role="status"><strong>Creation format {creationStatus === "not_run" ? "not measured" : creationStatus}.</strong> Recalibrate for a separate new-file probe. You can still run a checked goal and review its exact candidate.</p>}
        </div>
        </details>
        <details className="lw-verification" open={verificationOpen} onToggle={e => setVerificationOpen(e.currentTarget.open)}><summary>Checks & permissions</summary><label htmlFor="local-check">Verification commands <span>optional; one JSON array per line, up to four; blank proposes checks from repository files</span></label><textarea id="local-check" rows={3} value={checkText} onChange={e => { setCheckText(e.target.value); invalidatePlan(); }} placeholder={'["python", "-m", "pytest"]'} />
          <p>Version and build commands are diagnostic. Choose a test that exercises the candidate; review direct scripts before trusting their result.</p>
          <label className="lw-approval"><input type="checkbox" checked={hostApproved} disabled={checkingReadiness} onChange={e => setHostApproved(e.target.checked)} />Allow the listed setup and check commands to run project code on my machine. Filesystem and network isolation are unavailable.</label>
          <p>Without approval, commands stay unavailable and the candidate is returned for unverified review.</p>
          {runtimeGate.requiresConsent && <label className="lw-approval"><input type="checkbox" checked={unverifiedRuntimeApproved} disabled={checkingReadiness} onChange={e => setUnverifiedRuntimeApproved(e.target.checked)} />Allow this unverified loopback runtime to receive repository context. Phonton cannot tell whether it relays that context outside this machine.</label>}
        </details>
          {plan && <div className="lw-plan" aria-label="Plan">
            <div className="lw-frame-label">plan</div>
            {plan.files.map(file => <p className="lw-plan-row" key={file.path}><b>{localPlanFileAction(plan.request, file.path)}</b><span><code>{file.path}</code> — {file.reason}</span></p>)}
            {plan.creation && <p className="lw-plan-row"><b>CREATE</b><span><code>{plan.creation.path}</code> — {plan.creation.reason}</span></p>}
            {plan.request.checks.map((check, index) => <p className="lw-plan-row" key={index}><b>CHECK</b><span><code>{displayLocalRunCommand(check)}</code></span></p>)}
            {plan.request.preparation && <p className="lw-plan-row"><b>SETUP</b><span><code>{displayLocalRunCommand(plan.request.preparation)}</code> · offline, uses a check slot, does not verify code</span></p>}
            {plan.model_selection ? <p className="lw-plan-row"><b>MODEL</b><span>{plan.model_selection.model} · {plan.model_selection.context_tokens.toLocaleString()} ctx · digest {plan.model_selection.digest.slice(0, 12)}</span></p> : <p role="status">Review this source and check scope now. Select and calibrate a local model, then review the plan again before running.</p>}
            <p className="lw-plan-row"><b>BUDGET</b><span>{localPlanBudgetSummary(plan.request.budget)}</span></p>
            <p className="lw-plan-flow">snapshot → {plan.creation ? "create" : "edit"} in a copy → compare baseline and candidate checks → repair or restart → review{machine?.managed_storage && <> · evidence under <code>{machine.managed_storage.runs_path}</code></>}</p>
            {!!plan.warnings.length && <details><summary>Notes · {plan.warnings.length}</summary>{plan.warnings.map(warning => <p key={warning}>{warning}</p>)}</details>}
            <details><summary>Plan contract & source identity</summary>{plan.contract.acceptance_criteria.map(criterion => <p key={criterion}>{criterion}</p>)}{plan.files.map(file => <p key={file.path}>{file.path} · SHA-256 {file.source_sha256}</p>)}{plan.creation && <p>{plan.creation.path} · absent at planning</p>}{plan.model_selection && <p>Model profile · SHA-256 {plan.model_selection.profile_sha256}</p>}</details>
            {!planModelCurrent && selectedModelReady && plan.model_selection && <p role="status">The selected model or runtime no longer matches this plan. Review the plan again.</p>}
            <div className="lw-plan-actions"><button className="lw-primary" disabled={checkingReadiness || !connected || !selectedModelReady || !plan.model_selection || !planModelCurrent || runtimeGate.blocked || (runtimeGate.requiresConsent && !unverifiedRuntimeApproved)} onClick={() => void start()}>{checkingReadiness ? "Checking runtime…" : "Run local goal →"}</button>
            <button disabled={planning || checkingReadiness || !connected} onClick={() => void review()}>{planning ? "Inspecting repository…" : "Review plan again"}</button></div>
          </div>}
        {!plan && <div className="lw-submit"><span>{!repository ? "Choose a repository to get started." : !goal.trim() ? "Describe the change you want to make." : machine?.runtime_error ? `Model inventory unavailable: ${machine.runtime_error}` : "Review the scope before anything runs."}</span><button className="lw-primary" disabled={planning || !connected || !repository || !goal.trim()} onClick={() => void review()}>{planning ? "Inspecting repository…" : "Review plan →"}</button></div>}

      </section>}
    </main>
    </div>
    <footer className="lw-footer"><span>{runtimePresentation.footer} · explicit execution · inspectable evidence</span><span>phonton</span></footer>
  </div>;
}
