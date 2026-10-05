import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { expectedPreferences, validateUpgrade, verifyRetainedPreferences } from './windows-acceptance/upgrade-contract.mjs';

const source = JSON.parse(readFileSync(new URL('./windows-acceptance/upgrade-source.json', import.meta.url)));
const old = { ProductName: 'Phonton', ProductVersion: '0.3.4', ProductCode: '{AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA}', UpgradeCode: '{23B33ADC-634B-5AE1-B75F-DB97864022D0}' };
const msi = { ...old, ProductCode: '{BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB}', ProductVersion: '0.4.0.1' };
const candidate = {
  schema: 1, profile: 'release', identifier: 'dev.phonton.desktop', productName: 'Phonton', version: '0.4.0-beta.1',
  desktopCommit: source.candidate.commit, desktopSha256: '1'.repeat(64),
  installer: { kind: 'msi', name: 'Phonton_0.4.0-beta.1_x64_en-US.msi', sha256: source.candidate.installerSha256 },
  msi, engine: { profile: 'release', version: '0.22.0', sha256: '2'.repeat(64) },
  engineSource: { repository: 'phonton-dev/phonton-cli', version: '0.22.0', commit: '3'.repeat(40) },
};
const seed = {
  schema: 1, status: 'stable-closed', storage: 'default-webview', fixture: 'C:\\fixture', sentinel: 'unique-fixture',
  candidateCommit: candidate.desktopCommit, installerSha256: candidate.installer.sha256,
  stableIdentity: { productName: 'Phonton', identifier: candidate.identifier, version: '0.3.4' },
  preferences: expectedPreferences('C:\\fixture', 'unique-fixture'),
};
test('accept a pinned forward MSI upgrade and all named retained preferences', () => {
  validateUpgrade(source, candidate, old, msi);
  verifyRetainedPreferences(seed, { ...seed.preferences }, candidate);
});
test('reject wrong source, payload, product family, product code or version', () => {
  for (const modified of [
    { ...candidate, desktopCommit: '4'.repeat(40) },
    { ...candidate, installer: { ...candidate.installer, sha256: '5'.repeat(64) } },
  ]) assert.throws(() => validateUpgrade(source, modified, old, msi));
  for (const baseline of [
    { ...old, UpgradeCode: '{CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC}' },
    { ...old, ProductCode: msi.ProductCode },
    { ...old, ProductVersion: '0.4.0.1' },
  ]) assert.throws(() => validateUpgrade(source, candidate, baseline, msi));
  assert.throws(() => validateUpgrade(source, candidate, old, { ...msi, ProductName: 'Another app' }));
  for (const version of ['0.3.3', '0.3.4']) {
    const backward = { ...candidate, version, msi: { ...msi, ProductVersion: version },
      installer: { ...candidate.installer, name: `Phonton_${version}_x64_en-US.msi` } };
    assert.throws(() => validateUpgrade(source, backward, old, backward.msi), /forward version change/);
  }
});
test('missing, reset or differently scoped preferences fail before reseeding', () => {
  for (const key of Object.keys(seed.preferences)) {
    const missing = { ...seed.preferences }; delete missing[key];
    assert.throws(() => verifyRetainedPreferences(seed, missing, candidate));
    assert.throws(() => verifyRetainedPreferences(seed, { ...seed.preferences, [key]: null }, candidate));
    assert.throws(() => verifyRetainedPreferences(seed, { ...seed.preferences, [key]: 'different' }, candidate));
  }
  for (const altered of [
    { ...seed, status: 'running' }, { ...seed, storage: 'injected-profile' },
    { ...seed, candidateCommit: '6'.repeat(40) }, { ...seed, installerSha256: '7'.repeat(64) },
    { ...seed, stableIdentity: { ...seed.stableIdentity, version: '0.4.0-beta.1' } },
    { ...seed, preferences: { ...seed.preferences, 'phonton.theme': 'dark' } },
  ]) assert.throws(() => verifyRetainedPreferences(altered, altered.preferences, candidate));
});
