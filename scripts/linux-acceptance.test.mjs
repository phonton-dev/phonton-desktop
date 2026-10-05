import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyLinuxCandidate, verifyExternalModel, sameLinuxProcess } from './linux-acceptance/contract.mjs';
import { parseProcessStat, parseListeners, isDescendant, stableProcessObservation } from './linux-acceptance/processes.mjs';

const commit = 'a'.repeat(40), digest = 'b'.repeat(64);
function fixture() {
  const pin = { schema: 1, repository: 'phonton-dev/phonton-desktop', commit, runId: 10, buildJobId: 20,
    desktopSha256: digest, artifact: { id: 30, name: 'release-candidate-ubuntu-22.04', sha256: digest },
    deb: { name: 'Phonton_0.4.0-beta.1_amd64.deb', sha256: digest },
    appImage: { name: 'Phonton_0.4.0-beta.1_amd64.AppImage', sha256: digest } };
  const run = { id: 10, repository: { full_name: pin.repository }, head_sha: commit, path: '.github/workflows/release-desktop.yml', event: 'workflow_dispatch', status: 'completed', conclusion: 'success' };
  const jobs = [{ id: 20, run_id: 10, name: 'Build (ubuntu-22.04)', head_sha: commit, status: 'completed', conclusion: 'success', steps: ['Check desktop contracts', 'Build release candidate without publishing', 'Check native Desktop contracts', 'Retain platform candidate bundles'].map(name => ({ name, conclusion: 'success' })) }];
  const artifact = { id: 30, name: pin.artifact.name, expired: false, workflow_run: { id: 10, head_sha: commit }, digest: `sha256:${digest}` };
  const log = `Artifact ${pin.artifact.name}.zip successfully finalized. Artifact ID 30\nArtifact download URL: https://github.com/${pin.repository}/actions/runs/10/artifacts/30`;
  return { pin, run, jobs, artifact, log };
}
const verify = value => verifyLinuxCandidate(value.pin, value.run, value.jobs, value.artifact, value.log);

test('Linux candidate acceptance binds successful source, producing job and exact artifact identity', () => {
  verify(fixture());
  for (const mutate of [
    v => { v.run.conclusion = 'failure'; }, v => { v.run.status = 'in_progress'; },
    v => { v.run.head_sha = 'c'.repeat(40); }, v => { v.run.repository.full_name = 'elsewhere/repo'; },
    v => { v.jobs[0].conclusion = 'cancelled'; }, v => { v.jobs[0].run_id = 9; }, v => { v.jobs[0].steps.pop(); },
    v => { v.jobs[0].steps[2].conclusion = 'skipped'; }, v => { v.jobs.push(structuredClone(v.jobs[0])); },
    v => { v.artifact.expired = true; }, v => { v.artifact.workflow_run.id = 9; },
    v => { v.artifact.digest = `sha256:${'d'.repeat(64)}`; }, v => { v.pin.deb.name = '../candidate.deb'; },
    v => { v.pin.appImage.sha256 = ''; }, v => { delete v.pin.desktopSha256; },
    v => { v.log = v.log.replaceAll('30', '31'); }, v => { v.log = v.log.replaceAll('30', '300'); }, v => { v.log = undefined; },
  ]) {
    const value = fixture(); mutate(value); assert.throws(() => verify(value));
  }
});

test('external runtime verification rejects managed labels, blocked stores and substituted calibration', () => {
  const expected = { runtimeVersion: '0.34.2', model: 'qwen2.5-coder:3b', digest, context: 4096 };
  const status = { endpoint: 'http://127.0.0.1:11434', runtime_version: expected.runtimeVersion, runtime_error: null, local_only: false, managed_runtime_supported: false,
    model_store: { status: 'unverified', goal_run_blocked: false }, active_model: expected.model,
    models: [{ model: { name: expected.model, digest }, profile: { digest, runtime_version: expected.runtimeVersion, context_tokens: 4096, protocol: 'search_replace' }, profile_sha256: digest }] };
  verifyExternalModel(status, expected);
  for (const mutate of [
    v => { v.model_store.status = 'verified_managed'; }, v => { v.model_store.goal_run_blocked = true; },
    v => { delete v.model_store.status; }, v => { v.model_store.status = 'unknown'; },
    v => { v.local_only = true; }, v => { delete v.local_only; },
    v => { v.managed_runtime_supported = true; }, v => { delete v.managed_runtime_supported; },
    v => { v.model_store.recovery_required = true; }, v => { v.active_model = null; },
    v => { v.models[0].model.digest = 'replacement'; }, v => { v.models[0].profile.context_tokens = 8192; },
    v => { v.models[0].profile.runtime_version = 'replacement'; }, v => { v.models[0].profile_sha256 = ''; },
  ]) { const value = structuredClone(status); mutate(value); assert.throws(() => verifyExternalModel(value, expected)); }
});

test('external process retention rejects reused PIDs and replaced executables', () => {
  const before = { pid: 45, startTime: '12345', exe: '/opt/ollama/bin/ollama' };
  assert.equal(sameLinuxProcess(before, { ...before }), true);
  for (const after of [null, { ...before, pid: 46 }, { ...before, startTime: '12346' }, { ...before, exe: '/tmp/replacement' }]) assert.equal(sameLinuxProcess(before, after), false);
});

test('proc observation preserves kernel identity despite spaces and parentheses in executable names', () => {
  const fields = ['S', '12', ...Array(17).fill('0'), '789012', '0'];
  assert.deepEqual(parseProcessStat(`45 (phonton ) worker) ${fields.join(' ')}`, '/usr/bin/phonton'),
    { pid: 45, ppid: 12, state: 'S', exe: '/usr/bin/phonton', startTime: '789012' });
  assert.throws(() => parseProcessStat('45 broken', '/usr/bin/phonton'));
});

test('listener evidence includes exposed or unknown owners and excludes established connections', () => {
  const row = (address, state, inode) => `0: ${address}:BAD7 00000000:0000 ${state} 0:0 0:0 0 1000 0 ${inode}`;
  const text = `header\n${row('0100007F', '0A', 100)}\n${row('00000000', '0A', 101)}\n${row('0100007F', '01', 102)}`;
  const observed = parseListeners(text, 'ipv4');
  assert.equal(observed.length, 2);
  assert.equal(observed[0].port, 47831);
  assert.equal(observed[0].loopback, true);
  assert.equal(observed[1].loopback, false);
  const ipv6 = parseListeners(`header\n${row('00000000000000000000000001000000', '0A', 103)}`, 'ipv6');
  assert.equal(ipv6[0].loopback, true);
});

test('shell ancestry must reach the app and cannot pass through a missing parent or cycle', () => {
  const rows = [{ pid: 3, ppid: 2 }, { pid: 2, ppid: 1 }];
  assert.equal(isDescendant(3, 1, rows), true);
  assert.equal(isDescendant(3, 9, rows), false);
  assert.equal(isDescendant(3, 1, [{ pid: 3, ppid: 2 }, { pid: 2, ppid: 3 }]), false);
});

test('process scans discard socket ownership when the PID or executable changes mid-scan', () => {
  const before = { pid: 45, ppid: 12, startTime: '12345', exe: '/usr/bin/phonton' };
  for (const after of [{ ...before, startTime: '12346' }, { ...before, exe: '/tmp/replacement' }]) {
    const identities = [before, after];
    assert.equal(stableProcessObservation(45, () => identities.shift(), () => ['100']), null);
  }
  assert.deepEqual(stableProcessObservation(45, () => before, () => ['100']), { process: before, inodes: ['100'] });
});
