import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/local-run-start.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2021 },
}).outputText;
const { createPendingLocalStart } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("Cancel during start uses the newly admitted run ID", async () => {
  let resolveStart;
  const startReply = new Promise(resolve => { resolveStart = resolve; });
  const calls = [];
  const pending = createPendingLocalStart("new-run");
  const admitted = startReply.then(reply => pending.admit(reply, async id => {
    calls.push(id);
    return { cancel_requested: true };
  }));

  pending.requestCancel();
  assert.deepEqual(calls, []);
  resolveStart({ id: "new-run" });
  assert.deepEqual(await admitted, { cancel_requested: true });
  assert.deepEqual(calls, ["new-run"]);
});

test("A mismatched start reply never cancels another run", () => {
  const pending = createPendingLocalStart("new-run");
  pending.requestCancel();
  assert.throws(() => pending.admit({ id: "old-run" }, async () => {
    throw new Error("must not cancel");
  }), /different run ID/);
});

test("Starting without a Cancel request sends no cancellation", () => {
  const pending = createPendingLocalStart("new-run");
  assert.equal(pending.admit({ id: "new-run" }, async () => {
    throw new Error("must not cancel");
  }), null);
});
