import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/model-calibration-outcome.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2021 },
}).outputText;
const { calibrationOutcome } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("failed edit probes are reported as unusable after saved calibration", () => {
  assert.equal(calibrationOutcome({ kind: "calibrate", running: false, error: null, result: { protocol: null } }), "no_edit_format");
});

test("only a known measured edit format is ready", () => {
  assert.equal(calibrationOutcome({ kind: "calibrate", running: false, error: null, result: { protocol: "search_replace" } }), "edit_ready");
  assert.equal(calibrationOutcome({ kind: "calibrate", running: false, error: null, result: { protocol: "unified_diff" } }), "edit_ready");
  assert.equal(calibrationOutcome({ kind: "calibrate", running: false, error: null, result: { protocol: "unsupported" } }), "unknown");
});

test("running, failed and unrelated operations are not calibration results", () => {
  assert.equal(calibrationOutcome({ kind: "calibrate", running: true, error: null, result: null }), null);
  assert.equal(calibrationOutcome({ kind: "calibrate", running: false, error: "runtime stopped", result: null }), null);
  assert.equal(calibrationOutcome({ kind: "install", running: false, error: null, result: { protocol: null } }), null);
  assert.equal(calibrationOutcome({ kind: "calibrate", running: false, error: null, result: null }), "unknown");
});
