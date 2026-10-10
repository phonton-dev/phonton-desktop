import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/model-operation-request.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2021 },
}).outputText;
const { modelOperationRequest } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("model operations bind to the exact displayed endpoint and managed root", () => {
  const status = { endpoint: "http://127.0.0.1:11434", managed_storage: { root: "D:\\PhontonModels" } };
  assert.deepEqual(modelOperationRequest("install", "qwen3.5:4b", 4096, status), {
    kind: "install", model: "qwen3.5:4b", context: 4096,
    expected_endpoint: "http://127.0.0.1:11434",
    expected_storage_root: "D:\\PhontonModels",
  });
});

test("a missing displayed status cannot start a model operation", () => {
  assert.throws(() => modelOperationRequest("setup", "", null, null), /Refresh Local models/);
  assert.throws(() => modelOperationRequest("setup", "", null, { endpoint: "http://127.0.0.1:11434" }), /Refresh Local models/);
});
