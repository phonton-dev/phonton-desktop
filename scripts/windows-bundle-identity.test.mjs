import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nsisBundleIdentity } from './windows-acceptance/bundle-identity.mjs';

test('NSIS identity uses delivered bytes and preserves the raw build identity', () => {
  const raw = Buffer.from('prefix__TAURI_BUNDLE_TYPE_VAR_UNKsuffix');
  const packaged = Buffer.from('prefix__TAURI_BUNDLE_TYPE_VAR_NSSsuffix');
  const identity = nsisBundleIdentity(raw, packaged);
  assert.notEqual(identity.desktopSha256, identity.unbundledDesktopSha256);
  assert.equal(identity.bundleMarkerOffset, 6);
  assert.equal(raw.toString(), 'prefix__TAURI_BUNDLE_TYPE_VAR_UNKsuffix');
});

test('NSIS identity rejects unrelated mutations, unpatched bytes and ambiguous markers', () => {
  const raw = Buffer.from('prefix__TAURI_BUNDLE_TYPE_VAR_UNKsuffix');
  assert.throws(() => nsisBundleIdentity(raw, Buffer.from('prefix__TAURI_BUNDLE_TYPE_VAR_NSSchanged')), /differs beyond/);
  assert.throws(() => nsisBundleIdentity(raw, raw), /differs beyond/);
  assert.throws(() => nsisBundleIdentity(Buffer.from('missing'), Buffer.from('missing')), /marker missing/);
  assert.throws(() => nsisBundleIdentity(Buffer.concat([raw, raw]), raw), /Ambiguous/);
});
