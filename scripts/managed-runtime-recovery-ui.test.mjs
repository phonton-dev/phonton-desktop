import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const source = readFileSync(new URL("../src/pages/ManagedRuntimeRecovery.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const module = { exports: {} };
new Function("require", "module", "exports", compiled)(createRequire(import.meta.url), module, module.exports);
const { ManagedRuntimeRecovery } = module.exports;
const status = { runtime_version: null, managed_runtime_supported: true,
  managed_storage: { runtime_installed: true, changeable: false },
  model_store: { reason: "Managed runtime process 2944 is no longer inspectable: <OS error 87>" } };
const render = changes => renderToStaticMarkup(createElement(ManagedRuntimeRecovery, {
  status, recovery: "retryable", retryDisabled: false, refreshDisabled: false,
  onRetry: () => assert.fail("Rendering must not start setup"),
  onRefresh: () => assert.fail("Rendering must not refresh"), ...changes,
}));

test("offline recovery leads with an action and keeps its exact diagnostic in closed details", () => {
  const html = render();
  assert.match(html, /<h3 id="runtime-recovery-title">Start your local runtime<\/h3>/);
  assert.match(html, /data-managed-runtime-retry="true">Start runtime<\/button>/);
  const details = html.match(/<details class="runtime-recovery-details">[\s\S]*?<\/details>/)?.[0];
  assert.ok(details, "Diagnostic must be in a closed native disclosure");
  assert.match(details, /<summary>Technical details<\/summary>/);
  assert.ok(details.includes("&lt;OS error 87&gt;"));
  assert.ok(!html.replace(details, "").includes("2944"), "Primary copy must not expose the raw process diagnostic");
});

test("blocked, occupied and unsupported runtime states never offer a start action", () => {
  for (const props of [
    { recovery: "blocked" },
    { status: { ...status, runtime_version: "0.34.2" } },
    { status: { ...status, managed_runtime_supported: false } },
    { recovery: "blocked", status: { ...status, managed_storage: { ...status.managed_storage, changeable: true } } },
  ]) {
    const html = render(props);
    assert.ok(!html.includes("data-managed-runtime-retry"));
    assert.ok(html.includes("Refresh status"));
    assert.ok(html.includes("Technical details"));
  }
});

test("setup without an installed runtime keeps its retry action and storage guidance stays distinct", () => {
  const html = render({ status: { ...status, managed_storage: { runtime_installed: false } } });
  assert.ok(html.includes("Finish runtime setup"));
  assert.ok(html.includes("Retry runtime setup"));
  assert.ok(!html.includes(">Start runtime</button>"));
  const blocked = render({ recovery: "blocked", status: { ...status, storage_control: true, managed_storage: { changeable: true } } });
  assert.ok(blocked.includes("Choose a local storage folder"));
  assert.ok(blocked.includes("Choose another empty storage folder above"));
  const unavailable = render({ recovery: "blocked", status: { ...status, storage_control: false, managed_storage: { changeable: true } } });
  assert.ok(!unavailable.includes("Choose another empty storage folder above"));
});

test("parent busy and readiness gates remain reflected in the rendered actions", () => {
  const html = render({ retryDisabled: true, refreshDisabled: true });
  assert.match(html, /data-managed-runtime-retry="true" disabled="">Start runtime<\/button>/);
  assert.match(html, /<button disabled="">Refresh status<\/button>/);
});
