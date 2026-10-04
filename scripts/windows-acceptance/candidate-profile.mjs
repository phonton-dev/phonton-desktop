import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';

const profiles = {
  preview: { profile: 'unsigned-preview', identifier: 'dev.phonton.desktop.preview', productName: 'Phonton Preview' },
  release: { profile: 'release', identifier: 'dev.phonton.desktop', productName: 'Phonton' },
};

export function expectedProfile(kind) {
  assert.ok(Object.hasOwn(profiles, kind), 'Unknown acceptance profile');
  return { ...profiles[kind] };
}

export function validateConfiguration(kind, config) {
  const expected = expectedProfile(kind);
  assert.equal(config.identifier, expected.identifier, 'Unexpected application identifier');
  assert.equal(config.productName, expected.productName, 'Unexpected application name');
  assert.match(config.version, /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/);
  assert.deepEqual(config.plugins['deep-link'].desktop.schemes, [kind === 'preview' ? 'phonton-preview' : 'phonton']);
  assert.equal(config.bundle.createUpdaterArtifacts, kind === 'release');
  assert.deepEqual(config.plugins.updater.endpoints, kind === 'preview' ? [] : [
    'https://github.com/phonton-dev/phonton-desktop/releases/latest/download/latest.json',
  ]);
  if (kind === 'release') assert.ok(config.plugins.updater.pubkey, 'Release updater public key required');
  assert.equal(config.bundle.resources['binaries/phonton-engine.exe'], 'local-engine/phonton.exe');
  assert.equal(config.bundle.resources['binaries/local-engine.json'], 'local-engine/manifest.json');
  return { ...expected, version: config.version };
}

export function validateCandidate(candidate, kind, commit) {
  assert.equal(candidate.schema, 1);
  for (const [key, value] of Object.entries(expectedProfile(kind))) assert.equal(candidate[key], value, `Unexpected candidate ${key}`);
  assert.match(commit, /^[a-f0-9]{40}$/);
  assert.equal(candidate.desktopCommit, commit, 'Candidate source is not this workflow commit');
  assert.match(candidate.version, /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/);
  assert.equal(candidate.installer.name, path.win32.basename(candidate.installer.name), 'Invalid installer filename');
  assert.match(candidate.installer.name, /_x64-setup\.exe$/);
  for (const digest of [candidate.installer.sha256, candidate.desktopSha256, candidate.engine.sha256]) assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(candidate.engine.profile, 'release');
  assert.equal(candidate.engine.version, candidate.engineSource.version);
  assert.equal(candidate.engineSource.repository, 'phonton-dev/phonton-cli');
  assert.match(candidate.engineSource.commit, /^[a-f0-9]{40}$/);
}

export function verifyInstaller(candidate, bytes) {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), candidate.installer.sha256, 'Draft installer differs from the acceptance candidate');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const candidate = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  validateCandidate(candidate, process.argv[3], process.argv[4]);
  if (process.argv[5]) verifyInstaller(candidate, readFileSync(path.join(process.argv[5], candidate.installer.name)));
}
