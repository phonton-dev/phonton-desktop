import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const originalMarker = Buffer.from('__TAURI_BUNDLE_TYPE_VAR_UNK');
const markers = { nsis: '__TAURI_BUNDLE_TYPE_VAR_NSS', msi: '__TAURI_BUNDLE_TYPE_VAR_MSI' };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// Tauri patches one marker per installer and restores the raw build afterwards.
// This exact comparison covers unsigned candidates, not publisher-signed binaries.
export function windowsBundleIdentity(compiled, packaged, bundle) {
  assert.ok(Object.hasOwn(markers, bundle), 'Unknown Windows bundle type');
  const offset = compiled.indexOf(originalMarker);
  assert.ok(offset >= 0, 'Unbundled Desktop marker missing');
  assert.equal(compiled.indexOf(originalMarker, offset + 1), -1, 'Ambiguous Desktop bundle marker');
  const expected = Buffer.from(compiled);
  Buffer.from(markers[bundle]).copy(expected, offset);
  assert.ok(packaged.equals(expected), `Packaged Desktop differs beyond the expected ${bundle.toUpperCase()} marker`);
  return { desktopSha256: sha256(packaged), unbundledDesktopSha256: sha256(compiled), bundleMarkerOffset: offset };
}

export const nsisBundleIdentity = (compiled, packaged) => windowsBundleIdentity(compiled, packaged, 'nsis');
