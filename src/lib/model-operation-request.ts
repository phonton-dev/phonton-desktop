import type { ModelStatus } from "./local-models";

export function modelOperationRequest(kind: string, model: string, context: number | null, status: ModelStatus | null) {
  if (!status?.endpoint || !status.managed_storage?.root) {
    throw new Error("Refresh Local models before starting an operation.");
  }
  return {
    kind, model, context,
    expected_endpoint: status.endpoint,
    expected_storage_root: status.managed_storage.root,
  };
}
