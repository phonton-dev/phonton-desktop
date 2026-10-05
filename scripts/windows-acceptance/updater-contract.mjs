import assert from 'node:assert/strict';
import path from 'node:path';
import { bootstrapVersion } from './updater-bootstrap.mjs';
import { expectedPreferences } from './upgrade-contract.mjs';

/** Losing the click reply is not success; the caller must still prove restart. */
export async function clickForUpdaterRestart(click) {
  try { await click(); return { acknowledged: true }; }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/no such window|invalid session id|disconnected|target window already closed|web view not found/i.test(message)) throw error;
    return { acknowledged: false, disconnect: message.slice(0, 2000) };
  }
}

export function validateUpdaterPin(pin) {
  assert.equal(pin.schema, 1);
  assert.equal(pin.repository, 'phonton-dev/phonton-desktop');
  assert.match(pin.commit, /^[a-f0-9]{40}$/);
  for (const field of ['manifestSha256', 'installerSha256', 'signatureSha256']) assert.match(pin[field], /^[a-f0-9]{64}$/);
  assert.ok(Number.isSafeInteger(pin.runId) && pin.runId > 0);
  for (const [key, name] of [['candidateArtifact', 'windows-release-candidate'], ['bundleArtifact', 'release-candidate-windows-latest']]) {
    assert.ok(Number.isSafeInteger(pin[key].id) && pin[key].id > 0);
    assert.equal(pin[key].name, name);
    assert.match(pin[key].sha256, /^[a-f0-9]{64}$/);
  }
}

export function verifyUpdaterRun(pin, run, artifacts) {
  validateUpdaterPin(pin);
  assert.equal(run.id, pin.runId);
  assert.equal(run.repository.full_name, pin.repository);
  assert.equal(run.head_sha, pin.commit);
  assert.equal(run.path, '.github/workflows/release-desktop.yml');
  assert.equal(run.event, 'workflow_dispatch');
  assert.equal(run.status, 'completed');
  assert.equal(run.conclusion, 'success');
  for (const key of ['candidateArtifact', 'bundleArtifact']) {
    const actual = artifacts.find(artifact => artifact.id === pin[key].id);
    assert.ok(actual, `Missing ${key}`);
    assert.equal(actual.name, pin[key].name);
    assert.equal(actual.expired, false);
    assert.equal(actual.workflow_run.id, pin.runId);
    assert.equal(actual.workflow_run.head_sha, pin.commit);
    assert.equal(actual.digest, `sha256:${pin[key].sha256}`);
  }
}

export function verifyUpdaterPreferences(seed, observed, candidate) {
  assert.equal(seed.schema, 1);
  assert.equal(seed.kind, 'controlled-updater');
  assert.equal(seed.status, 'candidate-closed');
  assert.equal(seed.storage, 'default-webview');
  assert.equal(seed.candidateCommit, candidate.desktopCommit);
  assert.equal(seed.installerSha256, candidate.installer.sha256);
  assert.deepEqual(seed.bootstrapIdentity, { productName: candidate.productName, identifier: candidate.identifier, version: bootstrapVersion });
  assert.deepEqual(seed.preferences, expectedPreferences(seed.fixture, seed.sentinel));
  assert.deepEqual(observed, seed.preferences, 'Updater must retain every named preference before any reseed');
  assert.ok(seed.restartedProcessId > 0 && seed.restartedProcessId !== seed.bootstrapProcessId);
}

export function verifyUpdaterEnginePaths(config, status, environment) {
  const normalize = value => path.win32.resolve(value).toLowerCase();
  assert.equal(normalize(config.path), normalize(environment.PHONTON_CONFIG_PATH));
  assert.equal(status.managed_storage.source, 'override');
  const directory = path.win32.dirname(environment.PHONTON_LOCAL_STATE);
  assert.equal(normalize(status.managed_storage.root), normalize(path.win32.join(directory, 'runtime')));
  assert.equal(normalize(status.managed_storage.runs_path), normalize(path.win32.join(directory, 'runs')));
}
