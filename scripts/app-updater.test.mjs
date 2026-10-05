import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/app-updater.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
function harness(overrides = {}) {
  const calls = { check: 0, confirm: 0, install: 0, relaunch: 0 };
  const update = { version: '0.5.0', downloadAndInstall: async () => { calls.install++; } };
  const mocks = {
    '@tauri-apps/plugin-updater': { check: async () => { calls.check++; return overrides.check ? overrides.check(update) : update; } },
    '@tauri-apps/api/app': { getName: overrides.getName ?? (async () => 'Phonton') },
    '@tauri-apps/plugin-process': { relaunch: async () => { calls.relaunch++; } },
    './sidecar': { isTauri: () => true },
    './app-update-lock': { beginAppUpdate: () => () => {} },
    './app-update-safety': { ensureAppUpdateIdle: async () => {} },
  };
  const module = { exports: {} };
  const window = { confirm: () => { calls.confirm++; return overrides.confirm?.() ?? false; } };
  new Function('require', 'module', 'exports', 'window', compiled)(name => {
    assert.ok(mocks[name], `Unmocked dependency: ${name}`);
    return mocks[name];
  }, module, module.exports, window);
  return { api: module.exports, calls };
}

test('leaving online workspace before startup check prevents all updater activity', async () => {
  const { api, calls } = harness();
  const controller = new AbortController(); controller.abort();
  await api.checkForAppUpdateOnLaunch(controller.signal);
  assert.deepEqual(calls, { check: 0, confirm: 0, install: 0, relaunch: 0 });
});

test('leaving during native app lookup prevents the subsequent update request', async () => {
  const controller = new AbortController();
  const { api, calls } = harness({ getName: async () => { controller.abort(); return 'Phonton'; } });
  await api.checkForAppUpdateOnLaunch(controller.signal);
  assert.equal(calls.check, 0);
});

test('a late available update cannot prompt or install after returning to local work', async () => {
  const controller = new AbortController();
  const { api, calls } = harness({ check: async update => { controller.abort(); return update; }, confirm: () => true });
  await api.checkForAppUpdateOnLaunch(controller.signal);
  assert.deepEqual(calls, { check: 1, confirm: 0, install: 0, relaunch: 0 });
});

test('cancellation after confirmation still prevents installation', async () => {
  const controller = new AbortController();
  const { api, calls } = harness({ confirm: () => { controller.abort(); return true; } });
  await api.checkForAppUpdateOnLaunch(controller.signal);
  assert.deepEqual(calls, { check: 1, confirm: 1, install: 0, relaunch: 0 });
});

test('visible standard app can accept an update, while Preview never checks', async () => {
  const visible = harness({ confirm: () => true });
  await visible.api.checkForAppUpdateOnLaunch();
  assert.deepEqual(visible.calls, { check: 2, confirm: 1, install: 1, relaunch: 1 });
  const preview = harness({ getName: async () => 'Phonton Preview' });
  await preview.api.checkForAppUpdateOnLaunch();
  assert.deepEqual(preview.calls, { check: 0, confirm: 0, install: 0, relaunch: 0 });
});
