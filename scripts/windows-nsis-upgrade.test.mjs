import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { validateNsisRegistration, validateNsisUpgrade } from './windows-acceptance/nsis-upgrade-contract.mjs';

const source = JSON.parse(readFileSync(new URL('./windows-acceptance/nsis-upgrade-source.json', import.meta.url)));
const directory = 'D:\\runner temp\\Phonton NSIS upgrade acceptance';
const candidate = {
  schema: 1, profile: 'release', identifier: 'dev.phonton.desktop', productName: 'Phonton', version: '0.4.0-beta.1',
  desktopCommit: source.candidate.commit, desktopSha256: '1'.repeat(64),
  installer: { kind: 'nsis', name: 'Phonton_0.4.0-beta.1_x64-setup.exe', sha256: source.candidate.installerSha256 },
  engine: { profile: 'release', version: '0.22.0', sha256: '2'.repeat(64) },
  engineSource: { repository: 'phonton-dev/phonton-cli', version: '0.22.0', commit: '3'.repeat(40) },
};
function registration(version) {
  return { schema: 1,
    registrations: ['Registry64', 'Registry32'].map(view => ({ hive: 'CurrentUser', view,
      key: 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Phonton', values: {
        DisplayName: 'Phonton', DisplayVersion: version, Publisher: 'phonton', MainBinaryName: 'phonton-desktop.exe',
        InstallLocation: `"${directory}"`, UninstallString: `"${directory}\\uninstall.exe"`, NoModify: 1, NoRepair: 1,
      } })),
    savedDirectories: ['Registry64', 'Registry32'].map(view => ({ hive: 'CurrentUser', view,
      key: 'Software\\phonton\\Phonton', directory })),
  };
}
test('NSIS upgrade accepts only the pinned forward candidate and installer kind', () => {
  validateNsisUpgrade(source, candidate);
  for (const changed of [
    { ...candidate, desktopCommit: '4'.repeat(40) },
    { ...candidate, version: '0.3.4' },
    { ...candidate, installer: { ...candidate.installer, kind: 'msi' } },
    { ...candidate, installer: { ...candidate.installer, sha256: '5'.repeat(64) } },
  ]) assert.throws(() => validateNsisUpgrade(source, changed));
});
test('NSIS registration retains one current-user product across shared registry views', () => {
  for (const version of ['0.3.4', candidate.version]) validateNsisRegistration(registration(version), version, directory);
});
test('NSIS registration rejects stale version, incorrect payload fields and conflicting scopes', () => {
  for (const [field, value] of Object.entries({ DisplayName: 'Phonton Preview', DisplayVersion: '0.3.4',
    Publisher: 'wrong', MainBinaryName: 'other.exe', InstallLocation: '"C:\\elsewhere"',
    UninstallString: '"C:\\elsewhere\\uninstall.exe"', NoModify: 0, NoRepair: 0 })) {
    const changed = registration(candidate.version);
    for (const item of changed.registrations) item.values[field] = value;
    assert.throws(() => validateNsisRegistration(changed, candidate.version, directory));
  }
  for (const alter of [
    value => { value.registrations = []; },
    value => { value.registrations[0].hive = 'LocalMachine'; },
    value => { value.registrations[1].hive = 'LocalMachine'; },
    value => { value.registrations[1].key += ' Preview'; },
    value => { value.registrations[1].values.DisplayVersion = '0.3.4'; },
    value => { value.registrations.push(structuredClone(value.registrations[0])); },
    value => { value.registrations[1].view = 'Registry64'; },
    value => { value.savedDirectories = []; },
    value => { value.savedDirectories[0].directory = 'C:\\wrong'; },
    value => { value.savedDirectories[1].hive = 'LocalMachine'; },
    value => { value.savedDirectories[1].view = 'Registry64'; },
  ]) {
    const changed = registration(candidate.version); alter(changed);
    assert.throws(() => validateNsisRegistration(changed, candidate.version, directory));
  }
});
