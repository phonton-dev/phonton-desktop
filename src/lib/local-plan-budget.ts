import type { LocalSearchBudget } from "./local-run";

function duration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes === 0) return `${remaining} ${remaining === 1 ? "second" : "seconds"}`;
  const minuteText = `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  return remaining === 0 ? minuteText : `${minuteText} ${remaining} ${remaining === 1 ? "second" : "seconds"}`;
}

export function localPlanBudgetSummary(budget: LocalSearchBudget): string {
  const attempt = budget.generations === 1 ? "model attempt" : "model attempts";
  const check = budget.check_runs === 1 ? "check/setup execution" : "check/setup executions";
  return `${budget.generations} ${attempt}, ${budget.check_runs} ${check}, ${budget.generated_tokens.toLocaleString("en-US")} reserved output tokens and ${duration(budget.wall_seconds)}`;
}
