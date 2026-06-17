/** Typed mirrors of phonton-types GlobalState / HandoffPacket for desktop UI. */

export type TaskStatus =
  | "Queued"
  | "Planning"
  | { Running: { active_subtasks: string[]; completed: number; total: number } }
  | { Reviewing: { tokens_used: number; estimated_savings_tokens: number } }
  | { Done: { tokens_used: number; wall_time_ms: number } }
  | { Failed: { reason: string; failed_subtask?: string | null } }
  | { Paused: { limit: string; observed: number; ceiling: number } }
  | "Rejected";

export type SubtaskStatus =
  | "Queued"
  | "Ready"
  | "Dispatched"
  | { Running: { model_tier: string; tokens_so_far: number } }
  | { Verifying: { model_tier: string; attempt: number } }
  | { Done: { tokens_used: number; diff_hunk_count: number } }
  | { Failed: { reason: string; attempts: number; escalations: number } }
  | string;

export type WorkerState = {
  subtask_id: string;
  subtask_description: string;
  model_tier: string;
  tokens_used: number;
  status: SubtaskStatus;
  is_thinking?: boolean;
};

export type GoalContract = {
  goal: string;
  task_class: string;
  confidence_percent: number;
  acceptance_criteria: string[];
  expected_artifacts: { description: string; path?: string | null }[];
  likely_files: string[];
  verify_plan: { name: string; layer?: string | null; command?: unknown }[];
  run_plan: { label: string; command: string[]; cwd?: string | null }[];
  quality_floor: { criteria: string[] };
  clarification_questions: string[];
  assumptions: string[];
};

export type HandoffPacket = {
  schema_version?: string;
  task_id: string;
  goal: string;
  headline: string;
  changed_files: {
    path: string;
    added_lines: number;
    removed_lines: number;
    summary: string;
  }[];
  generated_artifacts: { path: string; description: string }[];
  diff_stats: { files_changed: number; added_lines: number; removed_lines: number };
  verification: {
    passed: string[];
    findings: string[];
    skipped: string[];
  };
  run_commands: { label: string; command: string[]; cwd?: string | null }[];
  known_gaps: string[];
  review_actions: { label: string; description: string }[];
  rollback_points: { seq: number; label: string }[];
  token_usage: {
    input_tokens?: number;
    output_tokens?: number;
    cached_tokens?: number;
    total_tokens?: number;
  };
  influence: {
    memories: string[];
    index_slices: string[];
    skills: string[];
    extensions: string[];
  };
};

export type GlobalState = {
  task_status: TaskStatus;
  goal_contract?: GoalContract | null;
  handoff_packet?: HandoffPacket | null;
  active_workers: WorkerState[];
  tokens_used: number;
  tokens_budget?: number | null;
  estimated_naive_tokens: number;
};

export type OrchestratorEvent = {
  kind?: string;
  timestamp_ms?: number;
  event?: Record<string, unknown>;
};

export function parseGlobalState(raw: unknown): GlobalState | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!("task_status" in o)) return null;
  return raw as GlobalState;
}

export function parseHandoffPacket(raw: unknown): HandoffPacket | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.headline !== "string") return null;
  return raw as HandoffPacket;
}

export function taskStatusLabel(status: TaskStatus | undefined): string {
  if (!status) return "Unknown";
  if (typeof status === "string") return status;
  if ("Running" in status) return `Running ${status.Running.completed}/${status.Running.total}`;
  if ("Reviewing" in status) return "Review ready";
  if ("Done" in status) return "Done";
  if ("Failed" in status) return "Failed";
  if ("Paused" in status) return "Paused";
  return "Unknown";
}

export function taskStatusTone(
  status: TaskStatus | undefined,
): "default" | "success" | "warning" | "destructive" {
  if (!status) return "default";
  if (typeof status === "string") {
    if (status === "Planning" || status === "Queued") return "default";
    if (status === "Rejected") return "destructive";
    return "default";
  }
  if ("Running" in status || "Reviewing" in status) return "warning";
  if ("Done" in status) return "success";
  if ("Failed" in status || "Paused" in status) return "destructive";
  return "default";
}

export function formatEventLine(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as OrchestratorEvent;
    const kind = parsed.kind ?? parsed.event?.kind ?? "event";
    const ts = parsed.timestamp_ms
      ? new Date(parsed.timestamp_ms).toLocaleTimeString()
      : "";
    return ts ? `[${ts}] ${kind}` : String(kind);
  } catch {
    return raw;
  }
}

export function subtaskStatusLabel(status: SubtaskStatus): string {
  if (typeof status === "string") return status;
  if ("Running" in status) return "Running";
  if ("Verifying" in status) return `Verifying (${status.Verifying.attempt})`;
  if ("Done" in status) return "Done";
  if ("Failed" in status) return "Failed";
  return "Unknown";
}
