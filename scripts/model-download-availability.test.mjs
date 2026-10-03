import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/model-download-availability.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2021 },
}).outputText;
const { canStartManagedRuntimeSetup, canStartModelDownload, isCatalogModelInstalled, managedModelStoragePlan, managedRuntimeRecovery, needsFreshRuntimeStorage, sameInstalledModel, storageShortfallSize, MANAGED_ENDPOINT } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("catalog download recognizes installed Ollama aliases without merging distinct namespaces", () => {
  const status = { models: [{ model: { name: "LIBRARY/FIXTURE:latest" } }] };
  assert.equal(isCatalogModelInstalled(status, "fixture:latest"), true);
  assert.equal(isCatalogModelInstalled(status, "registry.ollama.ai/library/fixture"), true);
  assert.equal(isCatalogModelInstalled(status, "team/fixture:latest"), false);
  assert.equal(isCatalogModelInstalled(status, "library/team/fixture:latest"), false);
  assert.equal(isCatalogModelInstalled(status, "bad//fixture"), false);
  assert.equal(isCatalogModelInstalled(null, "fixture:latest"), false);
  assert.equal(sameInstalledModel("fixture:latest", "LIBRARY/FIXTURE:latest"), true);
  assert.equal(sameInstalledModel("fixture:latest", "team/fixture:latest"), false);
  assert.equal(sameInstalledModel("fixture:latest", "library/team/fixture:latest"), false);
});

test("a stale managed launch disables model downloads", () => {
  const status = { endpoint: MANAGED_ENDPOINT, runtime_version: "0.34.2", runtime_error: null,
    model_store: { status: "unverified", recovery_required: true } };
  assert.equal(canStartModelDownload(status), false);
  assert.equal(canStartModelDownload({ ...status, model_store: { status: "verified_managed" } }), true);
});

test("external and unavailable runtimes retain their own download rules", () => {
  const status = { endpoint: "http://127.0.0.1:11435", runtime_version: "0.34.2", runtime_error: null,
    model_store: { status: "unverified", recovery_required: true } };
  assert.equal(canStartModelDownload(status), true);
  assert.equal(canStartModelDownload({ ...status, runtime_version: null }), false);
  assert.equal(canStartModelDownload({ ...status, runtime_error: "inventory failed" }), false);
  assert.equal(canStartModelDownload(null), false);
});

test("fresh managed setup points a low-space machine to another storage folder", () => {
  const status = { endpoint: MANAGED_ENDPOINT, runtime_version: null, managed_runtime_supported: true, storage_control: true,
    managed_storage: { available_bytes: 800_000_000, runtime_setup_min_free_bytes: 5_843_712_056, changeable: true, runtime_installed: false } };
  assert.equal(needsFreshRuntimeStorage(status), true);
  assert.equal(needsFreshRuntimeStorage({ ...status, managed_storage: { ...status.managed_storage, available_bytes: 5_843_712_056 } }), false);
  assert.equal(needsFreshRuntimeStorage({ ...status, managed_storage: { ...status.managed_storage, available_bytes: null } }), false);
  assert.equal(needsFreshRuntimeStorage({ ...status, managed_storage: { ...status.managed_storage, changeable: false } }), true);
  assert.equal(needsFreshRuntimeStorage({ ...status, managed_storage: { ...status.managed_storage, runtime_installed: true } }), false);
  assert.equal(needsFreshRuntimeStorage({ ...status, runtime_version: "0.34.2" }), false);
  assert.equal(needsFreshRuntimeStorage({ ...status, endpoint: "http://127.0.0.1:11435" }), false);
  assert.equal(needsFreshRuntimeStorage({ ...status, storage_control: false }), true);
});

test("an interrupted runtime download can retry after its owned partial stage lowers free space", () => {
  const status = { endpoint: MANAGED_ENDPOINT, runtime_version: null, managed_runtime_supported: true,
    managed_storage: { available_bytes: 5_800_000_000, runtime_setup_min_free_bytes: 5_843_712_056,
      changeable: false, runtime_installed: false } };
  assert.equal(needsFreshRuntimeStorage(status), true);
  assert.equal(managedRuntimeRecovery(status), null);
  assert.equal(canStartManagedRuntimeSetup(status), true);
  assert.equal(canStartManagedRuntimeSetup({ ...status,
    managed_storage: { ...status.managed_storage, changeable: true } }), false);
  const page = readFileSync(new URL("../src/pages/LocalModelsPage.tsx", import.meta.url), "utf8");
  assert.match(page, /disabled=\{busy \|\| catalogLoading \|\| !canStartManagedRuntimeSetup\(status\)\}/);
});

test("offline managed-storage recovery cannot start a fresh runtime setup", () => {
  const status = { endpoint: MANAGED_ENDPOINT, runtime_version: null, managed_runtime_supported: true,
    model_store: { status: "unverified", recovery_required: true, goal_run_blocked: true, setup_retryable: false,
      reason: "Chosen managed folder identity changed" },
    managed_storage: { available_bytes: 8_000_000_000, runtime_setup_min_free_bytes: 5_843_712_056,
      changeable: false, runtime_installed: true } };
  assert.equal(managedRuntimeRecovery(status), "blocked");
  assert.equal(canStartManagedRuntimeSetup(status), false);
});

test("an interrupted managed startup without a launch receipt can retry setup", () => {
  const status = { endpoint: MANAGED_ENDPOINT, runtime_version: null, managed_runtime_supported: true,
    model_store: { status: "unverified", recovery_required: true, goal_run_blocked: false, setup_retryable: true,
      reason: "Previously used managed folder has no verifiable launch receipt" },
    managed_storage: { available_bytes: 8_000_000_000, runtime_setup_min_free_bytes: 5_843_712_056,
      changeable: false, runtime_installed: true } };
  assert.equal(managedRuntimeRecovery(status), "retryable");
  assert.equal(canStartManagedRuntimeSetup(status), true);
  assert.equal(canStartManagedRuntimeSetup({ ...status, model_store: {
    ...status.model_store, setup_retryable: undefined,
  } }), false);
});

test("an offline stale regular receipt can retry setup while goal runs stay blocked", () => {
  const status = { endpoint: MANAGED_ENDPOINT, runtime_version: null, managed_runtime_supported: true,
    model_store: { status: "unverified", recovery_required: true, goal_run_blocked: true, setup_retryable: true,
      reason: "Managed runtime receipt is invalid" },
    managed_storage: { available_bytes: 8_000_000_000, runtime_setup_min_free_bytes: 5_843_712_056,
      changeable: false, runtime_installed: true } };
  assert.equal(managedRuntimeRecovery(status), "retryable");
  assert.equal(canStartManagedRuntimeSetup(status), true);
  assert.equal(managedRuntimeRecovery({ ...status, model_store: {
    ...status.model_store, setup_retryable: false,
  } }), "blocked");
});

test("Desktop shows the shared engine's model-specific disk plan", () => {
  const setupBytes = 5_843_712_056;
  const plan = { root: "C:\\models", available_bytes: 8_384_229_376,
    runtime_setup_min_free_bytes: setupBytes, model_download_bytes: 4_000_000_000,
    pull_reserve_bytes: 1024 ** 3, required_bytes: 10_917_453_880,
    shortfall_bytes: 2_533_224_504 };
  const model = { name: "example", download_bytes: 4_000_000_000, error: null, pre_setup_storage: plan };
  const status = { endpoint: MANAGED_ENDPOINT, runtime_version: null, managed_runtime_supported: true,
    managed_storage: { root: plan.root, available_bytes: 8_300_000_000, runtime_setup_min_free_bytes: setupBytes,
      changeable: true, runtime_installed: false } };
  assert.deepEqual(managedModelStoragePlan(status, model), {
    availableBytes: plan.available_bytes,
    requiredBytes: plan.required_bytes,
    shortfallBytes: plan.shortfall_bytes,
  });
});

test("pre-setup model guidance does not claim knowledge from missing or stale readings", () => {
  const model = { name: "example", download_bytes: 2_000_000_000, error: null,
    pre_setup_storage: { root: "C:\\models", available_bytes: 10_000_000_000,
      runtime_setup_min_free_bytes: 5_843_712_056, model_download_bytes: 2_000_000_000,
      pull_reserve_bytes: 1024 ** 3, required_bytes: 8_917_453_880, shortfall_bytes: 0 } };
  const status = { endpoint: MANAGED_ENDPOINT, runtime_version: null, managed_runtime_supported: true,
    managed_storage: { root: "C:\\models", available_bytes: 10_000_000_000, runtime_setup_min_free_bytes: 5_843_712_056,
      changeable: true, runtime_installed: false } };
  assert.equal(managedModelStoragePlan(null, model), null);
  assert.equal(managedModelStoragePlan({ ...status, endpoint: "http://127.0.0.1:11435" }, model), null);
  assert.equal(managedModelStoragePlan({ ...status, runtime_version: "0.34.2" }, model), null);
  assert.equal(managedModelStoragePlan({ ...status, managed_storage: { ...status.managed_storage, runtime_installed: true } }, model), null);
  assert.equal(managedModelStoragePlan({ ...status, managed_storage: { ...status.managed_storage, changeable: false } }, model), null);
  assert.equal(managedModelStoragePlan({ ...status, managed_storage: { ...status.managed_storage, reason: "Chosen folder is unavailable" } }, model), null);
  assert.equal(managedModelStoragePlan({ ...status, managed_storage: { ...status.managed_storage, root: "D:\\models" } }, model), null);
  assert.equal(managedModelStoragePlan(status, { ...model, pre_setup_storage: null }), null);
  assert.equal(managedModelStoragePlan(status, { ...model, error: "manifest unavailable" }), null);
  assert.equal(managedModelStoragePlan({ ...status, managed_storage: { ...status.managed_storage, runtime_setup_min_free_bytes: null } }, model), null);
});

test("displayed disk deficits cannot round down to zero", () => {
  assert.equal(storageShortfallSize(1), "1 MiB");
  assert.equal(storageShortfallSize(25 * 1024 ** 2), "25 MiB");
  assert.equal(storageShortfallSize(0.11 * 1024 ** 3), "0.2 GiB");
});
