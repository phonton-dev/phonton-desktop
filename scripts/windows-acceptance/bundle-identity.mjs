import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const originalMarker = Buffer.from('__TAURI_BUNDLE_TYPE_VAR_UNK');
const nsisMarker = Buffer.from('__TAURI_BUNDLE_TYPE_VAR_NSS');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// Tauri patches the bundle marker before NSIS packaging and restores the build
// output afterwards. Accept only that exact transformation for unsigned Preview.
export function nsisBundleIdentity(compiled, packaged) {
  const offset = compiled.indexOf(originalMarker);
  assert.ok(offset >= 0, 'Unbundled Desktop marker missing');
  assert.equal(compiled.indexOf(originalMarker, offset + 1), -1, 'Ambiguous Desktop bundle marker');
  const expected = Buffer.from(compiled);
  nsisMarker.copy(expected, offset);
  assert.ok(packaged.equals(expected), 'Packaged Desktop differs beyond the expected NSIS marker');
  return { desktopSha256: sha256(packaged), unbundledDesktopSha256: sha256(compiled), bundleMarkerOffset: offset };
}
