import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { validateCandidate } from './candidate-profile.mjs';
import { validateUpdaterPin } from './updater-contract.mjs';
import { createUpdaterFixture } from './updater-fixture.mjs';

export function loadUpdaterCandidate() {
  const pin = JSON.parse(readFileSync('acceptance-evidence/updater-pin.json', 'utf8'));
  validateUpdaterPin(pin);
  const manifestBytes = readFileSync('acceptance-candidate/candidate.json');
  const candidate = JSON.parse(manifestBytes.toString('utf8'));
  validateCandidate(candidate, 'release', pin.commit, 'nsis');
  const installerBytes = readFileSync(path.join('acceptance-candidate', candidate.installer.name));
  const signatureBytes = readFileSync(path.join('updater-bundles/nsis', candidate.installer.name + '.sig'));
  // Verify before installing even the bootstrap, not only when serving payloads.
  const fixture = createUpdaterFixture({ pin, manifestBytes, installerBytes, signatureBytes });
  assert.equal(candidate.version, '0.4.0-beta.1');
  return { pin, candidate, fixture };
}
