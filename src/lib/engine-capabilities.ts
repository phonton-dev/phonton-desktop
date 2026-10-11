import type { EnginePing } from "./serve";

export function supportsCatalogSnapshot(info: EnginePing): boolean {
  return info.local_catalog_snapshot_schema === 2;
}

export function supportsLocalHarnessCapabilities(info: EnginePing): boolean {
  return info.local_models_schema === 2
    && info.local_model_operation_schema === 1
    && supportsCatalogSnapshot(info)
    && info.local_storage_schema === 2
    && info.local_run_schema === 2
    && info.local_creation_schema === 1;
}
