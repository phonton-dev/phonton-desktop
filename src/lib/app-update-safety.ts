import { rpc } from "./serve";
import { sidecarProcessAliveStrict } from "./sidecar";

/** The caller holds the update lock, so this UI cannot admit new engine work. */
export async function ensureAppUpdateIdle(): Promise<void> {
  try {
    // Unlike the UI's best-effort connection indicator, an invocation failure
    // here is unknown state, never evidence that the owned engine is absent.
    const alive = await sidecarProcessAliveStrict();
    if (!alive) return;
    const operation = await rpc<{ running: boolean }>("models.operation");
    if (typeof operation?.running !== "boolean") throw new Error("Invalid model state");
    if (operation.running) throw new ActiveWorkError("A model step is running. Finish or cancel it before updating Phonton.");
    const goals = await rpc<{ running: boolean; task_ids: string[] }>("goal.active");
    if (typeof goals?.running !== "boolean" || !Array.isArray(goals.task_ids)) throw new Error("Invalid goal state");
    if (goals.running || goals.task_ids.length) throw new ActiveWorkError("A coding goal is running. Finish or cancel it before updating Phonton.");
    const local = await rpc<{ running: boolean }>("local.run.status");
    if (typeof local?.running !== "boolean") throw new Error("Invalid local run state");
    if (local.running) throw new ActiveWorkError("A local coding run is running. Finish or cancel it before updating Phonton.");
  } catch (error) {
    if (error instanceof ActiveWorkError) throw error;
    throw new Error("Phonton cannot confirm that engine work has finished. Reconnect the engine and try updating again.");
  }
}

class ActiveWorkError extends Error {}
