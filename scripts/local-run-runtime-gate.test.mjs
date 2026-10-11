import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const identitySource = readFileSync(new URL("../src/lib/model-download-availability.ts", import.meta.url), "utf8");
const identityCompiled = ts.transpileModule(identitySource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2021 },
}).outputText;
const identityUrl = `data:text/javascript;base64,${Buffer.from(identityCompiled).toString("base64")}`;
const source = readFileSync(new URL("../src/lib/local-run-runtime-gate.ts", import.meta.url), "utf8")
  .replace('from "./model-download-availability"', `from "${identityUrl}"`);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2021 },
}).outputText;
const { localRunRuntimeGate, localRunRuntimePresentation, localRunPlanModelCurrent } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const managedEndpoint = "http://127.0.0.1:11434";

test("a managed launch identity error blocks goals instead of offering external-runtime consent", () => {
  const status = { endpoint: managedEndpoint, model_store: {
    status: "unverified", recovery_required: true, goal_run_blocked: true,
  } };
  assert.deepEqual(localRunRuntimeGate(status), { blocked: true, requiresConsent: false });
});

test("a missing managed receipt can still use the engine's explicit unverified-runtime path", () => {
  const status = { endpoint: managedEndpoint, model_store: {
    status: "unverified", recovery_required: true, goal_run_blocked: false,
  } };
  assert.deepEqual(localRunRuntimeGate(status), { blocked: false, requiresConsent: true });
});

test("older status without the new field fails closed for managed recovery", () => {
  const status = { endpoint: managedEndpoint, model_store: {
    status: "unverified", recovery_required: true,
  } };
  assert.deepEqual(localRunRuntimeGate(status), { blocked: true, requiresConsent: false });
});

test("ordinary managed, external and loading states keep their current consent behavior", () => {
  assert.deepEqual(localRunRuntimeGate({ endpoint: managedEndpoint, model_store: { status: "verified_managed" } }),
    { blocked: false, requiresConsent: false });
  assert.deepEqual(localRunRuntimeGate({ endpoint: "http://127.0.0.1:11435", model_store: { status: "unverified" } }),
    { blocked: false, requiresConsent: true });
  assert.deepEqual(localRunRuntimeGate(null), { blocked: false, requiresConsent: false });
});

test("the workspace gates both consent and Run on the runtime status", () => {
  const workbench = readFileSync(new URL("../src/app/LocalWorkbench.tsx", import.meta.url), "utf8");
  assert.match(workbench, /localRunRuntimeGate\(machine\)/);
  assert.match(workbench, /runtimeGate\.requiresConsent && <label/);
  assert.match(workbench, /disabled=\{[^}]*runtimeGate\.blocked/);
});

test("runtime presentation does not imply a connected model while status is missing or offline", () => {
  const offline = { endpoint: managedEndpoint, runtime_version: null, runtime_error: "connection refused", model_store: { status: "unverified" } };
  assert.deepEqual(localRunRuntimePresentation("connecting", null), {
    label: "○ Connecting engine", footer: "Connecting local engine", tone: "idle",
  });
  assert.deepEqual(localRunRuntimePresentation("offline", null), {
    label: "× Engine unavailable", footer: "Local engine unavailable", tone: "error",
  });
  assert.deepEqual(localRunRuntimePresentation("ready", null), {
    label: "○ Checking runtime", footer: "Checking local runtime", tone: "idle",
  });
  assert.deepEqual(localRunRuntimePresentation("ready", offline), {
    label: "× Runtime unavailable", footer: "Local model runtime unavailable", tone: "error",
  });
});

test("runtime presentation distinguishes connected managed, external, and recovery states", () => {
  const managed = { endpoint: managedEndpoint, runtime_version: "0.34.2", runtime_error: null,
    model_store: { status: "verified_managed" } };
  assert.deepEqual(localRunRuntimePresentation("ready", managed), {
    label: "● Managed runtime", footer: "Managed runtime connected", tone: "ready",
  });
  assert.deepEqual(localRunRuntimePresentation("ready", { ...managed, model_store: { status: "unverified" } }), {
    label: "● Loopback runtime", footer: "Loopback runtime connected · origin unverified", tone: "ready",
  });
  assert.deepEqual(localRunRuntimePresentation("ready", { ...managed, model_store: { status: "unverified", goal_run_blocked: true } }), {
    label: "× Runtime recovery", footer: "Managed runtime recovery required", tone: "error",
  });
});

test("a reviewed local plan needs the same live calibrated model and runtime", () => {
  const selection = { model: "coder:small", digest: "sha256:abc", runtime_version: "0.34.2",
    endpoint: managedEndpoint, context_tokens: 4096, output_tokens: 1024, protocol: "search_replace",
    profile_sha256: "first-calibration" };
  const profile = { digest: selection.digest, runtime_version: selection.runtime_version,
    context_tokens: selection.context_tokens, output_tokens: selection.output_tokens, protocol: selection.protocol };
  const ready = { endpoint: managedEndpoint, runtime_version: selection.runtime_version, runtime_error: null,
    active_model: selection.model, model_store: { status: "verified_managed" },
    models: [{ model: { name: selection.model, digest: selection.digest }, profile, profile_sha256: selection.profile_sha256 }] };
  assert.equal(localRunPlanModelCurrent(ready, selection), true);
  const alias = { ...ready, models: [{ ...ready.models[0], model: { ...ready.models[0].model, name: "library/coder:small" } }] };
  assert.equal(localRunPlanModelCurrent(alias, selection), true);
  assert.equal(localRunPlanModelCurrent({ ...alias, models: [...alias.models, ready.models[0]] }, selection), false);
  assert.equal(localRunPlanModelCurrent({ ...alias, models: [{ ...alias.models[0], model: { ...alias.models[0].model, name: "team/coder:small" } }] }, selection), false);
  assert.equal(localRunPlanModelCurrent({ ...ready, runtime_version: null, runtime_error: "connection refused" }, selection), false);
  assert.equal(localRunPlanModelCurrent({ ...ready, model_store: { status: "unverified", goal_run_blocked: true } }, selection), false);
  assert.equal(localRunPlanModelCurrent({ ...ready, active_model: "another:model" }, selection), false);
  assert.equal(localRunPlanModelCurrent({ ...ready, models: [{ ...ready.models[0], profile: { ...profile, context_tokens: 2048 } }] }, selection), false);
  assert.equal(localRunPlanModelCurrent({ ...ready, models: [{ ...ready.models[0], model: { name: selection.model, digest: "sha256:new" } }] }, selection), false);
  assert.equal(localRunPlanModelCurrent({ ...ready, models: [{ ...ready.models[0], profile_sha256: "second-calibration" }] }, selection), false);
  assert.equal(localRunPlanModelCurrent({ ...ready, endpoint: "http://127.0.0.1:11435" }, selection), false);
});
