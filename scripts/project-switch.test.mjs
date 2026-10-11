import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/project-switch.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2021 },
}).outputText;
const { projectSwitchBlockReason } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const idle = { modelPageOpen: false, sessions: [] };
const noGoals = async () => ({ running: false, task_ids: [] });
const noRun = async () => ({ running: false });

test("switching projects waits for an active model operation", async () => {
  let aliveChecks = 0;
  const reason = await projectSwitchBlockReason(
    idle,
    async () => ({ running: true }),
    noGoals,
    noRun,
    async () => { aliveChecks++; return true; },
  );
  assert.match(reason, /model step is still running/);
  assert.equal(aliveChecks, 0);
});

test("a completed operation permits a project switch", async () => {
  assert.equal(await projectSwitchBlockReason(idle, async () => ({ running: false }), noGoals, noRun, async () => true), null);
});

test("an unreadable operation blocks switching while a child may still be working", async () => {
  const failedRead = async () => { throw new Error("temporarily disconnected"); };
  assert.match(await projectSwitchBlockReason(idle, failedRead, noGoals, noRun, async () => true), /cannot confirm/);
  assert.equal(await projectSwitchBlockReason(idle, failedRead, noGoals, noRun, async () => false), null);
});

test("a background session blocks the switch even when the selected session is idle", async () => {
  const state = { modelPageOpen: false, sessions: [{ running: true }, { running: false }] };
  const reason = await projectSwitchBlockReason(state, async () => ({ running: false }), noGoals, noRun, async () => false);
  assert.match(reason, /coding goal is still running/);
});

test("switching from the model page cannot race a newly admitted download", async () => {
  let read = false;
  const reason = await projectSwitchBlockReason(
    { modelPageOpen: true, sessions: [] },
    async () => { read = true; return { running: false }; },
    noGoals,
    noRun,
    async () => false,
  );
  assert.match(reason, /model step may still be starting/);
  assert.equal(read, false);
});

test("a goal still running in the engine blocks a switch after WebView reload", async () => {
  const reason = await projectSwitchBlockReason(
    idle,
    async () => ({ running: false }),
    async () => ({ running: true, task_ids: ["goal-A"] }),
    noRun,
    async () => true,
  );
  assert.match(reason, /coding goal is still running in the engine/);
});

test("a local workbench run survives a switch through Settings into the online shell", async () => {
  const reason = await projectSwitchBlockReason(
    idle,
    async () => ({ running: false }),
    noGoals,
    async () => ({ running: true }),
    async () => true,
  );
  assert.match(reason, /local coding run is still running/);
});
