import type { Page, Route } from "@playwright/test";

/**
 * A stateful stand-in for `phonton serve` on 127.0.0.1:47831. It answers the
 * JSON-RPC methods the local workbench calls with fixed data, so the UI can be
 * driven end to end without an engine, a model runtime or a repository.
 */

export type Scenario = "verified" | "rejected";

const REPOSITORY = "C:\\work\\todo-api";
const MODEL = "qwen3.5:9b";
const DIGEST = "6f3c0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f6071829304a5b6c7";
const PROFILE_SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f6071829304a5b6c7d8e9f";
const RUNTIME = "0.12.6";
const ENDPOINT = "http://127.0.0.1:11434";
const CHECK = { program: "npm", args: ["test"] };
const GiB = 1024 ** 3;

const hardware = {
  cpu: "AMD Ryzen 7 7840HS",
  logical_cpus: 16,
  ram_total_bytes: 32 * GiB,
  ram_available_bytes: 18.4 * GiB,
  gpus: [{ name: "NVIDIA GeForce RTX 4070 Laptop GPU", total_bytes: 8 * GiB, available_bytes: 7.1 * GiB }],
  warnings: [],
};

const profile = {
  digest: DIGEST,
  runtime_version: RUNTIME,
  context_tokens: 16384,
  output_tokens: 2048,
  protocol: "unified_diff",
  thinking: "off",
  probes: [
    { name: "unified_diff", status: "passed", detail: "Applied cleanly", output: "", input_tokens: 812, output_tokens: 96, elapsed_ms: 2140 },
    { name: "search_replace", status: "failed", detail: "Anchor did not match", output: "", input_tokens: 790, output_tokens: 88, elapsed_ms: 1980 },
  ],
  measured_at_unix: 1_791_000_000,
};

const fit = { status: "likely_fits_gpu", estimated_required_bytes: 7.0 * GiB, context_tokens: 16384, suggested_context: null, explanation: "Fits in 8.0 GiB VRAM at 16k context." };

const modelStatus = {
  schema: 2,
  hardware,
  endpoint: ENDPOINT,
  runtime_version: RUNTIME,
  runtime_error: null,
  active_model: MODEL,
  local_only: true,
  loopback_only: true,
  managed_runtime_supported: true,
  model_store: { status: "verified_managed", available_bytes: 210 * GiB, pid: 4242 },
  managed_storage: {
    root: "C:\\Users\\dev\\.phonton\\local",
    models_path: "C:\\Users\\dev\\.phonton\\local\\models",
    runs_path: "C:\\Users\\dev\\.phonton\\local\\runs",
    source: "default",
    available_bytes: 210 * GiB,
    runtime_installed: true,
    changeable: true,
    reason: null,
  },
  models: [{
    model: { name: MODEL, digest: DIGEST, size_bytes: 6.6 * GiB, quantization: "Q4_K_M", parameter_size: "9.7B" },
    fit,
    model_context_limit: 262144,
    context_error: null,
    profile,
    profile_sha256: PROFILE_SHA,
    creation_status: "passed",
  }],
};

const catalog = {
  hardware,
  models: [
    { name: "qwen3.5:9b", source: "ollama", download_bytes: 6.6 * GiB, fit, error: null, first_try_reason: "Fits this GPU with room for a 16k context." },
    { name: "gpt-oss:20b", source: "ollama", download_bytes: 13.8 * GiB, fit: { status: "cpu_or_offload", estimated_required_bytes: 15.2 * GiB, context_tokens: 16384, suggested_context: 8192, explanation: "Needs CPU offload on 8.0 GiB VRAM." }, error: null },
    { name: "qwen3.6:35b-a3b", source: "ollama", download_bytes: 23.9 * GiB, fit: { status: "insufficient_memory", estimated_required_bytes: 26.1 * GiB, context_tokens: 16384, suggested_context: null, explanation: "Needs about 26 GiB of memory." }, error: null },
  ],
};

const DIFF = `--- a/src/routes/todos.ts
+++ b/src/routes/todos.ts
@@ -18,7 +18,11 @@ export function listTodos(req: Request, res: Response) {
   const limit = Number(req.query.limit ?? 20);
-  const items = store.all().slice(0, limit);
+  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
+    return res.status(400).json({ error: "limit must be an integer from 1 to 100" });
+  }
+  const items = store.all().slice(0, limit);
   res.json({ items });
 }`;

function check(status: "passed" | "failed", stdout: string, ms: number) {
  return { check: CHECK, purpose: "verification", status, exit_code: status === "passed" ? 0 : 1, stdout, stderr: "", detail: status === "passed" ? "Exited 0" : "Exited 1", elapsed_ms: ms };
}

function candidate(number: number, passed: boolean, outputTokens: number) {
  return {
    number,
    stage: "complete",
    approach: number === 1 ? "Validate the limit query parameter" : "Clamp limit and reject non-integers",
    directory: `C:\\Users\\dev\\.phonton\\local\\runs\\run\\candidate-${number}`,
    content_sha256: passed ? "c0ffee00".repeat(8) : null,
    raw_output: DIFF,
    input_tokens: 5120 + number * 300,
    output_tokens: outputTokens,
    elapsed_ms: 18_400,
    checks: [passed
      ? check("passed", "PASS test/todos.test.ts\n  ✓ rejects limit=0 (4 ms)\n  ✓ rejects limit=abc (2 ms)\n  ✓ lists 20 by default (3 ms)\n\nTests: 3 passed, 3 total", 3120)
      : check("failed", "FAIL test/todos.test.ts\n  ✕ rejects limit=abc (5 ms)\n    Expected: 400\n    Received: 200\n\nTests: 1 failed, 2 passed, 3 total", 3310)],
    rejection: passed ? null : "Check failed: npm test exited 1 (1 failed, 2 passed).",
    diff: DIFF,
    decision: number === 1
      ? { action: "initial", parent_candidate: null, reason: "Started from captured source." }
      : { action: "repair", parent_candidate: 1, reason: "Repaired after the failing check output from candidate 1." },
  };
}

function receipt(id: string, goal: string, scenario: Scenario) {
  const verified = scenario === "verified";
  const candidates = [candidate(1, false, 212), verified ? candidate(2, true, 236) : candidate(2, false, 240)];
  return {
    id,
    state: verified ? "review_ready" : "no_verified_candidate",
    request: { goal, repository: REPOSITORY, files: ["src/routes/todos.ts"], new_file: null, editable_existing: [], checks: [CHECK], preparation: null },
    profile: { model: MODEL, digest: DIGEST, runtime_version: RUNTIME, endpoint: ENDPOINT, context_tokens: 16384, output_tokens: 2048, protocol: "unified_diff", thinking: "off" },
    runtime_origin: "managed_verified",
    hardware,
    resident_reuse: null,
    baseline_checks: [check("failed", "FAIL test/todos.test.ts\n  ✕ rejects limit=0\n  ✕ rejects limit=abc\n\nTests: 2 failed, 1 passed, 3 total", 3050)],
    candidates,
    selected_candidate: verified ? 2 : null,
    checks_used: 3,
    generated_tokens_reserved: 4096,
    model_calls_reserved: 2,
    elapsed_ms: 47_300,
    known_gaps: [
      "Checks ran without filesystem or network isolation.",
      "Only the selected check command was run; other behaviour is unverified.",
    ],
    contract: { acceptance_criteria: ["GET /todos rejects a limit outside 1–100 with HTTP 400.", "npm test passes."], likely_files: ["src/routes/todos.ts"] },
    git_index: { path: `${REPOSITORY}\\.git\\index`, before_sha256: "1".repeat(64), after_sha256: "1".repeat(64), status: "passed", stage: "final review", detail: "The Git index was unchanged from planning to final review." },
  };
}

export type MockEngine = {
  /** Every RPC method name the page called, in order. */
  calls: string[];
  /** The last params sent for each method. */
  params: Record<string, Record<string, unknown>>;
};

export type MockOptions = {
  scenario?: Scenario;
  /** Status polls that report the run as still running before the receipt lands. */
  runningPolls?: number;
  /** Show saved runs in the recent-runs list. */
  recentRuns?: boolean;
  /** Refuse every connection, as if no engine is listening. */
  offline?: boolean;
};

// The Vite preview origin from playwright.config.ts, the only page that calls the engine.
const cors = {
  "Access-Control-Allow-Origin": "http://127.0.0.1:4173",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export async function mockEngine(page: Page, options: MockOptions = {}): Promise<MockEngine> {
  const scenario = options.scenario ?? "verified";
  const engine: MockEngine = { calls: [], params: {} };
  let runId: string | null = null;
  let goal = "";
  let polls = 0;
  let applyStatus: Record<string, unknown> | null = null;

  const handlers: Record<string, (p: Record<string, unknown>) => unknown> = {
    ping: () => ({
      version: "0.25.0", handoff_schema: "4", local_models_schema: 2, local_model_operation_schema: 1,
      local_catalog_snapshot_schema: 2, local_endpoint_schema: 1, local_storage_schema: 2, local_run_schema: 2, local_creation_schema: 1,
    }),
    "models.status": () => modelStatus,
    "models.catalog.snapshot": () => catalog,
    "models.operation": () => null,
    "local.run.list": () => ({
      runs: options.recentRuns ? [
        { id: "0b6c1f0e-8f3a-4d7e-9a51-2c4b7d9e1f03", goal: "Return 404 for a missing todo id", model: MODEL, recorded_at_unix_ms: Date.UTC(2026, 9, 14, 16, 20) },
        { id: "5d2e7a91-1c44-4b0f-8e6a-7f3b9c2d4a18", goal: "Add a created_at field to new todos", model: MODEL, recorded_at_unix_ms: Date.UTC(2026, 9, 13, 9, 5) },
      ] : [],
      limited: false,
    }),
    "local.run.plan": (p) => {
      goal = String(p.goal ?? "");
      return {
        request: { goal, repository: p.repository, files: ["src/routes/todos.ts"], new_file: null, editable_existing: [], checks: [CHECK], preparation: null, approve_host_execution: false, budget: { generations: 4, check_runs: 16, wall_seconds: 600, generated_tokens: 4096 } },
        contract: { goal, acceptance_criteria: ["GET /todos rejects a limit outside 1–100 with HTTP 400.", "npm test passes."], likely_files: ["src/routes/todos.ts"] },
        files: [{ path: "src/routes/todos.ts", reason: "defines listTodos and reads the limit query", source_sha256: "9".repeat(64) }],
        creation: null,
        warnings: [],
        model_selection: { model: MODEL, digest: DIGEST, runtime_version: RUNTIME, endpoint: ENDPOINT, context_tokens: 16384, output_tokens: 2048, protocol: "unified_diff", profile_sha256: PROFILE_SHA },
      };
    },
    "local.run.start": (p) => { runId = String(p.id); polls = 0; applyStatus = null; return { id: runId }; },
    "local.run.status": () => {
      if (!runId) return { id: "", running: false, receipt: null, error: null };
      polls += 1;
      const running = polls <= (options.runningPolls ?? 1);
      return { id: runId, running, receipt: running ? null : receipt(runId, goal, scenario), error: null };
    },
    "local.run.read": (p) => receipt(String(p.id), goal || "Return 404 for a missing todo id", scenario),
    "local.run.has_evidence": () => true,
    "local.run.apply_status": () => applyStatus,
    "local.run.repository_match": () => ({ matches: true }),
    "local.run.apply": (p) => {
      applyStatus = { schema: 1, run_id: p.id, candidate_number: p.candidate_number, path: "src/routes/todos.ts", files: [{ path: "src/routes/todos.ts", before_sha256: "9".repeat(64), after_sha256: "c".repeat(64), backup: "backup-1", temporary: "tmp-1" }], state: "applied", detail: "Applied src/routes/todos.ts." };
      return applyStatus;
    },
    "local.run.rollback": (p) => {
      applyStatus = { schema: 1, run_id: p.id, candidate_number: p.candidate_number, path: "src/routes/todos.ts", files: [], state: "rolled_back", detail: "Restored the original bytes of src/routes/todos.ts from the run backup." };
      return applyStatus;
    },
    "local.run.cancel": () => ({ cancel_requested: true }),
    "config.get": () => ({ path: "C:\\Users\\dev\\.phonton\\config.toml", config: { provider: { name: "ollama", model: MODEL, has_api_key: false, base_url: ENDPOINT }, budget: { max_tokens: null, max_usd_cents: null }, index: { backend: "local" }, permissions: { mode: "ask" }, general: { enable_auto_update: true } } }),
    "tasks.list": () => ({ tasks: [] }),
  };

  await page.route("http://127.0.0.1:47831/**", async (route: Route) => {
    const request = route.request();
    if (options.offline) return route.abort("connectionrefused");
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (request.url().endsWith("/health")) return route.fulfill({ status: 200, body: "ok", headers: cors });
    const body = request.postDataJSON() as { id: number; method: string; params?: Record<string, unknown> };
    engine.calls.push(body.method);
    engine.params[body.method] = body.params ?? {};
    const handler = handlers[body.method];
    const reply = handler ? { result: handler(body.params ?? {}) } : { error: { message: `unknown method ${body.method}` } };
    return route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ jsonrpc: "2.0", id: body.id, ...reply }) });
  });
  return engine;
}

export const MOCK = { REPOSITORY, MODEL };

/** The model chooser button in the composer, e.g. "qwen3.5:9b ▾". */
export const MODEL_BUTTON = /^qwen3\.5:9b ▾$/;

/** Load the workbench against the mock engine, optionally with a repository already open. */
export async function openWorkbench(page: Page, options: MockOptions & { repository?: boolean } = {}): Promise<MockEngine> {
  if (options.repository !== false) {
    await page.addInitScript((repo) => localStorage.setItem("phonton.projects.active", repo), MOCK.REPOSITORY);
  }
  const engine = await mockEngine(page, options);
  await page.goto("/");
  return engine;
}
