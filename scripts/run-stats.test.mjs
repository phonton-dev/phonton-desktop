import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const load = (path, replace = (s) => s) => {
  const source = replace(readFileSync(new URL(path, import.meta.url), "utf8"));
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2021 } }).outputText;
  return `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
};
const usageUrl = load("../src/lib/local-run-usage.ts");
const { runFacts, summarizeRuns, personalRecords, achievements, diffFiles, loopStages, apiCostLabel, formatDuration } = await import(
  load("../src/lib/run-stats.ts", (s) => s.replace('from "./local-run-usage"', `from "${usageUrl}"`)));

const check = (status, purpose = "verification") => ({ check: { program: "npm", args: ["test"] }, purpose, status, exit_code: status === "passed" ? 0 : 1, stdout: "", stderr: "", detail: "", elapsed_ms: 10 });
const DIFF = "--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,2 +1,3 @@\n keep\n-old\n+new\n+more\n--- /dev/null\n+++ b/src/new.ts\n@@ -0,0 +1,2 @@\n+one\n+two";
const candidate = (number, passed, action = number === 1 ? "initial" : "repair") => ({
  number, approach: "", directory: "", content_sha256: passed ? "a".repeat(64) : null, raw_output: "", input_tokens: 100, output_tokens: 20, elapsed_ms: 5,
  checks: [check(passed ? "passed" : "failed")], rejection: passed ? null : "Check failed", diff: DIFF, decision: { action, parent_candidate: number > 1 ? number - 1 : null, reason: "" },
});
const receipt = (id, { state = "review_ready", candidates = [candidate(1, false), candidate(2, true)], selected = 2, repository = "C:\\work\\api", model = "qwen3.5:9b", elapsed = 40_000, origin = "managed_verified" } = {}) => ({
  id, state, request: { goal: `goal ${id}`, repository, files: [] }, profile: { model, digest: "", runtime_version: "", endpoint: "", context_tokens: 0, output_tokens: 0, protocol: null },
  runtime_origin: origin, hardware: null, baseline_checks: [check("failed"), check("passed", "preparation")], candidates, hypotheses: [], selected_candidate: selected, checks_used: 3,
  generated_tokens_reserved: 0, model_calls_reserved: candidates.length, elapsed_ms: elapsed, known_gaps: [],
});
const summary = (id, at) => ({ id, goal: `goal ${id}`, model: "qwen3.5:9b", recorded_at_unix_ms: at });
const record = (verified_runs, best_streak) => ({ runs: verified_runs + 1, verified_runs, streak: 0, best_streak, local_tokens: 0, cloud_tokens: 0, unknown_tokens: 0 });

test("a repaired verified run counts its checks, tokens, caught false done and apply", () => {
  const facts = runFacts(summary("a", 1), receipt("a"), { state: "applied" });
  assert.equal(facts.outcome, "verified");
  assert.equal(facts.counted, true);
  assert.deepEqual([facts.candidates, facts.checksRun, facts.checksPassed], [2, 2, 1], "baseline and preparation runs do not judge an edit");
  assert.deepEqual([facts.inputTokens, facts.outputTokens, facts.tokensPartial], [200, 40, false]);
  assert.deepEqual([facts.falseDones, facts.firstTry, facts.repaired, facts.applied], [1, false, true, true]);
  assert.equal(facts.repository, "C:\\work\\api");
});

test("outcomes follow the engine record, and runs without a model attempt are not counted", () => {
  assert.equal(runFacts(summary("u", 1), receipt("u", { state: "review_unverified", candidates: [candidate(1, true)], selected: 1 })).outcome, "unverified");
  assert.equal(runFacts(summary("f", 1), receipt("f", { state: "budget_exhausted", selected: null })).outcome, "failed");
  const stopped = runFacts(summary("s", 1), receipt("s", { state: "resource_pressure", candidates: [], selected: null }));
  assert.deepEqual([stopped.outcome, stopped.counted], ["stopped", false]);
  const attempt = runFacts(summary("x", 1), { schema: 1, id: "x", goal: "g", model: "m", state: "ended_before_receipt", error: "boom" });
  assert.deepEqual([attempt.outcome, attempt.counted, attempt.inputTokens], ["stopped", false, null]);
  assert.equal(runFacts(summary("r", 1), { schema: 1, id: "r", goal: "g", model: "m", state: "started", error: null }).outcome, "running");
  const unreported = runFacts(summary("n", 1), receipt("n", { candidates: [{ ...candidate(1, true), input_tokens: null, output_tokens: null }], selected: 1 }));
  assert.deepEqual([unreported.inputTokens, unreported.tokensPartial, unreported.firstTry], [null, true, true]);
});

test("summaries break down counted runs by repository and model", () => {
  const facts = [
    runFacts(summary("a", 3), receipt("a")),
    runFacts(summary("b", 2), receipt("b", { state: "no_verified_candidate", selected: null, repository: "/home/me/web", model: "gpt-oss:20b" })),
    runFacts(summary("c", 1), receipt("c", { candidates: [candidate(1, true)], selected: 1, elapsed: 9_000 })),
    runFacts(summary("s", 0), receipt("s", { state: "resource_pressure", candidates: [], selected: null })),
  ];
  const s = summarizeRuns(facts);
  assert.deepEqual([s.saved, s.counted, s.verified, s.failed, s.stopped], [4, 3, 2, 1, 1]);
  assert.deepEqual([s.candidates, s.inputTokens, s.outputTokens, s.falseDones], [5, 500, 100, 2]);
  assert.deepEqual(s.byRepo.map(r => [r.label, r.runs, r.verified]), [["api", 2, 2], ["web", 1, 0]]);
  assert.deepEqual(s.byModel.map(r => [r.label, r.runs, r.verified]), [["qwen3.5:9b", 2, 2], ["gpt-oss:20b", 1, 0]]);
  const bests = personalRecords(facts, record(2, 2));
  assert.deepEqual(bests.map(b => [b.id, b.value, b.runId]), [["best-streak", 2, null], ["fastest", 9_000, "c"], ["leanest", 120, "c"], ["hardest", 2, "a"]]);
  assert.deepEqual(personalRecords([], null), []);
});

test("achievements need real outcomes and stay earned once observed", () => {
  const none = achievements(record(0, 0), []);
  assert.equal(none.list.some(a => a.earned), false, "no runs earn nothing");
  assert.deepEqual(none.list.find(a => a.id === "verified-10").progress, { value: 0, target: 10 });

  const facts = [runFacts(summary("late", 20), receipt("late")), runFacts(summary("early", 10), receipt("early"))];
  const { list, log } = achievements(record(12, 3), facts);
  const earned = Object.fromEntries(list.map(a => [a.id, a.earned]));
  assert.deepEqual(earned, { "first-verified": true, "verified-10": true, "verified-50": false, "streak-3": true, "streak-10": false,
    "caught-false-done": true, "first-try": false, repaired: true, landed: false });
  assert.deepEqual(list.find(a => a.id === "caught-false-done").runId, "early", "the oldest qualifying receipt earns it");
  assert.deepEqual(list.find(a => a.id === "streak-10").progress, { value: 3, target: 10 });

  // The run list is bounded: once observed, an achievement survives its receipt leaving the list.
  const later = achievements(null, [], log);
  assert.equal(later.list.find(a => a.id === "repaired").earned, true);
  assert.equal(later.list.find(a => a.id === "repaired").runId, "early");
  assert.equal(later.list.find(a => a.id === "verified-10").progress, null, "no record, no invented progress");
});

test("diff files count added and removed lines, including created files", () => {
  assert.deepEqual(diffFiles(DIFF), [{ path: "src/a.ts", added: 2, removed: 1 }, { path: "src/new.ts", added: 2, removed: 0 }]);
  assert.deepEqual(diffFiles(""), []);
});

test("the loop shows edit and verify alternating while running, then the outcome", () => {
  const base = { goal: true, planning: false, planned: true, running: false, receipt: null, applied: null };
  assert.deepEqual(loopStages({ ...base, goal: false, planned: false }), { goal: "active", plan: "todo", edit: "todo", verify: "todo", review: "todo", remember: "todo" });
  assert.equal(loopStages({ ...base, planned: false, planning: true }).plan, "active");
  const running = loopStages({ ...base, running: true });
  assert.deepEqual([running.edit, running.verify, running.remember], ["active", "active", "todo"]);
  const verified = loopStages({ ...base, receipt: receipt("v") });
  assert.deepEqual([verified.edit, verified.verify, verified.review, verified.remember], ["done", "done", "active", "done"]);
  assert.equal(loopStages({ ...base, receipt: receipt("v"), applied: { state: "applied" } }).review, "done");
  const failed = loopStages({ ...base, receipt: receipt("f", { state: "no_verified_candidate", selected: null }) });
  assert.deepEqual([failed.verify, failed.review], ["fail", "todo"]);
  assert.equal(loopStages({ ...base, receipt: receipt("u", { state: "review_unverified", candidates: [candidate(1, true)], selected: 1 }) }).verify, "warn");
});

test("cost and duration read like the CLI receipt", () => {
  assert.equal(apiCostLabel("managed_verified"), "$0.00 · managed local runtime");
  assert.equal(apiCostLabel("external_unverified"), "unpriced · runtime origin unknown");
  assert.deepEqual([formatDuration(41_250), formatDuration(192_000), formatDuration(3_900_000)], ["41.3s", "3m 12s", "1h 05m"]);
});
