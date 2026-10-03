import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Run only on a disposable Actions runner');
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const sha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const pin = read('engine-source.json');
assert.equal(git('-C', 'engine-source', 'rev-parse', 'HEAD'), pin.commit);
const preview = read('src-tauri/tauri.local.conf.json');
assert.equal(preview.identifier, 'dev.phonton.desktop.preview');
assert.deepEqual(preview.plugins.updater.endpoints, []);
assert.equal(preview.bundle.createUpdaterArtifacts, false);
const folder = 'src-tauri/target/release/bundle/nsis';
const installers = readdirSync(folder).filter(name => name.endsWith('_x64-setup.exe'));
assert.equal(installers.length, 1, 'Exactly one Preview installer required');
const installer = path.join(folder, installers[0]);
const engine = read('src-tauri/binaries/local-engine.json');
assert.equal(engine.profile, 'release');
assert.equal(engine.version, pin.version);
assert.equal(engine.sha256, sha256('src-tauri/binaries/phonton-engine.exe'));
mkdirSync('acceptance-candidate', { recursive: true });
copyFileSync(installer, path.join('acceptance-candidate', installers[0]));
const candidate = {
  schema: 1, createdAt: new Date().toISOString(), desktopCommit: git('rev-parse', 'HEAD'),
  engineSource: pin, installer: { name: installers[0], sha256: sha256(installer) },
  desktopSha256: sha256('src-tauri/target/release/phonton-desktop.exe'), engine,
  profile: 'unsigned-preview', identifier: preview.identifier,
  rust: execFileSync('rustc', ['--version'], { encoding: 'utf8' }).trim(),
};
writeFileSync('acceptance-candidate/candidate.json', JSON.stringify(candidate, null, 2) + '\n');
console.log(JSON.stringify(candidate, null, 2));
