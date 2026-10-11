import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/model-operation-identity.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2021 },
}).outputText;
const { matchingModelOperation, canCancelModelOperation, readOwnedModelOperation, writeOwnedModelOperation } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("only the operation returned by the start request can be adopted", () => {
  const started = { id: "download-A", running: false, result: { installed: true } };
  const replaced = { id: "download-B", running: true, result: null };
  assert.equal(matchingModelOperation("download-A", started), started);
  assert.equal(matchingModelOperation("download-A", replaced), null);
  assert.equal(matchingModelOperation("download-A", { id: "", running: false }), null);
});

test("an externally observed operation remains visible but cannot be cancelled", () => {
  const external = { id: "download-B", running: true, cancelable: true };
  assert.equal(canCancelModelOperation(null, external), false);
  assert.equal(canCancelModelOperation("download-A", external), false);
  assert.equal(canCancelModelOperation("download-B", external), true);
  assert.equal(canCancelModelOperation("download-B", { ...external, running: false }), false);
  assert.equal(canCancelModelOperation("remove-A", { id: "remove-A", running: true, cancelable: false }), false);
});

test("a reloaded view restores cancellation only for its exact started operation", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
  writeOwnedModelOperation(storage, "download-A");
  const restored = readOwnedModelOperation(storage);
  assert.equal(restored, "download-A");
  assert.equal(canCancelModelOperation(restored, { id: "download-A", running: true, cancelable: true }), true);
  assert.equal(canCancelModelOperation(restored, { id: "download-B", running: true, cancelable: true }), false);
  writeOwnedModelOperation(storage, null);
  assert.equal(readOwnedModelOperation(storage), null);
});
