import assert from 'node:assert/strict';

const sha256 = value => assert.match(value, /^[a-f0-9]{64}$/);

/** Check source and upload metadata; the caller must also hash downloaded ZIP/payload bytes. */
export function verifyMacCandidate(pin, run, jobs, artifact, buildLog) {
  assert.equal(pin.schema, 1);
  assert.equal(pin.repository, 'phonton-dev/phonton-desktop');
  assert.match(pin.commit, /^[a-f0-9]{40}$/);
  assert.ok(Number.isSafeInteger(pin.runId) && pin.runId > 0);
  assert.ok(Number.isSafeInteger(pin.buildJobId) && pin.buildJobId > 0);
  sha256(pin.desktopSha256);
  assert.equal(run.id, pin.runId);
  assert.equal(run.repository.full_name, pin.repository);
  assert.equal(run.head_sha, pin.commit);
  assert.equal(run.path, '.github/workflows/release-desktop.yml');
  assert.equal(run.event, 'workflow_dispatch');
  assert.equal(run.status, 'completed');
  assert.equal(run.conclusion, 'success');
  const builds = jobs.filter(job => job.id === pin.buildJobId);
  assert.equal(builds.length, 1);
  const build = builds[0];
  assert.equal(build.run_id, pin.runId);
  assert.equal(build.name, 'Build (macos-latest)');
  assert.equal(build.head_sha, pin.commit);
  assert.equal(build.status, 'completed');
  assert.equal(build.conclusion, 'success');
  for (const name of ['Check desktop contracts', 'Build release candidate without publishing', 'Check native Desktop contracts', 'Retain platform candidate bundles']) {
    const steps = build.steps.filter(step => step.name === name);
    assert.equal(steps.length, 1, name);
    assert.equal(steps[0].conclusion, 'success', name);
  }
  assert.equal(pin.artifact.name, 'release-candidate-macos-latest');
  assert.ok(Number.isSafeInteger(pin.artifact.id) && pin.artifact.id > 0);
  sha256(pin.artifact.sha256);
  assert.equal(artifact.id, pin.artifact.id);
  assert.equal(artifact.name, pin.artifact.name);
  assert.equal(artifact.expired, false);
  assert.equal(artifact.workflow_run.id, pin.runId);
  assert.equal(artifact.workflow_run.head_sha, pin.commit);
  assert.equal(artifact.digest, `sha256:${pin.artifact.sha256}`);
  assert.equal(typeof buildLog, 'string');
  const lines = buildLog.split('\n').map(line => line.trimEnd());
  assert.ok(lines.some(line => line.endsWith(`Artifact ${pin.artifact.name}.zip successfully finalized. Artifact ID ${pin.artifact.id}`)), 'Pinned build log must identify the uploaded artifact');
  assert.ok(lines.some(line => line.endsWith(`Artifact download URL: https://github.com/${pin.repository}/actions/runs/${pin.runId}/artifacts/${pin.artifact.id}`)));
  assert.equal(pin.dmg.name, 'Phonton_0.4.0-beta.1_aarch64.dmg');
  assert.ok(Number.isSafeInteger(pin.dmg.bytes) && pin.dmg.bytes > 0);
  sha256(pin.dmg.sha256);
}
