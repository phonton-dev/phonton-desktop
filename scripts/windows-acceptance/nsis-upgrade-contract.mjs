import assert from 'node:assert/strict';
import path from 'node:path';
import { validateCandidate } from './candidate-profile.mjs';

const uninstallKey = 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Phonton';
const productKey = 'Software\\phonton\\Phonton';
const normalize = value => path.win32.normalize(value).toLowerCase();

export function validateNsisUpgrade(source, candidate) {
  assert.equal(source.schema, 1);
  assert.equal(source.repository, 'phonton-dev/phonton-desktop');
  assert.equal(source.baseline.version, '0.3.4');
  assert.equal(source.baseline.name, 'Phonton_0.3.4_x64-setup.exe');
  validateCandidate(candidate, 'release', source.candidate.commit, 'nsis');
  assert.equal(candidate.version, '0.4.0-beta.1', 'This gate covers only the pinned forward upgrade');
  assert.equal(candidate.installer.sha256, source.candidate.installerSha256);
}

export function validateNsisRegistration(observation, version, directory) {
  assert.equal(observation.schema, 1);
  assert.ok(path.win32.isAbsolute(directory));
  // HKCU Software is shared across registry views. Keep both observations, but
  // accept the duplicate only when it has the same identity and every value.
  const canonical = observation.registrations.find(item => item.hive === 'CurrentUser' && item.view === 'Registry64' && item.key === uninstallKey);
  assert.ok(canonical, 'Expected current-user NSIS registration');
  assert.ok(observation.registrations.length <= 2, 'Unexpected competing Phonton registration');
  const views = new Set();
  for (const item of observation.registrations) {
    assert.equal(item.hive, 'CurrentUser', 'Unexpected machine-wide registration');
    assert.equal(item.key, uninstallKey, 'Unexpected second product registration');
    assert.ok(['Registry64', 'Registry32'].includes(item.view) && !views.has(item.view));
    views.add(item.view);
    assert.deepEqual(item.values, canonical.values, 'Registry views disagree');
  }
  const values = canonical.values;
  assert.equal(values.DisplayName, 'Phonton');
  assert.equal(values.DisplayVersion, version);
  assert.equal(values.Publisher, 'phonton');
  assert.equal(values.MainBinaryName, 'phonton-desktop.exe');
  assert.equal(values.NoModify, 1);
  assert.equal(values.NoRepair, 1);
  assert.equal(values.InstallLocation, `"${directory}"`);
  assert.equal(values.UninstallString, `"${path.win32.join(directory, 'uninstall.exe')}"`);
  const saved = observation.savedDirectories;
  assert.ok(saved.length > 0 && saved.length <= 2, 'Missing or ambiguous saved install directory');
  assert.ok(saved.some(item => item.view === 'Registry64'));
  const savedViews = new Set();
  for (const item of saved) {
    assert.equal(item.hive, 'CurrentUser');
    assert.equal(item.key, productKey);
    assert.ok(['Registry64', 'Registry32'].includes(item.view) && !savedViews.has(item.view));
    savedViews.add(item.view);
    assert.equal(normalize(item.directory), normalize(directory), 'Installer location discovery changed');
  }
  return canonical;
}
