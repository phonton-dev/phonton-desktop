import { ping, rpc } from "./serve";
import { supportsCatalogSnapshot } from "./engine-capabilities";
import { modelOperationRequest } from "./model-operation-request";

export type Fit = { status: "likely_fits_gpu" | "cpu_or_offload" | "insufficient_memory" | "unknown"; estimated_required_bytes: number; context_tokens: number; suggested_context: number | null; explanation: string };
export type Probe = { name: string; status: "passed" | "failed" | "not_run" | "unavailable"; detail: string; output: string; input_tokens: number | null; output_tokens: number | null; elapsed_ms: number };
export type Profile = { digest: string; runtime_version: string; context_tokens: number; output_tokens: number; protocol: string | null; thinking?: "off" | "runtime_default"; probes: Probe[]; measured_at_unix: number };
export type CalibrationAttempt = { schema: 1; model: string; starting_digest: string; runtime_version: string; endpoint: string; context_tokens: number; started_at_unix: number; probes: Probe[] };
export type InstallAttempt = { schema: 1; model: string; endpoint: string; started_at_unix: number };
export type InstallReconciliation = "installed" | "not_installed" | "inventory_unavailable" | "endpoint_changed" | "ambiguous";
export type InstallAttemptStatus = { attempt: InstallAttempt; reconciliation: InstallReconciliation };
export type CreationStatus = Probe["status"];
export type ModelStatus = {
  schema: 2;
  hardware: { cpu: string | null; logical_cpus: number; ram_total_bytes: number | null; ram_available_bytes: number | null; gpus: { name: string; total_bytes: number; available_bytes: number }[]; warnings: string[] };
  endpoint: string; runtime_version: string | null; runtime_error: string | null; inventory_warnings?: string[]; active_model: string | null;
  calibration_attempt?: CalibrationAttempt | null;
  install_attempts?: InstallAttemptStatus[];
  local_only?: boolean; loopback_only?: true;
  managed_runtime_supported?: boolean;
  model_store?: { status: "verified_managed" | "unverified"; available_bytes?: number; pid?: number; reason?: string; recovery_required?: boolean; goal_run_blocked?: boolean; setup_retryable?: boolean };
  managed_storage?: { root: string; models_path: string; runs_path: string; source: "default" | "chosen" | "override"; available_bytes: number | null; runtime_setup_min_free_bytes?: number; runtime_installed?: boolean; changeable: boolean; reason: string | null };
  endpoint_control: boolean;
  storage_control: boolean;
  models: { model: { name: string; digest: string; size_bytes: number; quantization: string | null; parameter_size: string | null }; fit: Fit; model_context_limit?: number | null; context_error?: string | null; profile: Profile | null; profile_sha256?: string | null; profile_error?: string | null; calibration_evidence?: Profile | null; creation_status?: CreationStatus }[];
};
export type PreSetupStoragePlan = { root: string; available_bytes: number; runtime_setup_min_free_bytes: number; model_download_bytes: number; pull_reserve_bytes: number; required_bytes: number; shortfall_bytes: number };
export type CatalogEntry = { name: string; source: string; download_bytes: number | null; fit: Fit | null; error: string | null; first_try_reason?: string | null; pre_setup_storage?: PreSetupStoragePlan | null };
export type CatalogSnapshot = { hardware: ModelStatus["hardware"]; models: CatalogEntry[] };
export type ModelOperation = { id: string; kind: string; model: string; running: boolean; cancelable: boolean; progress: { status: string; completed: number | null; total: number | null } | null; result: unknown; error: string | null };

export async function modelStatus(context: number | null = null): Promise<ModelStatus> {
  const engine = await ping();
  if (engine.local_models_schema !== 2) {
    throw new Error("The connected engine lacks context-aware local model status. Connect the bundled Phonton local engine, then retry.");
  }
  const value = await rpc<ModelStatus>("models.status", { context });
  if (value?.schema !== 2 || !Array.isArray(value.models) || value.models.some(row => !Number.isInteger(row?.fit?.context_tokens)) ||
      (value.calibration_attempt != null && (value.calibration_attempt.schema !== 1 ||
        typeof value.calibration_attempt.model !== "string" || typeof value.calibration_attempt.starting_digest !== "string" ||
        typeof value.calibration_attempt.endpoint !== "string" || !Number.isInteger(value.calibration_attempt.context_tokens) ||
        !Number.isInteger(value.calibration_attempt.started_at_unix) || !Array.isArray(value.calibration_attempt.probes) ||
        value.calibration_attempt.probes.some(probe => typeof probe?.name !== "string" || typeof probe?.detail !== "string" ||
          typeof probe?.output !== "string" || !Number.isFinite(probe?.elapsed_ms)))) ||
      (value.install_attempts != null && (!Array.isArray(value.install_attempts) || value.install_attempts.length > 8 ||
        value.install_attempts.some(row => !row?.attempt || row.attempt.schema !== 1 ||
          typeof row.attempt.model !== "string" || !row.attempt.model ||
          typeof row.attempt.endpoint !== "string" || !row.attempt.endpoint ||
          !Number.isInteger(row.attempt.started_at_unix) ||
          !["installed", "not_installed", "inventory_unavailable", "endpoint_changed", "ambiguous"].includes(row.reconciliation)))) ||
      (value.managed_runtime_supported != null && typeof value.managed_runtime_supported !== "boolean") ||
      (value.model_store != null && (!value.model_store || !["verified_managed", "unverified"].includes(value.model_store.status) ||
        (value.model_store.available_bytes != null && !Number.isFinite(value.model_store.available_bytes)) ||
        (value.model_store.reason != null && typeof value.model_store.reason !== "string") ||
        (value.model_store.recovery_required != null && typeof value.model_store.recovery_required !== "boolean") ||
        (value.model_store.goal_run_blocked != null && typeof value.model_store.goal_run_blocked !== "boolean") ||
        (value.model_store.setup_retryable != null && typeof value.model_store.setup_retryable !== "boolean"))) ||
      (value.managed_storage != null && (!value.managed_storage || typeof value.managed_storage.root !== "string" ||
        typeof value.managed_storage.models_path !== "string" || typeof value.managed_storage.runs_path !== "string" || !["default", "chosen", "override"].includes(value.managed_storage.source) ||
        typeof value.managed_storage.changeable !== "boolean" ||
        (value.managed_storage.available_bytes != null && !Number.isFinite(value.managed_storage.available_bytes)) ||
        (value.managed_storage.runtime_setup_min_free_bytes != null && (!Number.isSafeInteger(value.managed_storage.runtime_setup_min_free_bytes) || value.managed_storage.runtime_setup_min_free_bytes <= 0)) ||
        (value.managed_storage.runtime_installed != null && typeof value.managed_storage.runtime_installed !== "boolean") ||
        (value.managed_storage.reason != null && typeof value.managed_storage.reason !== "string"))) ||
      (value.local_only != null && typeof value.local_only !== "boolean") ||
      (value.loopback_only != null && value.loopback_only !== true) ||
      (value.inventory_warnings != null && (!Array.isArray(value.inventory_warnings) || value.inventory_warnings.some(warning => typeof warning !== "string")))) {
    throw new Error("The connected engine returned incompatible local model status. Reconnect the bundled Phonton local engine.");
  }
  return { ...value, endpoint_control: engine.local_endpoint_schema === 1, storage_control: engine.local_storage_schema === 2 };
}
function validCatalogStoragePlan(model: CatalogEntry): boolean {
  const plan = model.pre_setup_storage;
  if (plan == null) return true;
  return typeof plan.root === "string" && !!plan.root &&
    [plan.available_bytes, plan.runtime_setup_min_free_bytes, plan.model_download_bytes,
      plan.pull_reserve_bytes, plan.required_bytes, plan.shortfall_bytes]
      .every(bytes => Number.isSafeInteger(bytes) && bytes >= 0) &&
    plan.runtime_setup_min_free_bytes > 0 && plan.model_download_bytes > 0 &&
    plan.model_download_bytes === model.download_bytes &&
    plan.required_bytes === plan.runtime_setup_min_free_bytes + plan.model_download_bytes + plan.pull_reserve_bytes &&
    plan.shortfall_bytes === Math.max(0, plan.required_bytes - plan.available_bytes);
}

export async function modelCatalog(): Promise<CatalogSnapshot> {
  if (!supportsCatalogSnapshot(await ping())) {
    throw new Error("The connected engine cannot pair catalog fits and storage plans with their readings. Reconnect the bundled Phonton local engine.");
  }
  const value = await rpc<CatalogSnapshot>("models.catalog.snapshot");
  if (!value?.hardware || !Array.isArray(value.hardware.gpus) || !Array.isArray(value.hardware.warnings) ||
      !Number.isInteger(value.hardware.logical_cpus) || !Array.isArray(value.models) ||
      value.models.some(model => !model || typeof model.name !== "string" || typeof model.source !== "string" || !validCatalogStoragePlan(model))) {
    throw new Error("The connected engine returned an incompatible catalog snapshot. Reconnect the bundled Phonton local engine.");
  }
  return value;
}
export const modelOperation = () => rpc<ModelOperation>("models.operation");
export async function startModelOperation(kind: string, model: string, context: number | null, reviewedStatus: ModelStatus | null): Promise<{ id: string; cancelable: boolean }> {
  const params = modelOperationRequest(kind, model, context, reviewedStatus);
  if ((await ping()).local_model_operation_schema !== 1) {
    throw new Error("The connected engine cannot bind model operations to the displayed endpoint and storage. Reconnect the bundled Phonton local engine.");
  }
  return rpc<{ id: string; cancelable: boolean }>("models.start", params);
}
export const cancelModelOperation = (id: string) => rpc("models.cancel", { id });
export async function setModelEndpoint(endpoint: string): Promise<{ endpoint: string; changed: boolean; active_model: string | null; local_only: boolean; loopback_only: true }> {
  if ((await ping()).local_endpoint_schema !== 1) {
    throw new Error("The connected engine cannot change local runtime endpoints. Connect the bundled Phonton local engine, then retry.");
  }
  return rpc<{ endpoint: string; changed: boolean; active_model: string | null; local_only: boolean; loopback_only: true }>("models.endpoint.set", { endpoint });
}
export async function setManagedStorage(path: string): Promise<{ root: string; changed: boolean }> {
  if ((await ping()).local_storage_schema !== 2) {
    throw new Error("The connected engine cannot change managed model storage. Connect the bundled Phonton local engine, then retry.");
  }
  return rpc<{ root: string; changed: boolean }>("models.storage.set", { path });
}

export function memorySize(bytes: number | null | undefined): string {
  return bytes == null ? "unknown" : `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
}
