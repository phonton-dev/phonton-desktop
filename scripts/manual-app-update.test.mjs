import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function harness(results) {
  let index = 0;
  const states = [], calls = [];
  const react = { useEffect: () => {}, useSyncExternalStore: (_subscribe, snapshot) => snapshot(), useState: initial => {
    const slot = index++;
    if (!(slot in states)) states[slot] = typeof initial === 'function' ? initial() : initial;
    return [states[slot], value => { states[slot] = typeof value === 'function' ? value(states[slot]) : value; }];
  } };
  const updater = { checkForAppUpdate: async options => {
    calls.push(options); const next = results.shift();
    assert.ok(next, 'Unexpected update request');
    return typeof next === 'function' ? next(options) : next;
  } };
  function load(file) {
    const module = { exports: {} };
    new Function('require', 'module', 'exports', compile(file))(name => {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return require(name);
      if (name === '@tauri-apps/api/app') return { getVersion: async () => '0.4.0-beta.1' };
      if (name.endsWith('/sidecar')) return { isTauri: () => true };
      if (name.endsWith('/app-updater')) return updater;
      if (name.endsWith('/useManualAppUpdate')) return load('../src/hooks/useManualAppUpdate.ts');
      throw new Error(`Unmocked dependency: ${name}`);
    }, module, module.exports);
    return module.exports;
  }
  const { SetupStepWelcome } = load('../src/components/setup/SetupStepWelcome.tsx');
  function render() { index = 0; return SetupStepWelcome({ onGetStarted() {} }); }
  const text = value => typeof value === 'string' || typeof value === 'number' ? String(value)
    : Array.isArray(value) ? value.map(text).join('') : value?.props ? text(value.props.children) : '';
  function find(value, label) {
    if (!value) return;
    if (Array.isArray(value)) return value.map(child => find(child, label)).find(Boolean);
    if (value.type === 'button' && text(value.props.children) === label) return value;
    return find(value.props?.children, label);
  }
  return { render, text, button: label => find(render(), label), calls, remount: () => { states.length = 0; } };
}

test('withdrawn update releases the actual setup buttons and clears its stale install action', async () => {
  const view = harness([{ status: 'available', version: '0.5.0' }, { status: 'current' }]);
  await view.button('Check for updates').props.onClick();
  assert.ok(view.button('Update to v0.5.0'));
  await view.button('Update to v0.5.0').props.onClick();
  assert.equal(view.button('Check for updates')?.props.disabled, false);
  assert.equal(view.button('Update to v0.5.0'), undefined);
  assert.match(view.text(view.render()), /no longer available/i);
  assert.equal(view.calls[1].install, true);
});

test('progress disables both controls, a signature failure permits retry, and successful completion clears availability', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const view = harness([{ status: 'available', version: '0.5.0' }, options => {
    options.onProgress(47); return pending;
  }, { status: 'installed', version: '0.5.0' }]);
  await view.button('Check for updates').props.onClick();
  const installing = view.button('Update to v0.5.0').props.onClick();
  assert.equal(view.button('Installing…').props.disabled, true);
  assert.equal(view.button('Check for updates').props.disabled, true);
  assert.match(view.text(view.render()), /Downloading update… 47%/);
  view.remount();
  assert.equal(view.button('Installing…').props.disabled, true, 'Remounted controls must retain the active installation');
  await view.button('Check for updates').props.onClick();
  assert.equal(view.calls.length, 2, 'A busy controller cannot start another request');
  finish({ status: 'error', message: 'Signature verification failed' });
  await installing;
  assert.equal(view.button('Update to v0.5.0').props.disabled, false);
  assert.match(view.text(view.render()), /Signature verification failed/);
  await view.button('Update to v0.5.0').props.onClick();
  assert.equal(view.button('Update to v0.5.0'), undefined);
  assert.equal(view.button('Check for updates').props.disabled, false);
  assert.match(view.text(view.render()), /installed. Restarting/);
});

test('skipped or unexpectedly rejected installation leaves usable controls and an honest status', async () => {
  for (const failure of [{ status: 'skipped' }, () => { throw new Error('Transport unavailable'); }]) {
    const view = harness([{ status: 'available', version: '0.5.0' }, failure]);
    await view.button('Check for updates').props.onClick();
    await view.button('Update to v0.5.0').props.onClick();
    assert.equal(view.button('Check for updates').props.disabled, false);
    assert.match(view.text(view.render()), /unavailable/i);
    if (typeof failure !== 'function') assert.equal(view.button('Update to v0.5.0'), undefined);
  }
});
