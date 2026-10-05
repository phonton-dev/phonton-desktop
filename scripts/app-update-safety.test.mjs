import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const compiled = Object.fromEntries(['app-updater', 'app-update-lock', 'app-update-safety', 'serve', 'sidecar', 'shell-child-lifecycle'].map(name => [name,
  ts.transpileModule(readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  }).outputText]));
function harness(overrides = {}) {
  const calls = { check: 0, install: 0, relaunch: 0, rpc: [] };
  const defaults = { 'models.operation': { running: false }, 'goal.active': { running: false, task_ids: [] }, 'local.run.status': { running: false } };
  const mocks = {
    '@tauri-apps/api/core': { invoke: async (command, args) => {
      if (command === 'phonton_sidecar_alive') return overrides.alive ? overrides.alive() : true;
      if (command === 'bundled_phonton_engine') return null;
      assert.equal(command, 'serve_rpc');
      const { method } = JSON.parse(args.body); calls.rpc.push(method);
      const value = overrides.rpc ? await overrides.rpc(method, defaults[method]) : defaults[method];
      return JSON.stringify({ jsonrpc: '2.0', result: value ?? { ok: true } });
    } },
    '@tauri-apps/api/app': { getName: async () => 'Phonton' },
    '@tauri-apps/plugin-updater': { check: async () => {
      calls.check++;
      return { version: '0.5.0', downloadAndInstall: async () => { calls.install++; await overrides.install?.(); } };
    } },
    '@tauri-apps/plugin-process': { relaunch: async () => { calls.relaunch++; } },
    '@tauri-apps/plugin-shell': { Command: { create: () => ({ on: () => {}, spawn: async () => ({ kill: async () => {} }) }) } },
    './cli-install': { getPhontonLaunchSpec: () => ({ kind: 'exe', exe: '/fixture/phonton' }), getResolvedPhontonCmd: () => '/fixture/phonton' },
    './projects': { getActiveProject: () => null },
    './bundled-sidecar-start': {},
  };
  const loaded = {};
  function load(name) {
    if (loaded[name]) return loaded[name].exports;
    const module = { exports: {} }; loaded[name] = module;
    new Function('require', 'module', 'exports', 'window', 'navigator', compiled[name])(dependency => {
      if (mocks[dependency]) return mocks[dependency];
      assert.ok(compiled[dependency.slice(2)], `Unexpected dependency ${dependency}`);
      return load(dependency.slice(2));
    }, module, module.exports, { __TAURI_INTERNALS__: {} }, { userAgent: 'Linux' });
    return module.exports;
  }
  return { updater: load('app-updater'), lock: load('app-update-lock'), serve: load('serve'), sidecar: load('sidecar'), calls };
}

test('native update admission refuses running model, hosted goal or local work before download', async () => {
  for (const active of ['models.operation', 'goal.active', 'local.run.status']) {
    const h = harness({ rpc: (method, value) => method === active ? { ...value, running: true } : value });
    const result = await h.updater.checkForAppUpdate({ install: true });
    assert.equal(result.status, 'error');
    assert.match(result.message, /running/);
    assert.equal(h.calls.check, 0); assert.equal(h.calls.install, 0);
    const release = h.lock.beginDesktopWork(); release(); // Failed admission releases exclusion.
  }
});

test('unknown native ownership, unreadable or malformed engine state cannot authorize an update', async () => {
  for (const overrides of [
    { alive: () => { throw new Error('native invocation unavailable'); } },
    { alive: () => null },
    { rpc: () => { throw new Error('lost reply'); } },
    ...['models.operation', 'goal.active', 'local.run.status'].map(invalid => ({ rpc: (method, value) => method === invalid ? {} : value })),
  ]) {
    const h = harness(overrides);
    const result = await h.updater.checkForAppUpdate({ install: true });
    assert.equal(result.status, 'error'); assert.match(result.message, /cannot confirm/);
    assert.equal(h.calls.install, 0);
  }
  const absent = harness({ alive: () => false });
  assert.equal((await absent.updater.checkForAppUpdate({ install: true })).status, 'installed');
  assert.deepEqual(absent.calls.rpc, []);
});

test('a pending Apply request excludes update admission until its actual reply completes', async () => {
  let finish;
  const reply = new Promise(resolve => { finish = resolve; });
  const h = harness({ rpc: (method, value) => method === 'local.run.apply' ? reply : value });
  const applying = h.serve.rpc('local.run.apply', { id: 'fixture' });
  const blocked = await h.updater.checkForAppUpdate({ install: true });
  assert.equal(blocked.status, 'error'); assert.match(blocked.message, /finishing a change/);
  assert.equal(h.calls.install, 0);
  finish({ state: 'applied' }); await applying;
  assert.equal((await h.updater.checkForAppUpdate({ install: true })).status, 'installed');
});

test('a shell-owned engine still requires idle RPC proof when the native tracker is empty', async () => {
  const h = harness({ alive: () => false, rpc: (method, value) => method === 'goal.active' ? { running: true, task_ids: ['active'] } : value });
  await h.sidecar.startSidecar();
  assert.equal(await h.sidecar.sidecarProcessAliveStrict(), true);
  const result = await h.updater.checkForAppUpdate({ install: true });
  assert.equal(result.status, 'error'); assert.match(result.message, /coding goal is running/);
  assert.equal(h.calls.check, 0); assert.equal(h.calls.install, 0);
});

test('failed statistics and task-detail reads do not poison later update admission', async () => {
  const h = harness({ rpc: (method, value) => {
    if (['record.read', 'tasks.get'].includes(method)) throw new Error('read reply lost');
    return value;
  } });
  for (const method of ['record.read', 'tasks.get']) await assert.rejects(h.serve.rpc(method), /read reply lost/);
  assert.equal((await h.updater.checkForAppUpdate({ install: true })).status, 'installed');
});

test('an admitted update excludes duplicate installs, new mutation RPCs and engine restarts while allowing status reads', async () => {
  let finish, entered;
  const downloading = new Promise(resolve => { entered = resolve; });
  const done = new Promise(resolve => { finish = resolve; });
  const h = harness({ install: async () => { entered(); await done; } });
  const installing = h.updater.checkForAppUpdate({ install: true });
  await downloading;
  const duplicate = await h.updater.checkForAppUpdate({ install: true });
  assert.equal(duplicate.status, 'error'); assert.match(duplicate.message, /already in progress/);
  for (const method of ['local.run.start', 'local.run.apply', 'local.run.rollback', 'goal.start', 'models.start', 'models.endpoint.set', 'config.save', 'future.unknown']) {
    await assert.rejects(h.serve.rpc(method), /Phonton is updating/);
    assert.ok(!h.calls.rpc.includes(method));
  }
  await assert.rejects(h.lock.withDesktopWork(async () => assert.fail('Restart must not start')), /Phonton is updating/);
  assert.deepEqual(await h.serve.rpc('local.run.status'), { running: false });
  finish(); assert.equal((await installing).status, 'installed');
  assert.equal(h.calls.install, 1); assert.equal(h.calls.relaunch, 1);
  await h.serve.rpc('goal.start');
  assert.ok(h.calls.rpc.includes('goal.start'));
});

test('a lost mutation reply stays unsafe for updating after the pending request ends', async () => {
  const h = harness({ rpc: (method, value) => {
    if (method === 'local.run.apply') throw new Error('connection lost');
    return value;
  } });
  await assert.rejects(h.serve.rpc('local.run.apply'), /connection lost/);
  const result = await h.updater.checkForAppUpdate({ install: true });
  assert.equal(result.status, 'error'); assert.match(result.message, /previous change could not be confirmed/);
  assert.equal(h.calls.install, 0);
});

test('actual engine lifecycle and CLI installation entry points refuse changes during an update', async () => {
  const h = harness();
  const finish = h.lock.beginAppUpdate();
  let externalCalls = 0;
  const denied = new Proxy({}, { get: () => () => { externalCalls++; throw new Error('Work escaped the update gate'); } });
  function loadEntry(name) {
    const source = readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
    const module = { exports: {} };
    new Function('require', 'module', 'exports', code)(dependency => dependency === './app-update-lock' ? h.lock : denied, module, module.exports);
    return module.exports;
  }
  const sidecar = loadEntry('sidecar');
  for (const action of [sidecar.startSidecar, sidecar.stopSidecar, () => sidecar.restartSidecar('fixture')]) {
    await assert.rejects(action(), /Phonton is updating/);
  }
  const cli = await loadEntry('cli-install').ensurePhontonCli();
  assert.equal(cli.ok, false); assert.match(cli.message, /Phonton is updating/);
  const reconnect = await loadEntry('sidecar-upgrade').ensureSidecarReady(false, undefined, true);
  assert.equal(reconnect.ok, false); assert.match(reconnect.error, /Phonton is updating/);
  assert.equal(externalCalls, 0);
  finish();
});
