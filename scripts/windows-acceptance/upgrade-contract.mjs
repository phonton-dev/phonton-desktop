import assert from 'node:assert/strict';
import { validateCandidate } from './candidate-profile.mjs';

export function validateUpgrade(source, candidate, baselineMsi, candidateMsi) {
  assert.equal(source.schema, 1);
  assert.equal(source.repository, 'phonton-dev/phonton-desktop');
  validateCandidate(candidate, 'release', source.candidate.commit, 'msi');
  assert.equal(candidate.installer.sha256, source.candidate.installerSha256);
  assert.equal(baselineMsi.ProductName, candidate.productName);
  assert.equal(baselineMsi.ProductVersion, source.baseline.version);
  assert.deepEqual(candidateMsi, candidate.msi, 'Actual candidate MSI metadata differs');
  assert.match(baselineMsi.ProductCode, /^\{[A-F0-9-]{36}\}$/i);
  assert.notEqual(baselineMsi.ProductCode.toUpperCase(), candidateMsi.ProductCode.toUpperCase(), 'Major upgrade must have a new ProductCode');
  assert.equal(baselineMsi.UpgradeCode.toUpperCase(), candidateMsi.UpgradeCode.toUpperCase(), 'UpgradeCode must preserve the product family');
  const numeric = value => value.split('.').map(Number);
  const old = numeric(baselineMsi.ProductVersion), next = numeric(candidateMsi.ProductVersion);
  const differing = [0, 1, 2].find(index => next[index] !== old[index]);
  assert.ok(differing !== undefined && next[differing] > old[differing], 'MSI must see a forward version change');
}

export function expectedPreferences(fixture, sentinel) {
  assert.ok(fixture && sentinel);
  return {
    'phonton.theme': 'light',
    'phonton.projects.active': fixture,
    'phonton.projects.recent': JSON.stringify([fixture]),
    'phonton.acceptance.upgradeSentinel': sentinel,
  };
}

export function verifyRetainedPreferences(seed, observed, candidate) {
  assert.equal(seed.schema, 1);
  assert.equal(seed.status, 'stable-closed');
  assert.equal(seed.storage, 'default-webview');
  assert.equal(seed.candidateCommit, candidate.desktopCommit);
  assert.equal(seed.installerSha256, candidate.installer.sha256);
  assert.equal(seed.stableIdentity.version, '0.3.4');
  assert.equal(seed.stableIdentity.identifier, candidate.identifier);
  assert.equal(seed.stableIdentity.productName, candidate.productName);
  assert.deepEqual(seed.preferences, expectedPreferences(seed.fixture, seed.sentinel));
  assert.deepEqual(observed, seed.preferences, 'Upgrade must retain every named preference before any reseed');
}
