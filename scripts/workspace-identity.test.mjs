import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
const source = readFileSync(new URL("../src/lib/workspace-identity.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2021 } }).outputText;
const { workspacePathMatches } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
test("hosted and workspace configuration cannot use an unknown or different engine directory", () => {
  assert.equal(workspacePathMatches(null, "C:/project"), false);
  assert.equal(workspacePathMatches("C:/project", null), false);
  assert.equal(workspacePathMatches("C:/one", "C:/two"), false);
  assert.equal(workspacePathMatches("", ""), false);
});
test("Windows paths accept canonical prefixes and separators while POSIX case remains significant", () => {
  assert.equal(workspacePathMatches("C:/Project/", "\\\\?\\C:\\project"), true);
  assert.equal(workspacePathMatches("\\\\server\\share\\Project", "\\\\SERVER\\share\\project\\"), true);
  assert.equal(workspacePathMatches("/home/matt/Project", "/home/matt/project"), false);
  assert.equal(workspacePathMatches("/tmp/a\\b", "/tmp/a/b"), false);
  assert.equal(workspacePathMatches("//tmp/Project", "//tmp/project"), false);
  assert.equal(workspacePathMatches("/home/matt/project/", "/home/matt/project"), true);
});
