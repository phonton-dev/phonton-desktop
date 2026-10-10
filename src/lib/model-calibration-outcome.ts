type CalibrationOperation = {
  kind: string;
  running: boolean;
  error: string | null;
  result: unknown;
};

export function calibrationOutcome(operation: CalibrationOperation): "edit_ready" | "no_edit_format" | "unknown" | null {
  if (operation.kind !== "calibrate" || operation.running || operation.error) return null;
  if (!operation.result || typeof operation.result !== "object" || !("protocol" in operation.result)) return "unknown";
  const protocol = operation.result.protocol;
  if (protocol === "search_replace" || protocol === "unified_diff") return "edit_ready";
  return protocol === null ? "no_edit_format" : "unknown";
}
