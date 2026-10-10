import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/engine-capabilities.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2021 },
}).outputText;
const { supportsCatalogSnapshot, supportsLocalHarnessCapabilities } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const ready = {
  version: "0.21.1",
  handoff_schema: "1",
  local_models_schema: 2,
  local_model_operation_schema: 1,
  local_catalog_snapshot_schema: 2,
  local_storage_schema: 2,
  local_run_schema: 2,
  local_creation_schema: 1,
};

test("a bundled engine advertising every local API is ready", () => {
  assert.equal(supportsCatalogSnapshot(ready), true);
  assert.equal(supportsLocalHarnessCapabilities(ready), true);
});

test("an older engine without catalog snapshots is not ready for the local workbench", () => {
  const older = { ...ready, local_catalog_snapshot_schema: undefined };
  assert.equal(supportsCatalogSnapshot(older), false);
  assert.equal(supportsLocalHarnessCapabilities(older), false);
  assert.equal(supportsLocalHarnessCapabilities({ ...ready, local_catalog_snapshot_schema: 1 }), false);
});

test("a catalog-capable engine still needs the local run and storage APIs", () => {
  assert.equal(supportsLocalHarnessCapabilities({ ...ready, local_model_operation_schema: undefined }), false);
  assert.equal(supportsLocalHarnessCapabilities({ ...ready, local_storage_schema: undefined }), false);
  assert.equal(supportsLocalHarnessCapabilities({ ...ready, local_run_schema: undefined }), false);
});
