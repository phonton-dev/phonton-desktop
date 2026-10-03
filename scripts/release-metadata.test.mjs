import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReleaseVersions } from './release-metadata.mjs';

test('beta is a prerelease and stable is not', () => {
  assert.equal(validateReleaseVersions('v0.4.0-beta.1', { npm: '0.4.0-beta.1', rust: '0.4.0-beta.1' }).prerelease, true);
  assert.equal(validateReleaseVersions('v0.4.0', { npm: '0.4.0' }).prerelease, false);
});
test('a tag cannot publish mismatched or invalid package identity', () => {
  assert.throws(() => validateReleaseVersions('v0.4.0-beta.1', { npm: '0.3.4' }), /tag requires/);
  assert.throws(() => validateReleaseVersions('latest', { npm: '0.4.0' }), /Unsupported/);
});
