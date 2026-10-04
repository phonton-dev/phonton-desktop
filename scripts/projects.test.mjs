import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/projects.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2021 },
}).outputText;
const store = new Map();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem: key => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: key => store.delete(key),
}});
globalThis.window = new EventTarget();
const projects = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("retained workspaces see the committed selection and history on every project change", () => {
  const local = [], online = [];
  const stopLocal = projects.subscribeActiveProject(() => local.push(projects.getActiveProject()));
  const stopOnline = projects.subscribeActiveProject(() => online.push({ active: projects.getActiveProject(), recent: projects.getRecentProjects() }));
  projects.setActiveProject("C:/fixtures/one");
  projects.setActiveProject("C:/fixtures/two");
  projects.clearActiveProject();
  assert.deepEqual(local, ["C:/fixtures/one", "C:/fixtures/two", null]);
  assert.deepEqual(online[1], { active: "C:/fixtures/two", recent: ["C:/fixtures/two", "C:/fixtures/one"] });
  assert.equal(online[2].active, null);
  stopLocal(); stopOnline();
  projects.setActiveProject("C:/fixtures/three");
  assert.equal(local.length, 3, "unmounted views must not keep a subscription");
  assert.equal(online.length, 3);
});
