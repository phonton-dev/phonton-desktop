import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { windowsBundleIdentity } from './bundle-identity.mjs';
import { validateCandidate, validateConfiguration } from './candidate-profile.mjs';
import { extractMsiPayload } from './msi-payload.mjs';
import { validateMsiVersion } from '../release-metadata.mjs';

assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Run only on a disposable Actions runner');
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const sha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const pin = read('engine-source.json');
assert.equal(git('-C', process.env.PHONTON_ENGINE_SOURCE_DIR || 'engine-source', 'rev-parse', 'HEAD'), pin.commit);
const kind = process.env.PHONTON_ACCEPTANCE_KIND || 'preview';
const bundle = process.env.PHONTON_ACCEPTANCE_BUNDLE || 'nsis';
assert.ok(['nsis', 'msi'].includes(bundle), 'Unknown Windows bundle type');
if (bundle === 'msi') assert.equal(kind, 'release', 'MSI acceptance requires the release profile');
// Match Tauri's object merge / array replacement for these JSON configurations.
const merge = (base, patch) => {
  const result = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete result[key];
    else result[key] = typeof value === 'object' && !Array.isArray(value)
      ? merge(result[key] || {}, value) : value;
  }
  return result;
};
let config = merge(read('src-tauri/tauri.conf.json'), read('src-tauri/tauri.windows.conf.json'));
if (kind === 'preview') config = merge(config, read('src-tauri/tauri.local.conf.json'));
const identity = validateConfiguration(kind, config);
const folder = `src-tauri/target/release/bundle/${bundle}`;
const installers = readdirSync(folder).filter(name => name.endsWith(bundle === 'msi' ? '_x64_en-US.msi' : '_x64-setup.exe'));
assert.equal(installers.length, 1, 'Exactly one Windows installer required');
const installer = path.join(folder, installers[0]);
const extracted = path.resolve(`acceptance-extracted-${bundle}`);
let payload;
if (bundle === 'msi') {
  payload = extractMsiPayload(installer, extracted);
  validateMsiVersion(identity.version, payload.metadata.properties.ProductVersion);
  assert.equal(payload.metadata.properties.ProductName, identity.productName);
} else {
  mkdirSync(extracted); // Fresh extraction; do not accept leftovers from another build.
  execFileSync('7z', ['x', path.resolve(installer), `-o${extracted}`, '-y'], { stdio: 'pipe' });
}
const payloadFile = name => payload ? payload.files[name] : path.join(extracted, name);
const desktopIdentity = windowsBundleIdentity(
  readFileSync('src-tauri/target/release/phonton-desktop.exe'),
  readFileSync(payloadFile('phonton-desktop.exe')), bundle,
);
const engine = read('src-tauri/binaries/local-engine/manifest.json');
assert.equal(engine.profile, 'release');
assert.equal(engine.version, pin.version);
assert.equal(engine.sha256, sha256('src-tauri/binaries/local-engine/phonton.exe'));
assert.equal(engine.sha256, sha256(payloadFile('local-engine/phonton.exe')));
assert.deepEqual(read(payloadFile('local-engine/manifest.json')), engine);
const output = bundle === 'msi' ? 'acceptance-candidate-msi' : 'acceptance-candidate';
mkdirSync(output); // Each candidate has an independent, fresh manifest and payload.
copyFileSync(installer, path.join(output, installers[0]));
const candidate = {
  schema: 1, createdAt: new Date().toISOString(), desktopCommit: git('rev-parse', 'HEAD'),
  engineSource: pin, installer: { kind: bundle, name: installers[0], sha256: sha256(installer) },
  ...desktopIdentity, engine,
  ...identity,
  ...(payload ? { msi: payload.metadata.properties, msiPayload: payload.entries } : {}),
  rust: execFileSync('rustc', ['--version'], { encoding: 'utf8' }).trim(),
};
validateCandidate(candidate, kind, candidate.desktopCommit, bundle);
writeFileSync(path.join(output, 'candidate.json'), JSON.stringify(candidate, null, 2) + '\n');
console.log(JSON.stringify(candidate, null, 2));
