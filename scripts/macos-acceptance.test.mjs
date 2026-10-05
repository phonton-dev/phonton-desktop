import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, realpathSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { verifyMacCandidate } from './macos-acceptance/contract.mjs';
import { assertSameProcess, parseProcessIdentity } from './macos-acceptance/process-identity.mjs';
const pin = JSON.parse(readFileSync(new URL('./macos-acceptance/source.json', import.meta.url), 'utf8'));
function fixture() {
  const run = { id: pin.runId, repository: { full_name: pin.repository }, head_sha: pin.commit,
    path: '.github/workflows/release-desktop.yml', event: 'workflow_dispatch', status: 'completed', conclusion: 'success' };
  const jobs = [{ id: pin.buildJobId, run_id: pin.runId, name: 'Build (macos-latest)', head_sha: pin.commit, status: 'completed', conclusion: 'success',
    steps: ['Check desktop contracts', 'Build release candidate without publishing', 'Check native Desktop contracts', 'Retain platform candidate bundles'].map(name => ({ name, conclusion: 'success' })) }];
  const artifact = { id: pin.artifact.id, name: pin.artifact.name, expired: false,
    workflow_run: { id: pin.runId, head_sha: pin.commit }, digest: 'sha256:' + pin.artifact.sha256 };
  const log = `Artifact ${pin.artifact.name}.zip successfully finalized. Artifact ID ${pin.artifact.id}\nArtifact download URL: https://github.com/${pin.repository}/actions/runs/${pin.runId}/artifacts/${pin.artifact.id}`;
  return [structuredClone(pin), run, jobs, artifact, log];
}
test('macOS accepted artifact binding accepts matching completed source and producing job', () => verifyMacCandidate(...fixture()));
test('macOS artifact binding rejects substituted source, build or package identity', () => {
  const mutations = [
    values => { values[1].head_sha = '0'.repeat(40); },
    values => { values[1].repository.full_name = 'another/repository'; },
    values => { values[1].conclusion = 'failure'; },
    values => { values[2][0].name = 'Build (ubuntu-22.04)'; },
    values => { values[2][0].steps[2].conclusion = 'skipped'; },
    values => { values[3].expired = true; },
    values => { values[3].workflow_run.id += 1; },
    values => { values[3].digest = 'sha256:' + '0'.repeat(64); },
    values => { values[4] = ''; },
    values => { values[0].dmg.name = 'Phonton_other.dmg'; },
  ];
  for (const mutate of mutations) { const values = fixture(); mutate(values); assert.throws(() => verifyMacCandidate(...values)); }
});

const identity = { status: 'present', pid: 29305, ppid: 29093, startSeconds: 1791243436, startMicroseconds: 74302,
  exe: '/Users/runner/work/_temp/phonton-macos-cli/phonton' };
const helperResult = (value, status = 0) => ({ status, signal: null, stdout: JSON.stringify(value), stderr: '' });

test('macOS process proof requires native absolute identity and rejects PID, parent, path or lifetime changes', () => {
  assert.deepEqual(parseProcessIdentity(helperResult(identity), identity.pid), identity);
  assertSameProcess(identity, { ...identity });
  for (const [key, value] of [['pid', 29306], ['ppid', 1], ['startSeconds', identity.startSeconds + 1],
    ['startMicroseconds', 74303], ['exe', '/another/phonton']]) {
    assert.throws(() => assertSameProcess(identity, { ...identity, [key]: value }));
  }
  for (const mutate of [value => { value.exe = 'phonton'; }, value => { value.pid++; },
    value => { value.startMicroseconds = 1000000; }, value => { delete value.startSeconds; }]) {
    const value = { ...identity }; mutate(value);
    assert.throws(() => parseProcessIdentity(helperResult(value), identity.pid));
  }
});

test('macOS missing or unreadable process evidence stays unavailable and cannot satisfy identity proof', () => {
  for (const errno of [1, 3, 13]) {
    const unavailable = { status: 'unavailable', stage: 'bsd-before', errno };
    assert.deepEqual(parseProcessIdentity(helperResult(unavailable, 1), identity.pid), { ...unavailable, pid: identity.pid });
    assert.throws(() => assertSameProcess(identity, unavailable));
    assert.throws(() => parseProcessIdentity(helperResult(unavailable, 0), identity.pid));
  }
  assert.throws(() => parseProcessIdentity({ ...helperResult(identity), status: 1 }, identity.pid));
  assert.throws(() => parseProcessIdentity({ ...helperResult(identity), stdout: '{' }, identity.pid));
  assert.throws(() => parseProcessIdentity({ ...helperResult(identity), signal: 'SIGTERM' }, identity.pid));
});

test('native helper resolves a short argv0 to the actual executable and preserves exited PID errors', {
  skip: process.env.PHONTON_TEST_MACOS_IDENTITY !== '1',
}, async () => {
  assert.equal(process.platform, 'darwin');
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  const helper = path.join(process.env.RUNNER_TEMP, 'phonton-process-identity');
  const observe = pid => parseProcessIdentity(spawnSync(helper, [String(pid)], { encoding: 'utf8', timeout: 10000 }), pid);
  const child = spawn('/bin/sleep', ['2'], { argv0: 'phonton', stdio: 'ignore' });
  const completed = once(child, 'exit');
  await once(child, 'spawn');
  try {
    const value = observe(child.pid);
    assert.equal(value.status, 'present');
    assert.equal(value.ppid, process.pid);
    assert.equal(realpathSync(value.exe), realpathSync('/bin/sleep'));
    assertSameProcess(value, observe(child.pid));
  } finally { await completed; }
  const exited = observe(child.pid);
  assert.equal(exited.status, 'unavailable');
  assert.equal(exited.errno, 3, 'ESRCH must remain an observed native error');
});
