import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/local-plan-budget.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2021 },
}).outputText;
const { localPlanBudgetSummary } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("approval summary reflects the actual reviewed budget, including non-default limits", () => {
  assert.equal(
    localPlanBudgetSummary({ generations: 2, check_runs: 9, generated_tokens: 2048, wall_seconds: 75 }),
    "2 model attempts, 9 check/setup executions, 2,048 reserved output tokens and 1 minute 15 seconds",
  );
  const workbench = readFileSync(new URL("../src/app/LocalWorkbench.tsx", import.meta.url), "utf8");
  assert.match(workbench, /localPlanBudgetSummary\(plan\.request\.budget\)/);
});

test("approval summary handles the default ten-minute budget", () => {
  assert.equal(
    localPlanBudgetSummary({ generations: 4, check_runs: 16, generated_tokens: 4096, wall_seconds: 600 }),
    "4 model attempts, 16 check/setup executions, 4,096 reserved output tokens and 10 minutes",
  );
});

test("approval summary uses singular labels for a one-attempt plan", () => {
  assert.equal(
    localPlanBudgetSummary({ generations: 1, check_runs: 1, generated_tokens: 128, wall_seconds: 60 }),
    "1 model attempt, 1 check/setup execution, 128 reserved output tokens and 1 minute",
  );
});
