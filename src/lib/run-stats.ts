import type { CheckEvidence, LocalApplyReceipt, LocalReceipt, LocalRunAttempt, LocalRunSummary, RunRecord } from "./local-run";
import { summarizeLocalRunUsage } from "./local-run-usage";

/** Same split as the engine record: review_ready verifies, review_unverified does not, the rest failed. */
export type RunOutcome = "verified" | "unverified" | "failed" | "stopped" | "running";

/** What one saved run proves, read only from its receipt and apply journal. */
export type RunFacts = {
  id: string;
  goal: string;
  model: string;
  repository: string | null;
  recordedAt: number | null;
  outcome: RunOutcome;
  state: string;
  /** The engine record counts runs that reached a model attempt. */
  counted: boolean;
  candidates: number;
  checksRun: number;
  checksPassed: number;
  inputTokens: number | null;
  outputTokens: number | null;
  /** Some replies did not report counters, so token totals are lower bounds. */
  tokensPartial: boolean;
  wallMs: number | null;
  origin: NonNullable<LocalReceipt["runtime_origin"]>;
  /** Candidate edits that failed a check and were kept out of the repository. */
  falseDones: number;
  firstTry: boolean;
  repaired: boolean;
  applied: boolean;
};

const ran = (check: CheckEvidence) => check.purpose !== "preparation" && (check.status === "passed" || check.status === "failed");

export function receiptOutcome(receipt: LocalReceipt): RunOutcome {
  if (!receipt.candidates.length && !receipt.hypotheses?.length) return "stopped";
  return receipt.state === "review_ready" ? "verified" : receipt.state === "review_unverified" ? "unverified" : "failed";
}

export function runFacts(summary: LocalRunSummary, saved: LocalReceipt | LocalRunAttempt, apply: LocalApplyReceipt | null = null): RunFacts {
  const base = { id: summary.id, goal: summary.goal, model: summary.model, recordedAt: summary.recorded_at_unix_ms || null };
  if (!("request" in saved)) {
    return { ...base, repository: null, outcome: saved.state === "started" ? "running" : "stopped", state: saved.state, counted: false, candidates: 0, checksRun: 0, checksPassed: 0,
      inputTokens: null, outputTokens: null, tokensPartial: false, wallMs: null, origin: "unknown", falseDones: 0, firstTry: false, repaired: false, applied: false };
  }
  const outcome = receiptOutcome(saved);
  // Baseline checks run on the untouched source; only candidate checks judge an edit.
  const checks = saved.candidates.flatMap(candidate => candidate.checks).filter(ran);
  const usage = summarizeLocalRunUsage(saved);
  const passed = outcome === "verified" ? saved.candidates.find(candidate => candidate.number === saved.selected_candidate) : undefined;
  return {
    ...base,
    goal: saved.request.goal || summary.goal,
    model: saved.profile.model || summary.model,
    repository: saved.request.repository || null,
    outcome,
    state: saved.state,
    counted: outcome !== "stopped",
    candidates: saved.candidates.length,
    checksRun: checks.length,
    checksPassed: checks.filter(check => check.status === "passed").length,
    inputTokens: usage.inputReported ? usage.inputTokens : null,
    outputTokens: usage.outputReported ? usage.outputTokens : null,
    tokensPartial: usage.attempts > 0 && (usage.inputReported < usage.attempts || usage.outputReported < usage.attempts || !usage.attemptsComplete),
    wallMs: Number.isFinite(saved.elapsed_ms) ? saved.elapsed_ms : null,
    origin: saved.runtime_origin ?? "unknown",
    falseDones: saved.candidates.filter(candidate => candidate.diff.trim() && candidate.checks.some(check => ran(check) && check.status === "failed")).length,
    firstTry: !!passed && saved.candidates[0]?.number === passed.number,
    repaired: passed?.decision?.action === "repair",
    applied: !!passed && apply?.state === "applied",
  };
}

export type Breakdown = { key: string; label: string; runs: number; verified: number; candidates: number; inputTokens: number; outputTokens: number; wallMs: number };

export type RunsSummary = {
  saved: number;
  counted: number;
  verified: number;
  unverified: number;
  failed: number;
  stopped: number;
  candidates: number;
  checksRun: number;
  checksPassed: number;
  inputTokens: number;
  outputTokens: number;
  tokensPartial: boolean;
  wallMs: number;
  falseDones: number;
  byRepo: Breakdown[];
  byModel: Breakdown[];
};

export const repositoryName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

function breakdown(facts: RunFacts[], keyOf: (fact: RunFacts) => string, labelOf: (key: string) => string): Breakdown[] {
  const rows = new Map<string, Breakdown>();
  for (const fact of facts) {
    const key = keyOf(fact);
    const row = rows.get(key) ?? { key, label: labelOf(key), runs: 0, verified: 0, candidates: 0, inputTokens: 0, outputTokens: 0, wallMs: 0 };
    row.runs++;
    if (fact.outcome === "verified") row.verified++;
    row.candidates += fact.candidates;
    row.inputTokens += fact.inputTokens ?? 0;
    row.outputTokens += fact.outputTokens ?? 0;
    row.wallMs += fact.wallMs ?? 0;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => b.runs - a.runs || b.verified - a.verified || a.label.localeCompare(b.label));
}

/** Totals over saved runs. Breakdowns count only runs the engine record counts. */
export function summarizeRuns(facts: RunFacts[]): RunsSummary {
  const finished = facts.filter(fact => fact.outcome !== "running");
  const counted = finished.filter(fact => fact.counted);
  const count = (outcome: RunOutcome) => finished.filter(fact => fact.outcome === outcome).length;
  const sum = (pick: (fact: RunFacts) => number | null) => finished.reduce((total, fact) => total + (pick(fact) ?? 0), 0);
  return {
    saved: finished.length,
    counted: counted.length,
    verified: count("verified"),
    unverified: count("unverified"),
    failed: count("failed"),
    stopped: count("stopped"),
    candidates: sum(fact => fact.candidates),
    checksRun: sum(fact => fact.checksRun),
    checksPassed: sum(fact => fact.checksPassed),
    inputTokens: sum(fact => fact.inputTokens),
    outputTokens: sum(fact => fact.outputTokens),
    tokensPartial: counted.some(fact => fact.tokensPartial || fact.inputTokens == null || fact.outputTokens == null),
    wallMs: sum(fact => fact.wallMs),
    falseDones: sum(fact => fact.falseDones),
    byRepo: breakdown(counted, fact => fact.repository ?? "unknown", key => key === "unknown" ? "unknown repository" : repositoryName(key)),
    byModel: breakdown(counted, fact => fact.model || "unknown", key => key),
  };
}

export type PersonalRecord = { id: string; label: string; value: number; unit: "ms" | "tokens" | "count"; runId: string | null };

/** Bests across saved receipts, plus the all-time best streak from the engine record. */
export function personalRecords(facts: RunFacts[], record: RunRecord | null): PersonalRecord[] {
  const verified = facts.filter(fact => fact.outcome === "verified");
  const best = (pick: (fact: RunFacts) => number | null, better: (a: number, b: number) => boolean) => {
    let found: { value: number; runId: string } | null = null;
    for (const fact of verified) {
      const value = pick(fact);
      if (value != null && (!found || better(value, found.value))) found = { value, runId: fact.id };
    }
    return found;
  };
  const out: PersonalRecord[] = [];
  if (record && record.best_streak > 0) out.push({ id: "best-streak", label: "best streak", value: record.best_streak, unit: "count", runId: null });
  const fastest = best(fact => fact.wallMs, (a, b) => a < b);
  if (fastest) out.push({ id: "fastest", label: "fastest verified run", ...fastest, unit: "ms" });
  const leanest = best(fact => fact.tokensPartial || fact.inputTokens == null || fact.outputTokens == null ? null : fact.inputTokens + fact.outputTokens, (a, b) => a < b);
  if (leanest) out.push({ id: "leanest", label: "fewest tokens to verify", ...leanest, unit: "tokens" });
  const hardest = best(fact => fact.candidates > 1 ? fact.candidates : null, (a, b) => a > b);
  if (hardest) out.push({ id: "hardest", label: "most candidates to a pass", ...hardest, unit: "count" });
  return out;
}

export type Achievement = { id: string; title: string; detail: string; earned: boolean; progress: { value: number; target: number } | null; runId: string | null; earnedAt: number | null };
/** Achievements already observed, kept so a bounded run list never takes one back. */
export type EarnedLog = Record<string, { runId: string | null; at: number | null }>;

const RECORD_GOALS: { id: string; title: string; detail: string; target: number; field: "verified_runs" | "best_streak" }[] = [
  { id: "first-verified", title: "First verified run", detail: "A candidate passed your checks.", target: 1, field: "verified_runs" },
  { id: "verified-10", title: "10 verified runs", detail: "Ten runs ended with a candidate that passed your checks.", target: 10, field: "verified_runs" },
  { id: "verified-50", title: "50 verified runs", detail: "Fifty runs ended with a candidate that passed your checks.", target: 50, field: "verified_runs" },
  { id: "streak-3", title: "3 in a row", detail: "Three verified runs with no unverified or failed run between them.", target: 3, field: "best_streak" },
  { id: "streak-10", title: "10 in a row", detail: "Ten verified runs with no unverified or failed run between them.", target: 10, field: "best_streak" },
];

const EVIDENCE_GOALS: { id: string; title: string; detail: string; test: (fact: RunFacts) => boolean }[] = [
  { id: "caught-false-done", title: "Caught a false done", detail: "A candidate edit failed your checks and stayed out of your repository.", test: fact => fact.falseDones > 0 },
  { id: "first-try", title: "Passed first try", detail: "The first candidate passed your checks.", test: fact => fact.firstTry },
  { id: "repaired", title: "Repaired to green", detail: "A candidate passed after a repair from failing check output.", test: fact => fact.repaired },
  { id: "landed", title: "Landed a verified change", detail: "You applied a candidate that passed your checks.", test: fact => fact.applied },
];

/** Achievements come only from the engine record and saved receipts; nothing is awarded for activity alone. */
export function achievements(record: RunRecord | null, facts: RunFacts[], log: EarnedLog = {}): { list: Achievement[]; log: EarnedLog } {
  const next: EarnedLog = { ...log };
  const list: Achievement[] = [];
  for (const goal of RECORD_GOALS) {
    const value = record ? record[goal.field] : null;
    if (value != null && value >= goal.target && !next[goal.id]) next[goal.id] = { runId: null, at: null };
    list.push({ id: goal.id, title: goal.title, detail: goal.detail, earned: !!next[goal.id], progress: value == null ? null : { value: Math.min(value, goal.target), target: goal.target }, runId: null, earnedAt: next[goal.id]?.at ?? null });
  }
  const oldestFirst = [...facts].sort((a, b) => (a.recordedAt ?? Infinity) - (b.recordedAt ?? Infinity));
  for (const goal of EVIDENCE_GOALS) {
    const first = oldestFirst.find(goal.test);
    if (first && !next[goal.id]) next[goal.id] = { runId: first.id, at: first.recordedAt };
    list.push({ id: goal.id, title: goal.title, detail: goal.detail, earned: !!next[goal.id], progress: null, runId: next[goal.id]?.runId ?? null, earnedAt: next[goal.id]?.at ?? null });
  }
  return { list, log: next };
}

export type DiffFile = { path: string; added: number; removed: number };

/** Files in a unified diff with their added and removed line counts. */
export function diffFiles(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  const clean = (path: string) => path.replace(/\t.*$/, "").replace(/^[ab]\//, "");
  let file: DiffFile | null = null;
  let from = "";
  let oldLeft = 0;
  let newLeft = 0;
  for (const line of diff.split("\n")) {
    if (file && (oldLeft > 0 || newLeft > 0)) {
      if (line.startsWith("+")) { file.added++; newLeft--; }
      else if (line.startsWith("-")) { file.removed++; oldLeft--; }
      else if (!line.startsWith("\\")) { oldLeft--; newLeft--; }
      continue;
    }
    if (line.startsWith("--- ")) from = clean(line.slice(4));
    else if (line.startsWith("+++ ")) {
      const to = clean(line.slice(4));
      file = { path: to === "/dev/null" ? from : to, added: 0, removed: 0 };
      files.push(file);
    } else if (file && line.startsWith("@@")) {
      const hunk = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/.exec(line);
      oldLeft = hunk ? Number(hunk[1] ?? 1) : 0;
      newLeft = hunk ? Number(hunk[2] ?? 1) : 0;
    }
  }
  return files;
}

/** The CLI receipt's wording: local inference is free only when Phonton manages the runtime. */
export const apiCostLabel = (origin: RunFacts["origin"]) => origin === "managed_verified" ? "$0.00 · managed local runtime" : "unpriced · runtime origin unknown";

export function formatDuration(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
  return `${Math.floor(seconds / 3600)}h ${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}m`;
}

export const LOOP_STAGES = ["goal", "plan", "edit", "verify", "review", "remember"] as const;
export type LoopStage = typeof LOOP_STAGES[number];
export type StageState = "done" | "active" | "fail" | "warn" | "todo";

/**
 * Where a goal stands in goal → plan → edit → verify → review → remember.
 * While the engine runs, edit and verify alternate until a candidate passes,
 * so both read as active until the receipt lands.
 */
export function loopStages(input: { goal: boolean; planning: boolean; planned: boolean; running: boolean; receipt: LocalReceipt | null; applied: LocalApplyReceipt | null }): Record<LoopStage, StageState> {
  const { receipt, running } = input;
  const final = receipt && !running ? receiptOutcome(receipt) : null;
  const started = running || !!receipt;
  const edited = (receipt?.candidates.length ?? 0) > 0;
  return {
    goal: input.goal || started ? "done" : "active",
    plan: input.planned || started ? "done" : input.planning ? "active" : "todo",
    edit: running ? "active" : !final ? "todo" : edited ? "done" : "fail",
    verify: running ? "active" : !final || !edited ? "todo" : final === "verified" ? "done" : final === "unverified" ? "warn" : "fail",
    review: final === "verified" || final === "unverified" ? input.applied?.state === "applied" || input.applied?.state === "rolled_back" ? "done" : "active" : "todo",
    remember: final ? "done" : "todo",
  };
}
