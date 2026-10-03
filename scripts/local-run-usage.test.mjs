import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/local-run-usage.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2021 },
}).outputText;
const { summarizeLocalRunUsage, tokenReading } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("run usage includes edit and strategy replies and distinguishes repairs from restarts", () => {
  const usage = summarizeLocalRunUsage({
    model_calls_reserved: 3,
    hypotheses: [{ input_tokens: 100, output_tokens: 20 }],
    candidates: [
      { input_tokens: 200, output_tokens: 50, decision: { action: "initial" } },
      { input_tokens: 300, output_tokens: 60, decision: { action: "repair" } },
    ],
  });
  assert.deepEqual(usage, { attempts: 3, attemptsComplete: true, inputTokens: 600, outputTokens: 130,
    inputReported: 3, outputReported: 3, repairs: 1, restarts: 0 });
  assert.equal(tokenReading(usage.outputTokens, usage.outputReported, usage.attempts, usage.attemptsComplete), "130");
});

test("interrupted calls and absent runtime counters never become exact zero-token totals", () => {
  const usage = summarizeLocalRunUsage({
    model_calls_reserved: 4,
    hypotheses: [{ input_tokens: null, output_tokens: 12 }],
    candidates: [{ input_tokens: 30, output_tokens: null, decision: { action: "restart" } }],
  });
  assert.equal(usage.attempts, 4);
  assert.equal(usage.inputReported, 1);
  assert.equal(usage.outputReported, 1);
  assert.equal(usage.restarts, 1);
  assert.equal(tokenReading(usage.inputTokens, usage.inputReported, usage.attempts, usage.attemptsComplete), "at least 30");
  assert.equal(tokenReading(usage.outputTokens, usage.outputReported, usage.attempts, usage.attemptsComplete), "at least 12");
  assert.equal(tokenReading(0, 0, usage.attempts, usage.attemptsComplete), "not reported");
});

test("older receipts without a call ledger count their saved replies without inventing more", () => {
  const usage = summarizeLocalRunUsage({
    hypotheses: [], candidates: [{ input_tokens: 7, output_tokens: 5 }],
  });
  assert.equal(usage.attempts, 1);
  assert.equal(usage.attemptsComplete, false);
  assert.equal(tokenReading(usage.outputTokens, usage.outputReported, usage.attempts, usage.attemptsComplete), "at least 5");
});
