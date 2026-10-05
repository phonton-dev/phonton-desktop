import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { expectedProfile, validateCandidate, validateConfiguration, verifyInstaller } from './windows-acceptance/candidate-profile.mjs';

const commit = 'a'.repeat(40);
const candidate = kind => ({
  schema: 1, ...expectedProfile(kind), version: '0.4.0-beta.1', desktopCommit: commit,
  installer: { name: `${expectedProfile(kind).productName}_0.4.0-beta.1_x64-setup.exe`, sha256: 'b'.repeat(64) },
  desktopSha256: 'c'.repeat(64), engine: { profile: 'release', version: '0.22.0', sha256: 'd'.repeat(64) },
  engineSource: { repository: 'phonton-dev/phonton-cli', commit: 'e'.repeat(40), version: '0.22.0' },
});
const config = kind => ({
  ...expectedProfile(kind), version: '0.4.0-beta.1',
  bundle: { createUpdaterArtifacts: kind === 'release', resources: {
    'binaries/local-engine/phonton.exe': 'local-engine/phonton.exe',
    'binaries/local-engine/manifest.json': 'local-engine/manifest.json',
  } },
  plugins: {
    'deep-link': { desktop: { schemes: [kind === 'preview' ? 'phonton-preview' : 'phonton'] } },
    updater: { pubkey: 'test-public-key', endpoints: kind === 'preview' ? [] : ['https://github.com/phonton-dev/phonton-desktop/releases/latest/download/latest.json'] },
  },
});

test('Preview and release identities cannot substitute for each other', () => {
  for (const kind of ['preview', 'release']) {
    validateCandidate(candidate(kind), kind, commit);
    validateConfiguration(kind, config(kind));
    const other = kind === 'preview' ? 'release' : 'preview';
    assert.throws(() => validateCandidate(candidate(other), kind, commit));
    assert.throws(() => validateConfiguration(kind, config(other)));
  }
  assert.throws(() => expectedProfile('production-ish'), /Unknown/);
});

test('Release requires updater configuration and both bundled engine resources', () => {
  for (const mutate of [
    c => { c.plugins.updater.endpoints = []; },
    c => { c.bundle.createUpdaterArtifacts = false; },
    c => { delete c.plugins.updater.pubkey; },
    c => { delete c.bundle.resources['binaries/local-engine/manifest.json']; },
    c => { c.bundle.resources = { 'binaries/phonton-engine.exe': 'local-engine/phonton.exe', 'binaries/local-engine.json': 'local-engine/manifest.json' }; },
    c => { c.plugins['deep-link'].desktop.schemes = ['phonton-preview']; },
  ]) { const c = config('release'); mutate(c); assert.throws(() => validateConfiguration('release', c)); }
});

test('Candidate rejects unrelated commits, debug engines and unsafe asset names', () => {
  for (const mutate of [
    c => { c.desktopCommit = 'f'.repeat(40); },
    c => { c.engine.profile = 'debug'; },
    c => { c.engineSource.version = '0.21.0'; },
    c => { c.installer.name = '../Phonton_x64-setup.exe'; },
    c => { c.installer.name = '..\\Phonton_x64-setup.exe'; },
    c => { c.installer.sha256 = ''; },
  ]) { const c = candidate('release'); mutate(c); assert.throws(() => validateCandidate(c, 'release', commit)); }
});

test('Published draft must contain the exact installer accepted by the native job', () => {
  const c = candidate('release'), bytes = Buffer.from('reviewed installer');
  c.installer.sha256 = createHash('sha256').update(bytes).digest('hex');
  verifyInstaller(c, bytes);
  assert.throws(() => verifyInstaller(c, Buffer.from('rebuilt installer')), /differs/);
});

const msiCandidate = () => ({ ...candidate('release'),
  installer: { kind: 'msi', name: 'Phonton_0.4.0-beta.1_x64_en-US.msi', sha256: 'b'.repeat(64) },
  msi: { ProductCode: '{12345678-1234-1234-1234-123456789ABC}', UpgradeCode: '{87654321-1234-1234-1234-123456789ABC}', ProductName: 'Phonton', ProductVersion: '0.4.0.1' },
});

test('MSI and NSIS candidates cannot substitute for each other or Preview', () => {
  validateCandidate(msiCandidate(), 'release', commit, 'msi');
  assert.throws(() => validateCandidate(msiCandidate(), 'release', commit));
  assert.throws(() => validateCandidate(candidate('release'), 'release', commit, 'msi'));
  assert.throws(() => validateCandidate(msiCandidate(), 'preview', commit, 'msi'));
  assert.throws(() => validateCandidate(msiCandidate(), 'release', commit, 'zip'));
});

test('MSI rejects wrong filenames, missing or stale registration identity and changed bytes', () => {
  for (const mutate of [
    c => { c.installer.name = 'Phonton_0.4.0-beta.1_x64-setup.exe'; },
    c => { c.installer.name = '../Phonton_0.4.0-beta.1_x64_en-US.msi'; },
    c => { c.installer.name = 'Unrelated_0.4.0-beta.1_x64_en-US.msi'; },
    c => { delete c.msi; },
    c => { c.msi.ProductCode = '{------------------------------------}'; },
    c => { c.msi.ProductName = 'Phonton Preview'; },
    c => { c.msi.ProductVersion = '0.3.4'; },
  ]) { const c = msiCandidate(); mutate(c); assert.throws(() => validateCandidate(c, 'release', commit, 'msi')); }
  const c = msiCandidate(), bytes = Buffer.from('reviewed MSI');
  c.installer.sha256 = createHash('sha256').update(bytes).digest('hex');
  verifyInstaller(c, bytes);
  assert.throws(() => verifyInstaller(c, Buffer.from('different MSI')), /differs/);
});
