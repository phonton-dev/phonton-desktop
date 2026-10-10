import { useCallback, useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { cancelModelOperation, memorySize, modelCatalog, modelOperation, modelStatus, setManagedStorage, setModelEndpoint, startModelOperation, type CatalogSnapshot, type ModelOperation, type ModelStatus } from "@/lib/local-models";
import { canCancelModelOperation, matchingModelOperation, readOwnedModelOperation, writeOwnedModelOperation } from "@/lib/model-operation-identity";
import { canStartManagedRuntimeSetup, canStartModelDownload, isCatalogModelInstalled, managedModelStoragePlan, managedRuntimeRecovery, MANAGED_ENDPOINT, needsFreshRuntimeStorage, sameInstalledModel, storageShortfallSize } from "@/lib/model-download-availability";
import { calibrationOutcome } from "@/lib/model-calibration-outcome";
import { localEngineErrorMessage } from "@/lib/serve";
import { isTauri } from "@/lib/sidecar";
import "./local-models.css";

type Props = { connected: boolean; connectionIssue?: string; onBack: () => void; onReconnect: () => Promise<void> };
const fitLabel = { likely_fits_gpu: "Likely GPU fit", cpu_or_offload: "CPU / offload", insufficient_memory: "Memory pressure", unknown: "Fit unknown" };
const OPERATION_CHANGED = "The engine's latest model operation changed before Phonton could confirm this step. Refresh installed models to check its result.";
const showPath = (path: string) => path.startsWith("\\\\?\\") ? path.slice(4) : path;
// Keep exact operation identity across page navigation and WebView reload.
let startedOperationId: string | null = typeof sessionStorage === "undefined" ? null : readOwnedModelOperation(sessionStorage);
function rememberStartedOperation(id: string | null): void {
  startedOperationId = id;
  if (typeof sessionStorage !== "undefined") writeOwnedModelOperation(sessionStorage, id);
}

/** Short labels for calibration probe names. */
function probeLabel(name: string): string {
  const labels: Record<string, string> = {
    "SearchReplace edit": "search/replace edit",
    "UnifiedDiff edit": "unified diff edit",
    "Structured create": "new file",
    "Tool call format": "tool call",
  };
  return labels[name] ?? name;
}

export function LocalModelsPage({ connected, connectionIssue, onBack, onReconnect }: Props) {
  const [status, setStatus] = useState<ModelStatus | null>(null);
  const managedRuntimeSupported = status?.managed_runtime_supported === true;
  const freshRuntimeStorageShortfall = needsFreshRuntimeStorage(status);
  const managedRecovery = managedRuntimeRecovery(status);
  const [catalog, setCatalog] = useState<CatalogSnapshot | null>(null);
  const firstTryModel = catalog?.models.find(model => model.first_try_reason);
  const firstTryStorage = firstTryModel ? managedModelStoragePlan(status, firstTryModel) : null;
  const [operation, setOperation] = useState<ModelOperation | null>(null);
  const [ownedOperationId, setOwnedOperationId] = useState(startedOperationId);
  const [operationNotice, setOperationNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [customModel, setCustomModel] = useState("");
  const [endpointInput, setEndpointInput] = useState("");
  const [context, setContext] = useState<number | null>(null);
  const [remove, setRemove] = useState<string | null>(null);
  const alive = useRef(true);
  const refreshSeq = useRef(0);
  const catalogSeq = useRef(0);
  const operationEpoch = useRef(0);
  const operationView = useRef<HTMLElement>(null);
  const busy = loading || submitting || Boolean(operation?.running);
  const calibrationResult = operation ? calibrationOutcome(operation) : null;
  const selectedRows = status?.models.filter(({ model }) => sameInstalledModel(status.active_model, model.name)).length ?? 0;
  const report = localEngineErrorMessage;

  const showObservedOperation = useCallback((value: ModelOperation) => {
    if (startedOperationId && value.id === startedOperationId) setOwnedOperationId(startedOperationId);
    else if (startedOperationId) { rememberStartedOperation(null); setOwnedOperationId(null); setOperationNotice(OPERATION_CHANGED); }
    setOperation(value.id ? value : null);
  }, []);

  useEffect(() => {
    if (operation?.running || operation?.error) operationView.current?.scrollIntoView({ block: "center" });
  }, [operation?.id, operation?.running, operation?.error]);

  useEffect(() => { if (status?.endpoint) setEndpointInput(status.endpoint); }, [status?.endpoint]);

  const refresh = useCallback(async () => {
    const sequence = ++refreshSeq.current;
    // Fit guidance is tied to the hardware snapshot captured during browse.
    // A late catalog reply cannot restore it after these readings change.
    catalogSeq.current++;
    setCatalog(null);
    setCatalogLoading(false);
    setLoading(true);
    try { const value = await modelStatus(context); if (alive.current && sequence === refreshSeq.current) { setStatus(value); setError(null); } }
    catch (e) { if (alive.current && sequence === refreshSeq.current) { setStatus(null); setError(report(e)); } }
    finally { if (alive.current && sequence === refreshSeq.current) setLoading(false); }
  }, [context]);

  useEffect(() => {
    alive.current = true;
    const epoch = ++operationEpoch.current;
    let cancelled = false;
    if (connected) {
      void refresh();
      void modelOperation().then(value => {
        if (cancelled || !alive.current || epoch !== operationEpoch.current) return;
        showObservedOperation(value);
        // A terminal result can arrive after the first status request captured
        // the pre-calibration profile. Read status again before offering Select.
        if (value.id && !value.running) void refresh();
      }).catch(e => {
        if (!cancelled && alive.current && epoch === operationEpoch.current) setError(report(e));
      });
    }
    else { catalogSeq.current++; setStatus(null); setCatalog(null); setCatalogLoading(false); setOperation(null); }
    return () => { cancelled = true; alive.current = false; refreshSeq.current++; catalogSeq.current++; operationEpoch.current++; };
  }, [connected, refresh, showObservedOperation]);

  useEffect(() => {
    if (!operation?.running) return;
    let cancelled = false;
    const epoch = operationEpoch.current;
    const expectedId = operation.id;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const observed = await modelOperation();
        if (cancelled || epoch !== operationEpoch.current) return;
        const value = matchingModelOperation(expectedId, observed);
        if (!value) {
          const replacedOwnedOperation = ownedOperationId === expectedId;
          if (replacedOwnedOperation) { rememberStartedOperation(null); setOwnedOperationId(null); setOperationNotice(OPERATION_CHANGED); }
          setOperation(observed.id ? observed : null);
          await refresh();
          return;
        }
        setOperation(value);
        if (value.running) timer = setTimeout(() => void poll(), 1000);
        else await refresh();
      } catch (e) { if (!cancelled && epoch === operationEpoch.current) { setError(report(e)); timer = setTimeout(() => void poll(), 3000); } }
    };
    timer = setTimeout(() => void poll(), 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [operation?.id, operation?.running, ownedOperationId, refresh]);

  useEffect(() => {
    if (!connected || submitting || operation?.running) return;
    let cancelled = false;
    const epoch = operationEpoch.current;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const observed = await modelOperation();
        if (cancelled || !alive.current || epoch !== operationEpoch.current) return;
        if (observed.id !== (operation?.id ?? "") || observed.running) {
          showObservedOperation(observed);
          if (observed.id && !observed.running) await refresh();
        }
      } catch {
        // A background read failure does not replace an actionable operation error.
      }
      if (!cancelled && epoch === operationEpoch.current) timer = setTimeout(() => void poll(), 3000);
    };
    timer = setTimeout(() => void poll(), 3000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [connected, submitting, operation?.id, operation?.running, refresh, showObservedOperation]);

  async function start(kind: string, model = "") {
    const epoch = ++operationEpoch.current;
    setSubmitting(true); setError(null); setOperationNotice(null); setRemove(null);
    try {
      const started = await startModelOperation(kind, model, context, status);
      rememberStartedOperation(started.id);
      if (alive.current) setOwnedOperationId(started.id);
      if (!alive.current || epoch !== operationEpoch.current) return;
      // Admission already named the operation. Poll that ID even if the first
      // status read fails, so a running download stays visible and cancellable.
      setOperation({ id: started.id, kind, model, running: true, cancelable: started.cancelable, progress: null, result: null, error: null });
    } catch (e) { if (alive.current && epoch === operationEpoch.current) {
      const startError = report(e);
      setError(startError);
      try {
        const observed = await modelOperation();
        if (alive.current && epoch === operationEpoch.current) {
          showObservedOperation(observed);
        }
      } catch { /* Keep the original start error. */ }
      // A separate CLI may have changed the endpoint or managed folder while
      // this page was open. Clear stale catalog guidance before another click.
      if (alive.current && epoch === operationEpoch.current) {
        await refresh();
        if (alive.current && epoch === operationEpoch.current) setError(startError);
      }
    } }
    finally { if (alive.current) setSubmitting(false); }
  }

  async function browse() {
    const sequence = ++catalogSeq.current;
    setCatalog(null); setCatalogLoading(true); setError(null);
    try {
      // Pair registry sizes with a fresh storage reading; either request can be
      // superseded by Refresh readings or a later Browse.
      const currentStatus = await modelStatus(context);
      if (!alive.current || sequence !== catalogSeq.current) return;
      setStatus(currentStatus);
      const value = await modelCatalog();
      if (alive.current && sequence === catalogSeq.current) setCatalog(value);
    }
    catch (e) { if (alive.current && sequence === catalogSeq.current) setError(report(e)); }
    finally { if (alive.current && sequence === catalogSeq.current) setCatalogLoading(false); }
  }

  async function saveEndpoint() {
    const epoch = ++operationEpoch.current;
    setSubmitting(true); setError(null);
    try {
      const result = await setModelEndpoint(endpointInput.trim());
      if (alive.current && epoch === operationEpoch.current) {
        setEndpointInput(result.endpoint);
        rememberStartedOperation(null);
        setOwnedOperationId(null);
        setOperationNotice(null);
        setStatus(null); setCatalog(null); setOperation(null); setRemove(null);
        await refresh();
      }
    } catch (e) { if (alive.current && epoch === operationEpoch.current) setError(report(e)); }
    finally { if (alive.current && epoch === operationEpoch.current) setSubmitting(false); }
  }

  async function chooseManagedStorage() {
    setError(null);
    try {
      if (!isTauri()) throw new Error("Choose managed storage in the installed Desktop app, or use phonton models storage PATH in the CLI.");
      const selected = await open({ directory: true, multiple: false, title: "Choose an empty folder for Phonton local data" });
      if (typeof selected !== "string" || !selected.trim()) return;
      setSubmitting(true);
      await setManagedStorage(selected);
      await refresh();
    } catch (e) { if (alive.current) setError(report(e)); }
    finally { if (alive.current) setSubmitting(false); }
  }

  const existingRuntime = operation?.kind === "setup" && !operation.running && !operation.error &&
    operation.result != null && typeof operation.result === "object" &&
    "existing" in operation.result && operation.result.existing === true;
  const verifiedPreviousLaunch = existingRuntime && operation?.result != null && typeof operation.result === "object" &&
    "managed_origin" in operation.result && operation.result.managed_origin === "verified_previous_launch";

  return <main className="local-models" aria-labelledby="models-title">
    <div className="model-page-heading"><button onClick={onBack} disabled={submitting}>← Workspace</button><span>Connects over loopback</span></div>
    <header><h1 id="models-title">Local models</h1><p>Install a model, measure which edits it gets right on this machine, then select it. Inference stays on 127.0.0.1.</p></header>
    {!connected && <p role="status">{connectionIssue ?? "Connect the Phonton engine to inspect your machine and manage models."} <button onClick={() => void onReconnect()}>Reconnect engine</button></p>}
    {error && <div className="model-error" role="alert"><strong>Couldn’t finish that step.</strong><p>{error}</p><button onClick={() => { setError(null); void onReconnect().then(() => void refresh()); }} disabled={loading}>Reconnect engine</button></div>}

    <section aria-labelledby="machine-title"><div className="model-section-heading"><h2 id="machine-title">Your machine</h2><button onClick={() => void refresh()} disabled={!connected || loading}>{loading ? "Reading hardware…" : "Refresh readings"}</button></div>
      {status ? <dl className="machine-readings">
        <div><dt>CPU</dt><dd>{status.hardware.cpu ?? "Unknown"} · {status.hardware.logical_cpus} threads</dd></div>
        <div><dt>RAM</dt><dd>{memorySize(status.hardware.ram_available_bytes)} free / {memorySize(status.hardware.ram_total_bytes)}</dd></div>
        {status.hardware.gpus.map((gpu, i) => <div key={`${gpu.name}-${i}`}><dt>GPU</dt><dd>{gpu.name}<br />{memorySize(gpu.available_bytes)} free / {memorySize(gpu.total_bytes)}</dd></div>)}
        <div><dt>Runtime</dt><dd>{status.runtime_version ? `Ollama ${status.runtime_version}` : "Not connected"} · {status.endpoint}</dd></div>
        {status.managed_storage && <div><dt>Local storage</dt><dd>Models: {showPath(status.managed_storage.models_path)}<br />Run evidence: {showPath(status.managed_storage.runs_path)}<br />{memorySize(status.managed_storage.available_bytes)} free on the managed-files volume</dd></div>}
      </dl> : <p>{loading ? "Measuring available resources…" : "Hardware has not been measured."}</p>}
      {status?.managed_storage && status.managed_storage.source !== "default" && <p className="model-note">{status.managed_storage.source === "chosen" ? "This folder is saved for Phonton-managed runtime, models, and new coding-run evidence." : status.managed_storage.source === "override" ? "This engine uses an isolated local state path; its managed files and run evidence stay beside that state." : "Phonton-managed files and new run evidence currently use the default drive."} {status.managed_storage.reason}</p>}
      {status?.managed_storage?.changeable && status.storage_control && <div className="managed-storage-choice">
        <button disabled={busy} onClick={() => void chooseManagedStorage()}>Choose empty storage folder</button>
        <p className="model-note">Sets the folder for future Phonton-managed runtime and models, plus new coding-run evidence. A separately running Ollama keeps its own model store.</p>
      </div>}
      {freshRuntimeStorageShortfall && !managedRecovery && <div className="runtime-install" role="status"><p>Runtime setup needs {memorySize(status?.managed_storage?.runtime_setup_min_free_bytes)} free on its drive; this folder has {memorySize(status?.managed_storage?.available_bytes)} free. {status?.managed_storage?.changeable && status.storage_control ? "Free space or choose an empty storage folder on a roomier drive, then refresh readings." : "If setup was interrupted, retry it: Phonton retires only its own incomplete download stages before rechecking space. If space is still low, free space on this drive and refresh. This used location cannot be switched automatically."} Model weights need additional space.</p></div>}
      {!freshRuntimeStorageShortfall && status?.managed_storage && status.managed_storage.available_bytes != null && status.managed_storage.available_bytes < 6 * 1024 ** 3 && <p className="model-note" role="status">This drive has less than 6 GiB free. Model downloads or coding runs may need more space.</p>}
      {managedRecovery && status && <div className="runtime-install" role="alert">
          <p>Managed setup needs recovery: {status.model_store?.reason ?? "The saved managed launch could not be verified."}</p>
          {managedRecovery === "retryable"
            ? <p className="model-note">Phonton cannot verify the previous managed launch. {status.runtime_version ? "Stop the service using 127.0.0.1:11434, then refresh." : "Ollama is offline."} When the port is free, retry runtime setup to check the saved files and start a managed service.</p>
            : status.managed_storage?.changeable
            ? <p className="model-note">The selected folder was not used for managed files and can be changed. Choose another empty storage folder, then refresh. Downloads to this default endpoint remain blocked until its storage identity is valid.</p>
            : status.runtime_version
            ? <p className="model-note">Phonton cannot verify the service currently using 127.0.0.1:11434 as its saved managed launch. Managed downloads and verified-local goals are blocked. Stop that process, reconnect the original storage folder if it moved, then refresh. When the port is free and the warning clears, use Download and start runtime. Phonton will not stop an unverified process or discard its receipt automatically.</p>
            : <p className="model-note">The saved managed runtime or storage identity could not be verified while Ollama is offline. Reconnect the original storage folder if it moved, then refresh. This used location cannot be switched automatically. When the recovery warning clears, use Download and start runtime. Phonton will not discard its receipt automatically.</p>}
          {managedRecovery === "retryable" && !status.runtime_version && managedRuntimeSupported && <button className="model-primary" disabled={busy || catalogLoading || !canStartManagedRuntimeSetup(status)} onClick={() => void start("setup")}>Retry runtime setup</button>}
          <button onClick={() => void refresh()} disabled={busy}>Refresh status</button>
        </div>}
      {status?.runtime_version && !managedRecovery && (status.model_store?.status === "verified_managed"
        ? <p className="model-verified" role="status">✓ Runtime verified: started by Phonton, files hash-checked, cloud models off · {memorySize(status.model_store.available_bytes)} free for models</p>
        : <p className="model-note">Model store unverified: {status.model_store?.reason ?? "This engine did not report a managed-store binding."} Phonton sends requests to this loopback endpoint, but a separately running Ollama service may use its own model store, cloud settings and resource limits.</p>)}
      {status?.hardware.warnings.map(w => <p className="model-note" key={w}>{w}</p>)}
      {status?.runtime_version && status.runtime_error && <div className="runtime-install" role="alert"><p className="model-note">The runtime responded, but installed models could not be read: {status.runtime_error}</p><button onClick={() => void refresh()} disabled={loading}>Retry model inventory</button></div>}
      {status?.inventory_warnings?.length ? <div className="runtime-install" role="status"><p className="model-note">Ollama returned entries Phonton cannot use as local models. The listed models remain available.</p>{status.inventory_warnings.map((warning, index) => <p className="model-note" key={index}>{warning}</p>)}</div> : null}
      {status && !status.runtime_version && !managedRecovery && (
        <div className="runtime-install">
          <p className="model-note">{status.runtime_error}</p>
          {status.endpoint === MANAGED_ENDPOINT && managedRuntimeSupported && (
            <>
              <p>Phonton can install its own verified Ollama runtime: about 1.5 GB to download (160 MB on macOS); allow 6 GB of disk space. No account needed.</p>
              <p className="model-note">Choose storage before setup: Phonton cannot move this folder after managed files are used. Browse coding models below to check their registry sizes; model weights need space beyond the runtime allowance.</p>
              {firstTryModel && firstTryStorage && <p className="model-note" role="status">The first-try model, {firstTryModel.name}, has a conservative runtime-and-model planning allowance of {memorySize(firstTryStorage.requiredBytes)} on this drive, including setup headroom and the model pull reserve. This folder has {memorySize(firstTryStorage.availableBytes)} free. {firstTryStorage.shortfallBytes > 0 ? `About ${storageShortfallSize(firstTryStorage.shortfallBytes)} short. Choose a roomier storage folder before setup, or pick a smaller model. Runtime setup alone could pass while this model download fails.` : "Free space and registry sizes can change; Phonton checks again when each download starts."}</p>}
              <p className="model-note">If setup is interrupted, run it again. Phonton preserves unfamiliar files and reports anything that needs inspection.</p>
              <button className="model-primary" disabled={busy || catalogLoading || !canStartManagedRuntimeSetup(status)} onClick={() => void start("setup")}>{freshRuntimeStorageShortfall && status.managed_storage?.changeable === false ? "Retry runtime setup" : "Download and start runtime"}</button>
            </>
          )}
          {status.endpoint === MANAGED_ENDPOINT && !managedRuntimeSupported && (
            <>
              <p>Managed runtime setup is not available on this platform. Install and start Ollama, then refresh the runtime status. Phonton connects to the loopback origin shown above.</p>
              <p className="model-note">If Ollama uses another local port, set its loopback origin under Advanced settings.</p>
              <div className="model-actions">
                <a href="https://ollama.com/download" target="_blank" rel="noreferrer">Get Ollama ↗</a>
                <button disabled={busy} onClick={() => void refresh()}>Refresh runtime status</button>
              </div>
            </>
          )}
          {status.endpoint !== MANAGED_ENDPOINT && (
            <p>Start your Ollama runtime at {status.endpoint}, or restore the default origin under Advanced settings{managedRuntimeSupported ? " to use managed setup" : ""}.</p>
          )}
        </div>
      )}
    </section>

    {operationNotice && <p className="model-note" role="status">{operationNotice}</p>}
    {operation?.id && <section ref={operationView} className="model-operation" aria-label="Model operation">
      <div role="status" aria-live="polite"><strong>{operation.running ? operation.progress?.status ?? `${operation.kind} in progress…` : operation.error ? "Operation stopped" : calibrationResult === "no_edit_format" ? "Calibration saved · editing not ready" : calibrationResult === "edit_ready" ? "Edit format passed" : calibrationResult === "unknown" ? "Calibration result unavailable" : "Operation finished"}</strong><span>{operation.model}</span></div>
      {operation.error && <p className="model-note" role="alert">{operation.error}</p>}
      {existingRuntime && <p className="model-note" role="status">{verifiedPreviousLaunch
        ? "The running Ollama matches a previous Phonton-managed launch. Its model store is currently verified."
        : "An existing Ollama answered at this local endpoint. Phonton did not start it in this setup and cannot confirm its process settings from this response."}</p>}
      {calibrationResult === "no_edit_format" && <p className="model-note">Neither existing-file edit format passed. Inspect the saved probe output below; this model cannot be selected yet.</p>}
      {calibrationResult === "unknown" && <p className="model-note">Refresh installed models to check whether this calibration produced a selectable profile.</p>}
      {ownedOperationId !== operation.id && <p className="model-note">Latest engine operation from another client. It cannot be cancelled from this window.</p>}
      {operation.running && !operation.cancelable && <p className="model-note">Selection, deselection and removal finish before Phonton reports their result. Refresh installed models if the connection drops.</p>}
      {operation.progress?.total != null && operation.progress.total > 0 && <><progress aria-label="Download progress" max={operation.progress.total} value={operation.progress.completed ?? undefined} /><p>{memorySize(operation.progress.completed)} / {memorySize(operation.progress.total)}</p></>}
      {canCancelModelOperation(ownedOperationId, operation) && <button onClick={() => void cancelModelOperation(operation.id).catch(e => setError(report(e)))}>Cancel operation</button>}
    </section>}

    {status?.install_attempts?.length ? <section aria-labelledby="install-requests-title"><div className="model-section-heading"><h2 id="install-requests-title">Install requests</h2></div>
        {status.install_attempts.map(({ attempt, reconciliation }) => {
          const inFlight = Boolean(operation?.running && operation.kind === "install" && attempt.endpoint === status.endpoint && sameInstalledModel(operation.model, attempt.model));
          return <div className="model-attempt" key={`${attempt.endpoint}/${attempt.model}`}><strong>{inFlight ? "Downloading" : reconciliation === "installed" ? "Install confirmed by runtime" : "Unconfirmed install request"} · {attempt.model}</strong><p className="model-note">Requested {new Date(attempt.started_at_unix * 1000).toLocaleString()} at {attempt.endpoint}. The request may have stopped before transfer or after partial layers; this record does not prove reusable bytes.</p>
            {reconciliation === "installed" && <p className="model-note">The runtime now reports this exact model as installed. Use its row below to calibrate it before selection.</p>}
            {reconciliation === "not_installed" && !inFlight && <><p className="model-note">The current runtime inventory does not list this model. Retry the exact tag to continue; the runtime decides whether any partial layers can be reused.</p><button disabled={busy || !canStartModelDownload(status)} onClick={() => void start("install", attempt.model)}>Retry install</button></>}
            {reconciliation === "inventory_unavailable" && <p className="model-note">The runtime inventory could not confirm whether the model is installed. Reconnect or refresh before retrying.</p>}
            {reconciliation === "endpoint_changed" && <p className="model-note">The current runtime origin differs from this request. Switch back to its saved origin before checking or retrying it.</p>}
            {reconciliation === "ambiguous" && <p className="model-note">The runtime returned ambiguous model aliases. Resolve its inventory before retrying this tag.</p>}
          </div>;
        })}
    </section> : null}

    <section aria-labelledby="installed-title"><div className="model-section-heading"><h2 id="installed-title">Installed models</h2>{status?.active_model && <button disabled={busy || !connected} onClick={() => void start("deselect", status.active_model!)}>Deselect model</button>}</div>
      {status?.active_model && <p className="model-note">Deselecting keeps its downloaded weights and calibration. Remove the model separately to reclaim storage.</p>}
        {status?.calibration_attempt && <details className="model-attempt"><summary>Incomplete calibration · {status.calibration_attempt.model} · {status.calibration_attempt.probes.length} completed {status.calibration_attempt.probes.length === 1 ? "probe" : "probes"}</summary><p className="model-note">This attempt is diagnostic only and cannot be selected. It survives an engine exit; Calibrate starts a new attempt. Any earlier passing profile is kept separately. Probe identity is unverified until calibration completes.</p><p className="model-note">Started {new Date(status.calibration_attempt.started_at_unix * 1000).toLocaleString()} · {status.calibration_attempt.context_tokens.toLocaleString()} context · {status.calibration_attempt.endpoint}</p>{status.calibration_attempt.probes.map((probe, index) => <div className="model-probe" key={`${index}-${probe.name}`}><strong>{probe.status} — {probe.name}</strong><p>{probe.detail}</p><p>{probe.input_tokens ?? "?"} input / {probe.output_tokens ?? "?"} output tokens · {(probe.elapsed_ms / 1000).toFixed(1)}s</p><pre>{probe.output || "No model output"}</pre></div>)}<p className="model-digest">Starting digest {status.calibration_attempt.starting_digest} · runtime {status.calibration_attempt.runtime_version}</p></details>}
      {status?.models.length ? status.models.map(({ model, fit, model_context_limit, context_error, profile, profile_error, calibration_evidence }) => {
        const evidence = profile ?? calibration_evidence;
        const selected = selectedRows === 1 && sameInstalledModel(status.active_model, model.name);
        return <article className="model-row" key={model.name}>
        <div className="model-row-title"><h3>{model.name}</h3>{selected && <span className="model-selected">{profile ? "✓ Selected" : "Selected · not ready"}</span>}</div>
        <p>{memorySize(model.size_bytes)} · {model.quantization ?? "Unknown quantization"} · {fitLabel[fit.status]} at {fit.context_tokens.toLocaleString()} context (cold load)</p>
        {evidence && <ul className="model-probes" aria-label="Calibration results">{evidence.probes.map(probe => <li key={probe.name} className={`probe-${probe.status}`}>{probe.status === "passed" ? "✓" : probe.status === "failed" ? "✗" : "–"} {probeLabel(probe.name)}</li>)}</ul>}
        {profile?.protocol && <p className="model-note">Phonton asks this model for {profile.protocol === "search_replace" ? "search/replace" : profile.protocol.replace(/_/g, " ")} edits only.</p>}
        <details className="model-fit"><summary>Fit details</summary><p className="model-note">{fit.explanation}</p>
        <p className="model-note">Cold-load automatic context: {fit.suggested_context == null ? "unavailable from current readings" : `${fit.suggested_context.toLocaleString()} tokens`}{model_context_limit != null ? ` · model limit ${model_context_limit.toLocaleString()}` : ""}. Calibration rechecks RAM before every probe, and a loaded model is checked again before a goal.</p></details>
        {context_error && <p className="model-note" role="status">Context metadata: {context_error}{profile && " Saved calibration remains visible; Select and local goals recheck metadata before inference."}</p>}
        {profile_error && <p className="model-note" role="status">Calibration not ready: {profile_error}</p>}
        <div className="model-actions"><button disabled={busy || (context != null && model_context_limit != null && context > model_context_limit)} onClick={() => void start("calibrate", model.name)}>Calibrate</button><button disabled={busy || !profile?.protocol || selected} onClick={() => void start("select", model.name)}>Select model</button><button disabled={busy || selected} onClick={() => setRemove(model.name)}>Remove…</button></div>
        {remove === model.name && <div className="model-confirm"><p>Remove {model.name} from this runtime? Other models may still share its downloaded layers.</p><button disabled={busy} onClick={() => void start("remove", model.name)}>Remove this model</button><button onClick={() => setRemove(null)}>Keep model</button></div>}
        {evidence && <details><summary>{profile ? "Calibration evidence" : "Saved probe evidence · not selectable"} · {evidence.context_tokens.toLocaleString()} context · {evidence.protocol ?? "no edit format passed"} · {evidence.thinking === "off" ? "think:false request" : "runtime-default thinking"}</summary><p className="model-note">{profile ? "Small fixed probes measure compatibility, not general coding quality. Coding requests reuse this thinking setting." : "Saved probes are diagnostic only. Refresh after a temporary runtime error; recalibrate after fixing failed edit probes or a stale profile."}</p>{evidence.probes.map(probe => <div className="model-probe" key={probe.name}><strong>{probe.status} — {probe.name}</strong><p>{probe.detail}</p><p>{probe.input_tokens ?? "?"} input / {probe.output_tokens ?? "?"} output tokens · {(probe.elapsed_ms / 1000).toFixed(1)}s</p><pre>{probe.output || "No model output"}</pre></div>)}<p className="model-digest">Digest {evidence.digest}</p></details>}
      </article>;
      }) : <p className="model-note">{status?.runtime_error && status.runtime_version ? "Installed models could not be read." : status?.inventory_warnings?.length ? "No usable installed models; see omitted entries above." : status ? "No installed models reported by the runtime." : "Connect to inspect installed models."}</p>}
    </section>

    <section aria-labelledby="catalog-title"><div className="model-section-heading"><h2 id="catalog-title">Find a model</h2><button disabled={!status || loading || catalogLoading} onClick={() => void browse()}>{catalogLoading ? "Reading registry…" : catalog ? "Refresh registry" : "Browse coding models"}</button></div>
      <p className="model-note">Sizes come from the public Ollama registry. Fit is a conservative memory estimate; calibration measures the rest after download.</p>
      {catalog && <p className="model-note" role="status">Catalog fit reading: {memorySize(catalog.hardware.ram_available_bytes)} free RAM; {catalog.hardware.gpus.length ? catalog.hardware.gpus.map(gpu => `${gpu.name}: ${memorySize(gpu.available_bytes)} free GPU memory`).join("; ") : "no GPU reported"}. Installed-model fits above use the separate Your machine reading. Refresh readings clears this catalog.</p>}
      {catalog?.hardware.warnings.map(w => <p className="model-note" key={`catalog-${w}`}>Catalog reading: {w}</p>)}
      {catalog && !catalog.models.some(model => model.first_try_reason) && <p className="model-note" role="status">No first-try suggestion from this browse. Registry sizes or memory readings may be unavailable, or no entry fits with reserve. Review each entry; you can still choose a model explicitly. Refresh the registry after memory changes.</p>}
      {catalog?.models.slice().sort((a, b) => Number(Boolean(b.first_try_reason)) - Number(Boolean(a.first_try_reason))).map(model => {
        const storagePlan = managedModelStoragePlan(status, model);
        return <article className="model-row" key={model.name}>
        <div className="model-row-title"><h3>{model.name}</h3><span>{memorySize(model.download_bytes)}</span></div>
        {model.first_try_reason && <p className="model-first-try"><strong>First model to try.</strong> {model.first_try_reason}</p>}
        <p>{model.error ?? (model.fit ? `${model.fit.context_tokens.toLocaleString()} context cold-load estimate: ${model.fit.explanation}` : "No fit estimate available")}</p>
        {storagePlan && <p className="model-note">Before setup, allow about {memorySize(storagePlan.requiredBytes)} free for runtime staging, this model's registry size, and pull reserve; this folder has {memorySize(storagePlan.availableBytes)}. {storagePlan.shortfallBytes > 0 ? `About ${storageShortfallSize(storagePlan.shortfallBytes)} short; choose a roomier folder before setup.` : "This meets the planning allowance; the live pull still checks disk space."}</p>}
        <div className="model-actions"><button disabled={busy || !canStartModelDownload(status) || !!model.error || isCatalogModelInstalled(status, model.name)} onClick={() => void start("install", model.name)}>Download model</button><a href={model.source} target="_blank" rel="noreferrer">Manifest ↗</a></div>
      </article>; })}
      <details className="model-advanced"><summary>Advanced settings</summary><label htmlFor="model-endpoint">Local Ollama origin</label><div className="model-input-row"><input id="model-endpoint" value={endpointInput} onChange={e => setEndpointInput(e.target.value)} disabled={!status?.endpoint_control} placeholder={MANAGED_ENDPOINT} autoCapitalize="off" autoCorrect="off" spellCheck={false} /><button disabled={busy || !connected || !status?.endpoint_control || !endpointInput.trim() || endpointInput.trim() === status.endpoint} onClick={() => void saveEndpoint()}>{submitting ? "Saving…" : "Save origin"}</button></div><p className="model-note">{status && !status.endpoint_control ? "This engine cannot change the local origin. Connect the bundled engine to enable this control." : "Only loopback HTTP(S) origins are accepted. A stopped runtime can be configured now; changing origins clears the selected model. Calibrate here if no valid profile exists for this origin."}</p><label htmlFor="custom-model">Exact Ollama model tag</label><div className="model-input-row"><input id="custom-model" value={customModel} onChange={e => setCustomModel(e.target.value)} placeholder="namespace/model:tag" /><button disabled={busy || !canStartModelDownload(status) || !customModel.trim()} onClick={() => void start("install", customModel.trim())}>Download</button></div><label htmlFor="model-context">Calibration context</label><select id="model-context" value={context ?? "auto"} disabled={busy} onChange={e => setContext(e.target.value === "auto" ? null : Number(e.target.value))}><option value="auto">Automatic from cold fit or loaded model</option>{[2048, 4096, 8192, 16384, 32768].map(n => <option key={n} value={n}>{n.toLocaleString()} tokens</option>)}</select><p className="model-note">Larger contexts require more memory. Automatic choice requires a reported model limit; calibration checks current headroom and any exact loaded-model retry before inference.</p></details>
    </section>
  </main>;
}
