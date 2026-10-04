import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { nsisBundleIdentity } from './bundle-identity.mjs';
import { validateConfiguration } from './candidate-profile.mjs';

assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Run only on a disposable Actions runner');
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const sha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const pin = read('engine-source.json');
assert.equal(git('-C', process.env.PHONTON_ENGINE_SOURCE_DIR || 'engine-source', 'rev-parse', 'HEAD'), pin.commit);
const kind = process.env.PHONTON_ACCEPTANCE_KIND || 'preview';
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
const folder = 'src-tauri/target/release/bundle/nsis';
const installers = readdirSync(folder).filter(name => name.endsWith('_x64-setup.exe'));
assert.equal(installers.length, 1, 'Exactly one Windows installer required');
const installer = path.join(folder, installers[0]);
const extracted = path.resolve('acceptance-extracted');
mkdirSync(extracted); // Fresh extraction; do not accept leftovers from another build.
execFileSync('7z', ['x', path.resolve(installer), `-o${extracted}`, '-y'], { stdio: 'pipe' });
const desktopIdentity = nsisBundleIdentity(
  readFileSync('src-tauri/target/release/phonton-desktop.exe'),
  readFileSync(path.join(extracted, 'phonton-desktop.exe')),
);
const engine = read('src-tauri/binaries/local-engine.json');
assert.equal(engine.profile, 'release');
assert.equal(engine.version, pin.version);
assert.equal(engine.sha256, sha256('src-tauri/binaries/phonton-engine.exe'));
assert.equal(engine.sha256, sha256(path.join(extracted, 'local-engine/phonton.exe')));
assert.deepEqual(read(path.join(extracted, 'local-engine/manifest.json')), engine);
mkdirSync('acceptance-candidate', { recursive: true });
copyFileSync(installer, path.join('acceptance-candidate', installers[0]));
const candidate = {
  schema: 1, createdAt: new Date().toISOString(), desktopCommit: git('rev-parse', 'HEAD'),
  engineSource: pin, installer: { name: installers[0], sha256: sha256(installer) },
  ...desktopIdentity, engine,
  ...identity,
  rust: execFileSync('rustc', ['--version'], { encoding: 'utf8' }).trim(),
};
writeFileSync('acceptance-candidate/candidate.json', JSON.stringify(candidate, null, 2) + '\n');
console.log(JSON.stringify(candidate, null, 2));
