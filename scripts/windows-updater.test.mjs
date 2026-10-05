import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { verifyUpdaterRun, verifyUpdaterPreferences, verifyUpdaterEnginePaths, clickForUpdaterRestart } from './windows-acceptance/updater-contract.mjs';
import { expectedPreferences } from './windows-acceptance/upgrade-contract.mjs';

function runFixture() {
  const pin = { schema: 1, repository: 'phonton-dev/phonton-desktop', commit: 'a'.repeat(40), runId: 12,
    manifestSha256: 'b'.repeat(64), installerSha256: 'c'.repeat(64), signatureSha256: 'd'.repeat(64),
    candidateArtifact: { id: 13, name: 'windows-release-candidate', sha256: 'e'.repeat(64) },
    bundleArtifact: { id: 14, name: 'release-candidate-windows-latest', sha256: 'f'.repeat(64) } };
  const run = { id: 12, repository: { full_name: pin.repository }, head_sha: pin.commit,
    path: '.github/workflows/release-desktop.yml', event: 'workflow_dispatch', status: 'completed', conclusion: 'success' };
  const artifacts = [pin.candidateArtifact, pin.bundleArtifact].map(a => ({ ...a, expired: false,
    workflow_run: { id: pin.runId, head_sha: pin.commit }, digest: `sha256:${a.sha256}` }));
  return { pin, run, artifacts };
}
test('updater click disconnect is recorded without retrying or suppressing unrelated UI failures', async () => {
  let clicks = 0;
  const lost = await clickForUpdaterRestart(async () => { clicks++; throw new Error('no such window: target window already closed'); });
  assert.equal(clicks, 1);
  assert.equal(lost.acknowledged, false);
  assert.match(lost.disconnect, /target window already closed/);
  await assert.rejects(clickForUpdaterRestart(async () => { throw new Error('element click intercepted'); }), /click intercepted/);
  assert.deepEqual(await clickForUpdaterRestart(async () => {}), { acknowledged: true });
});
test('updater source rejects failed, foreign, expired or mismatched build artifacts', () => {
  const valid = runFixture();
  verifyUpdaterRun(valid.pin, valid.run, valid.artifacts);
  for (const mutate of [
    data => { data.run.conclusion = 'failure'; }, data => { data.run.status = 'in_progress'; },
    data => { data.run.repository.full_name = 'other/repo'; }, data => { data.run.head_sha = '0'.repeat(40); },
    data => { data.run.path = '.github/workflows/windows-preview-acceptance.yml'; },
    data => { data.artifacts[0].workflow_run.id++; }, data => { data.artifacts[1].expired = true; },
    data => { data.artifacts[1].digest = 'sha256:' + '0'.repeat(64); },
    data => { data.pin.bundleArtifact.id = 1.5; }, data => { data.pin.installerSha256 = ''; },
  ]) {
    const bad = runFixture(); mutate(bad);
    assert.throws(() => verifyUpdaterRun(bad.pin, bad.run, bad.artifacts));
  }
});

test('controlled updater retention never accepts stable-upgrade provenance or incomplete restart', () => {
  const candidate = { desktopCommit: 'a'.repeat(40), installer: { sha256: 'b'.repeat(64) }, productName: 'Phonton', identifier: 'dev.phonton.desktop' };
  const seed = { schema: 1, kind: 'controlled-updater', status: 'candidate-closed', storage: 'default-webview',
    fixture: 'C:\\fixture', sentinel: 'fixture-sentinel', candidateCommit: candidate.desktopCommit,
    installerSha256: candidate.installer.sha256, bootstrapIdentity: { productName: 'Phonton', identifier: candidate.identifier, version: '0.4.0-alpha.0' },
    bootstrapProcessId: 100, restartedProcessId: 200 };
  seed.preferences = expectedPreferences(seed.fixture, seed.sentinel);
  verifyUpdaterPreferences(seed, seed.preferences, candidate);
  for (const mutate of [
    data => { data.kind = 'stable-upgrade'; }, data => { data.status = 'stable-closed'; },
    data => { data.bootstrapIdentity.version = '0.3.4'; }, data => { data.restartedProcessId = 100; },
    data => { data.candidateCommit = 'c'.repeat(40); }, data => { data.preferences['phonton.theme'] = 'nebula'; },
  ]) {
    const bad = structuredClone(seed); mutate(bad);
    assert.throws(() => verifyUpdaterPreferences(bad, bad.preferences, candidate));
  }
  assert.throws(() => verifyUpdaterPreferences(seed, { ...seed.preferences, 'phonton.projects.active': null }, candidate));
});

test('restarted engine must inherit both isolated configuration and managed storage', () => {
  const env = { PHONTON_CONFIG_PATH: 'C:\\runner\\state\\config.toml', PHONTON_LOCAL_STATE: 'C:\\runner\\state\\local-models.json' };
  const status = { managed_storage: { source: 'override', root: 'c:/runner/state/runtime', runs_path: 'c:/runner/state/runs' } };
  verifyUpdaterEnginePaths({ path: env.PHONTON_CONFIG_PATH }, status, env);
  assert.throws(() => verifyUpdaterEnginePaths({ path: 'C:\\user\\config.toml' }, status, env));
  for (const change of [{ source: 'default' }, { root: 'c:/runner/state' }, { root: 'c:/other/state/runtime' }, { runs_path: 'c:/other/runs' }]) {
    assert.throws(() => verifyUpdaterEnginePaths({ path: env.PHONTON_CONFIG_PATH }, { managed_storage: { ...status.managed_storage, ...change } }, env));
  }
});

const attachCode = ts.transpileModule(readFileSync(new URL('./windows-acceptance/default-profile.mjs', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, esModuleInterop: true },
}).outputText;
function attachHarness(pid = 200) {
  const calls = [];
  const profile = { appProcessId: pid, userDataDirectories: ['C:\\local\\dev.phonton.desktop\\EBWebView'], ownedWebViewProcessIds: [300],
    debugListeners: [{ LocalAddress: '127.0.0.1', OwningProcess: 300 }] };
  const module = { exports: {} };
  const dependencies = {
    'node:assert/strict': assert, 'node:path': path, 'node:crypto': { randomUUID: () => assert.fail('Attach must not create a launch record') },
    'node:fs': { readFileSync: () => assert.fail('Attach must not read a launch record') },
    'node:timers/promises': { setTimeout: async () => {} },
    'node:child_process': { execFileSync: (file, args) => {
      calls.push({ file, args });
      assert.equal(args[2], 'scripts/windows-acceptance/observe-webview-profile.ps1', 'Attach may observe, never launch');
      return JSON.stringify(profile);
    } },
  };
  const env = { GITHUB_ACTIONS: 'true', LOCALAPPDATA: 'C:\\local' };
  new Function('require', 'module', 'exports', 'process', 'fetch', attachCode)(name => dependencies[name], module, module.exports,
    { platform: 'win32', env }, async () => ({ ok: true }));
  const request = async (method, route, payload) => { calls.push({ method, route, payload }); return { sessionId: 'attached', capabilities: {} }; };
  return { ...module.exports, calls, request, env };
}
test('attach-only helper observes the exact restarted process and sends no app launch capability', async () => {
  const h = attachHarness();
  const result = await h.attachDefaultProfile(h.request, 200);
  assert.equal(result.sessionId, 'attached');
  assert.equal(h.calls.length, 2);
  assert.deepEqual(h.calls[1].payload.capabilities.alwaysMatch, { browserName: 'webview2', 'ms:edgeChromium': true,
    'ms:edgeOptions': { debuggerAddress: '127.0.0.1:9222' } });
  const wrong = attachHarness(201);
  await assert.rejects(wrong.attachDefaultProfile(wrong.request, 200));
  assert.equal(wrong.calls.length, 1, 'Wrong PID must fail before session creation');
  const custom = attachHarness(); custom.env.WEBVIEW2_USER_DATA_FOLDER = 'C:\\temporary';
  await assert.rejects(custom.attachDefaultProfile(custom.request, 200));
  assert.equal(custom.calls.length, 0);
});
