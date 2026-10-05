import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { verifyMacCandidate } from './macos-acceptance/contract.mjs';
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
