import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReleaseVersions, validateMsiVersion } from './release-metadata.mjs';

test('beta is a prerelease and stable is not', () => {
  assert.equal(validateReleaseVersions('v0.4.0-beta.1', { npm: '0.4.0-beta.1', rust: '0.4.0-beta.1' }).prerelease, true);
  assert.equal(validateReleaseVersions('v0.4.0', { npm: '0.4.0' }).prerelease, false);
});
test('a tag cannot publish mismatched or invalid package identity', () => {
  assert.throws(() => validateReleaseVersions('v0.4.0-beta.1', { npm: '0.3.4' }), /tag requires/);
  assert.throws(() => validateReleaseVersions('latest', { npm: '0.4.0' }), /Unsupported/);
});

test('beta MSI metadata is numeric while the app retains its semantic beta identity', () => {
  const app = validateReleaseVersions('v0.4.0-beta.1', { app: '0.4.0-beta.1' });
  assert.equal(validateMsiVersion(app.version, '0.4.0.1'), '0.4.0.1');
  assert.equal(app.version, '0.4.0-beta.1');
  assert.equal(validateMsiVersion('0.4.0-beta.2', '0.4.0.2'), '0.4.0.2');
});
test('MSI preflight rejects missing metadata and stale values on the next beta or stable release', () => {
  for (const [app, msi] of [['0.4.0-beta.1', undefined], ['0.4.0-beta.1', '0.4.0-beta.1'], ['0.4.0-beta.2', '0.4.0.1'], ['0.4.0', '0.4.0.1']]) {
    assert.throws(() => validateMsiVersion(app, msi), /requires/);
  }
  assert.equal(validateMsiVersion('0.4.0', '0.4.0'), '0.4.0');
});
test('MSI preflight rejects unsupported channels and Windows numeric overflow before compilation', () => {
  assert.throws(() => validateMsiVersion('0.4.0-rc.1', '0.4.0.1'), /define a mapping/);
  for (const version of ['256.0.0', '0.256.0', '0.4.65536', '0.4.0-beta.65536']) {
    assert.throws(() => validateMsiVersion(version, '0.4.0.1'), /numeric limits/);
  }
  assert.equal(validateMsiVersion('255.255.65535-beta.65535', '255.255.65535.65535'), '255.255.65535.65535');
});
