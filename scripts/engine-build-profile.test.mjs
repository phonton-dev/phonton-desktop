import assert from 'node:assert/strict';
import { test } from 'node:test';
import { engineBuildProfile } from './engine-build-profile.mjs';

test('release hooks with an omitted debug variable package the release engine', () => {
  assert.equal(engineBuildProfile(['--tauri'], {}), 'release');
  assert.equal(engineBuildProfile(['--tauri'], { TAURI_ENV_DEBUG: 'false' }), 'release');
  assert.equal(engineBuildProfile(['--tauri'], { TAURI_ENV_DEBUG: 'true' }), 'debug');
});

test('manual profiles remain explicit and invalid hook values fail closed', () => {
  assert.equal(engineBuildProfile([], { TAURI_ENV_DEBUG: 'true' }), 'release');
  assert.equal(engineBuildProfile(['--debug'], {}), 'debug');
  assert.throws(() => engineBuildProfile(['--tauri'], { TAURI_ENV_DEBUG: 'maybe' }), /unknown/);
  assert.throws(() => engineBuildProfile(['--debug', '--tauri'], {}), /Usage/);
  assert.throws(() => engineBuildProfile(['--invalid'], {}), /Usage/);
});
