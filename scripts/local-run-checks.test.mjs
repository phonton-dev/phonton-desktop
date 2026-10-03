import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/local-run-checks.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2021 },
}).outputText;
const { parseLocalRunChecks, formatLocalRunCommand, displayLocalRunCommand } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("blank verification input leaves check inference to the engine", () => {
  assert.deepEqual(parseLocalRunChecks("  \n  "), []);
});

test("one-line command remains valid and four separate checks are preserved", () => {
  assert.deepEqual(parseLocalRunChecks('["python", "-m", "pytest"]'), [
    { program: "python", args: ["-m", "pytest"] },
  ]);
  const four = [
    '["cargo", "fmt", "--check"]',
    '',
    '["cargo", "test"]',
    '["python", "-m", "pytest"]',
    '["node", "--test"]',
  ].join("\n");
  assert.deepEqual(parseLocalRunChecks(four).map(check => check.program), ["cargo", "cargo", "python", "node"]);
});

test("malformed or excessive checks fail before preview", () => {
  assert.throws(() => parseLocalRunChecks(Array(5).fill('["python", "-m", "pytest"]').join("\n")), /at most four/i);
  assert.throws(() => parseLocalRunChecks('["python"]\nnot JSON'), /line 2/i);
  assert.throws(() => parseLocalRunChecks('[["python"]]'), /line 1/i);
  assert.throws(() => parseLocalRunChecks('["", "-m", "pytest"]'), /line 1/i);
  assert.throws(() => parseLocalRunChecks('["python", 1]'), /line 1/i);
});

test("review text preserves argument boundaries when an argument contains spaces", () => {
  assert.equal(
    formatLocalRunCommand({ program: "node", args: ["--test-name-pattern", "safe case"] }),
    '["node","--test-name-pattern","safe case"]',
  );
});

test("display form reads like a command line but stays exact", () => {
  assert.equal(displayLocalRunCommand({ program: "node", args: ["--test", "--test-reporter=tap"] }), "node --test --test-reporter=tap");
  assert.equal(displayLocalRunCommand({ program: "python", args: ["-k", "a b", ""] }), 'python -k "a b" ""');
});
