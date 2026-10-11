import type { LocalRequest } from "./local-run";

/** Label an existing source path with its reviewed plan authority. */
export function localPlanFileAction(
  request: Pick<LocalRequest, "new_file" | "editable_existing">,
  path: string,
): "EDIT" | "READ" {
  return request.new_file == null || request.editable_existing?.includes(path) ? "EDIT" : "READ";
}
