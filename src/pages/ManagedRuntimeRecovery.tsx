import type { ModelStatus } from "@/lib/local-models";

type Props = {
  status: ModelStatus;
  recovery: "retryable" | "blocked";
  retryDisabled: boolean;
  refreshDisabled: boolean;
  onRetry: () => void;
  onRefresh: () => void;
};

/** Keep recovery actions clear while leaving the exact diagnostic inspectable. */
export function ManagedRuntimeRecovery({ status, recovery, retryDisabled, refreshDisabled, onRetry, onRefresh }: Props) {
  const offline = !status.runtime_version;
  const canRetry = recovery === "retryable" && offline && status.managed_runtime_supported === true;
  const installed = status.managed_storage?.runtime_installed === true;
  const canChooseStorage = status.managed_storage?.changeable === true && status.storage_control === true;
  const unsupported = recovery === "retryable" && offline && !status.managed_runtime_supported;
  const title = unsupported ? "Managed setup unavailable" : recovery === "retryable"
    ? offline ? installed ? "Start your local runtime" : "Finish runtime setup" : "Check the running local service"
    : canChooseStorage ? "Choose a local storage folder" : "Check your saved runtime";
  const description = unsupported
    ? "Phonton cannot restart its managed runtime on this platform. Check the saved runtime and storage, then refresh."
    : recovery === "retryable"
    ? offline
      ? "Phonton will check the saved runtime files, then start the service for your local models."
      : "Phonton cannot verify the service using 127.0.0.1:11434. Stop that service, then refresh before starting Phonton's runtime."
    : canChooseStorage
      ? "This folder has not been used for managed files. Choose another empty storage folder above, then refresh to check it."
      : status.runtime_version
        ? "Phonton cannot match the running service to its saved runtime. Stop that service, reconnect the original storage folder if it moved, then refresh. Your saved files and launch record stay in place."
        : "The saved runtime or its storage folder could not be verified. Reconnect the original folder if it moved, then refresh. Your saved files and launch record stay in place.";

  return <div className="runtime-install runtime-recovery" role="alert" aria-labelledby="runtime-recovery-title" data-recovery={recovery}>
    <h3 id="runtime-recovery-title">{title}</h3>
    <p className="runtime-recovery-description">{description}</p>
    <div className="model-actions">
      {canRetry && <button className="model-primary" data-managed-runtime-retry disabled={retryDisabled} onClick={onRetry}>{installed ? "Start runtime" : "Retry runtime setup"}</button>}
      <button disabled={refreshDisabled} onClick={onRefresh}>Refresh status</button>
    </div>
    <details className="runtime-recovery-details">
      <summary>Technical details</summary>
      <p>{status.model_store?.reason ?? "The saved managed launch could not be verified."}</p>
    </details>
  </div>;
}
