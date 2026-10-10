import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/shell-child-lifecycle.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2021 },
}).outputText;
const { spawnObservedShellChild } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

function mockCommand() {
  let close;
  let resolveSpawn;
  const handle = { kill: async () => {} };
  return {
    handle,
    close: () => close(),
    resolve: () => resolveSpawn(handle),
    command: {
      on: (_event, listener) => { close = listener; },
      spawn: () => new Promise(resolve => { resolveSpawn = resolve; }),
    },
  };
}

test("an exited shell child is cleared so Retry can spawn again", async () => {
  const process = mockCommand();
  let current = null;
  const pending = spawnObservedShellChild(process.command, () => current, value => { current = value; });
  process.resolve();
  await pending;
  assert.equal(current, process.handle);
  process.close();
  assert.equal(current, null);
});

test("a child that closes before spawn resolves never becomes current", async () => {
  const process = mockCommand();
  let current = null;
  const pending = spawnObservedShellChild(process.command, () => current, value => { current = value; });
  process.close();
  process.resolve();
  await pending;
  assert.equal(current, null);
});

test("an old child close cannot clear its replacement", async () => {
  const old = mockCommand();
  const newer = mockCommand();
  let current = null;
  const oldPending = spawnObservedShellChild(old.command, () => current, value => { current = value; });
  old.resolve();
  await oldPending;
  const newPending = spawnObservedShellChild(newer.command, () => current, value => { current = value; });
  newer.resolve();
  await newPending;
  old.close();
  assert.equal(current, newer.handle);
});
