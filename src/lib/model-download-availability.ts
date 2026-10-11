import type { CatalogEntry, ModelStatus } from "./local-models";

export const MANAGED_ENDPOINT = "http://127.0.0.1:11434";

export function managedRuntimeRecovery(status: ModelStatus | null): "blocked" | "retryable" | null {
  if (status?.endpoint !== MANAGED_ENDPOINT || !status.model_store?.recovery_required) return null;
  // The engine checks receipt and storage-path safety separately from whether
  // a coding goal may run. Older engines lack this hint and fail closed.
  return status.model_store.setup_retryable === true ? "retryable" : "blocked";
}

export function needsFreshRuntimeStorage(status: ModelStatus | null): boolean {
  const storage = status?.managed_storage;
  return Boolean(status && !status.runtime_version && status.endpoint === MANAGED_ENDPOINT &&
    status.managed_runtime_supported === true && storage && !storage.runtime_installed &&
    storage.available_bytes != null && storage.runtime_setup_min_free_bytes != null &&
    storage.available_bytes < storage.runtime_setup_min_free_bytes);
}

/** A used folder may contain a Phonton-owned partial stage that setup can retire before rechecking space. */
export function canStartManagedRuntimeSetup(status: ModelStatus | null): boolean {
  return Boolean(status && managedRuntimeRecovery(status) !== "blocked" &&
    (!needsFreshRuntimeStorage(status) || status.managed_storage?.changeable === false));
}

export function canStartModelDownload(status: ModelStatus | null): boolean {
  return Boolean(status?.runtime_version && !status.runtime_error &&
    !(status.endpoint === MANAGED_ENDPOINT && status.model_store?.recovery_required));
}

// Mirror phonton-local::runtime::canonical_model_name for this display-only
// guard. The engine still owns validation and install admission.
function canonicalModelName(name: string): string | null {
  if (!name || name.length > 200 || name.startsWith("/") || name.includes("..") ||
      !/^[A-Za-z0-9_.:/-]+$/.test(name) || name.toLowerCase().includes("cloud")) return null;
  const parts = name.split("/");
  if (parts.length > 3 || parts.some(part => !part)) return null;
  let canonical = name;
  if (parts.length === 2 && parts[0].toLowerCase() === "library") canonical = parts[1];
  if (parts.length === 3 && parts[0].toLowerCase() === "registry.ollama.ai") {
    canonical = parts[1].toLowerCase() === "library" ? parts[2] : `${parts[1]}/${parts[2]}`;
  }
  const leaf = canonical.slice(canonical.lastIndexOf("/") + 1);
  const tagAt = leaf.indexOf(":");
  if (tagAt >= 0) {
    if (tagAt === 0 || tagAt === leaf.length - 1 || leaf.indexOf(":", tagAt + 1) >= 0) return null;
  } else canonical += ":latest";
  return canonical.toLowerCase();
}

/** Match the runtime's equivalent default-library spellings without merging distinct namespaces. */
export function sameInstalledModel(first: string | null | undefined, second: string | null | undefined): boolean {
  if (!first || !second) return false;
  const canonical = canonicalModelName(first);
  return canonical !== null && canonical === canonicalModelName(second);
}

/** Prevent a catalog pull when this runtime already reports an alias of that model. */
export function isCatalogModelInstalled(status: ModelStatus | null, catalogName: string): boolean {
  return Boolean(status?.models.some(row => sameInstalledModel(row.model.name, catalogName)));
}

export type ManagedModelStoragePlan = {
  availableBytes: number;
  requiredBytes: number;
  shortfallBytes: number;
};

/** Round a positive deficit upward so the displayed amount never reads as zero. */
export function storageShortfallSize(bytes: number): string {
  const mib = 1024 ** 2;
  if (bytes < 100 * mib) return `${Math.ceil(bytes / mib)} MiB`;
  return `${(Math.ceil(bytes / (1024 ** 3) * 10) / 10).toFixed(1)} GiB`;
}

/** Use the shared engine's disk plan only for the still-current managed root. */
export function managedModelStoragePlan(status: ModelStatus | null, model: CatalogEntry): ManagedModelStoragePlan | null {
  const storage = status?.managed_storage;
  const plan = model.pre_setup_storage;
  if (!status || status.endpoint !== MANAGED_ENDPOINT || status.runtime_version ||
      status.managed_runtime_supported !== true || !storage || storage.runtime_installed || !storage.changeable || storage.reason != null ||
      model.error || !plan || storage.root !== plan.root ||
      storage.runtime_setup_min_free_bytes !== plan.runtime_setup_min_free_bytes) return null;
  return {
    availableBytes: plan.available_bytes,
    requiredBytes: plan.required_bytes,
    shortfallBytes: plan.shortfall_bytes,
  };
}
