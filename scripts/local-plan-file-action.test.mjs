import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/local-plan-file-action.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2021 },
}).outputText;
const { localPlanFileAction } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("ordinary existing-file plans label every scoped source as editable", () => {
  assert.equal(localPlanFileAction({ new_file: null, editable_existing: [] }, "src/main.ts"), "EDIT");
  assert.equal(localPlanFileAction({ editable_existing: [] }, "src/helper.ts"), "EDIT");
  assert.equal(localPlanFileAction({ new_file: null, editable_existing: ["src/main.ts"] }, "src/helper.ts"), "EDIT");
});

test("creation plans distinguish context-only source from reviewed existing edits", () => {
  const request = { new_file: "src/new.ts", editable_existing: ["src/main.ts"] };
  assert.equal(localPlanFileAction(request, "src/main.ts"), "EDIT");
  assert.equal(localPlanFileAction(request, "src/helper.ts"), "READ");
  assert.equal(localPlanFileAction({ new_file: "src/new.ts", editable_existing: [] }, "src/main.ts"), "READ");
});

test("the Desktop plan uses the authority label for every existing source path", () => {
  const workbench = readFileSync(new URL("../src/app/LocalWorkbench.tsx", import.meta.url), "utf8");
  assert.match(workbench, /localPlanFileAction\(plan\.request, file\.path\)/);
});
