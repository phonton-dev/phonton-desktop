type ModelOperationState = { running: boolean };
type ActiveGoals = { running: boolean; task_ids: string[] };
type LocalRunState = { running: boolean };
type ProjectSwitchState = { modelPageOpen: boolean; sessions: readonly { running: boolean }[] };

/** Do not restart an engine whose model work may still be in progress. */
export async function projectSwitchBlockReason(
  state: ProjectSwitchState,
  readOperation: () => Promise<ModelOperationState>,
  readActiveGoals: () => Promise<ActiveGoals>,
  readLocalRun: () => Promise<LocalRunState>,
  engineAlive: () => Promise<boolean>,
): Promise<string | null> {
  if (state.modelPageOpen) return "Return to the workspace before switching projects. A model step may still be starting.";
  if (state.sessions.some(session => session.running)) return "A coding goal is still running. Finish or cancel it before switching projects.";
  try {
    const operation = await readOperation();
    if (typeof operation?.running !== "boolean") throw new Error("Invalid model operation state");
    if (operation.running) return "A model step is still running. Finish or cancel it before switching projects.";
    const goals = await readActiveGoals();
    if (typeof goals?.running !== "boolean" || !Array.isArray(goals.task_ids)) throw new Error("Invalid active goal state");
    if (goals.running) return "A coding goal is still running in the engine. Finish it before switching projects.";
    const localRun = await readLocalRun();
    if (typeof localRun?.running !== "boolean") throw new Error("Invalid local run state");
    return localRun.running
      ? "A local coding run is still running. Finish or cancel it before switching projects."
      : null;
  } catch {
    try {
      if (!await engineAlive()) return null;
    } catch {
      // An unknown engine state is still unsafe to interrupt.
    }
    return "Phonton cannot confirm whether engine work is running. Reconnect the engine before switching projects.";
  }
}
