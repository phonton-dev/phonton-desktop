import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/bundled-sidecar-start.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2021 },
}).outputText;
const { ensureBundledSidecar } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

function lifecycle(health, alive = true) {
  const calls = [];
  return {
    calls,
    sidecar: {
      health: async () => { calls.push("health"); return health; },
      spawn: async () => { calls.push("spawn"); },
      alive: async () => { calls.push("alive"); return alive; },
    },
  };
}

test("a healthy tracked engine survives a repeated connect", async () => {
  const { calls, sidecar } = lifecycle(true);
  await ensureBundledSidecar(true, sidecar);
  assert.deepEqual(calls, ["health"]);
});

test("Reconnect reaches the native lifecycle when a live child has no listener", async () => {
  const { calls, sidecar } = lifecycle(false);
  await ensureBundledSidecar(true, sidecar);
  assert.deepEqual(calls, ["health", "spawn", "alive"]);
});

test("a reloaded WebView asks native code to reuse its tracked child", async () => {
  const { calls, sidecar } = lifecycle(false);
  await ensureBundledSidecar(false, sidecar);
  assert.deepEqual(calls, ["spawn", "alive"]);
});

test("a failed child start is reported without stopping a concurrent replacement", async () => {
  const { calls, sidecar } = lifecycle(false, false);
  await assert.rejects(ensureBundledSidecar(false, sidecar), /exited during startup/);
  assert.deepEqual(calls, ["spawn", "alive"]);
});
