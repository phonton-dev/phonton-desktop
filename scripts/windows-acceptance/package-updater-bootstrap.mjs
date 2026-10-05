import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { bootstrapVersion, makeUpdaterBootstrapOverride, requireDisposableUpdaterRunner } from './updater-bootstrap.mjs';
import { loadUpdaterCandidate } from './updater-artifacts.mjs';
import { windowsBundleIdentity } from './bundle-identity.mjs';

requireDisposableUpdaterRunner();
const read = file => JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const { candidate } = loadUpdaterCandidate();
const config = read('src-tauri/tauri.conf.json');
const override = read(path.join(process.env.RUNNER_TEMP, 'phonton-updater-bootstrap.json'));
assert.deepEqual(override, makeUpdaterBootstrapOverride(config));
const pin = read('engine-source.json');
assert.deepEqual(pin, candidate.engineSource);
assert.equal(execFileSync('git', ['-C', 'phonton-dev', 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), pin.commit);
const name = `Phonton_${bootstrapVersion}_x64-setup.exe`;
const directory = 'src-tauri/target/release/bundle/nsis';
assert.deepEqual(readdirSync(directory).filter(file => file.endsWith('.exe')), [name], 'Only the labelled bootstrap belongs in this output');
const installer = path.resolve(directory, name);
const extracted = path.join(process.env.RUNNER_TEMP, 'phonton-updater-bootstrap-extracted');
mkdirSync(extracted);
execFileSync('7z', ['x', installer, `-o${extracted}`, '-y'], { stdio: 'pipe', windowsHide: true });
const identity = windowsBundleIdentity(readFileSync('src-tauri/target/release/phonton-desktop.exe'), readFileSync(path.join(extracted, 'phonton-desktop.exe')), 'nsis');
const engine = read(path.join(extracted, 'local-engine/manifest.json'));
assert.equal(engine.profile, 'release');
assert.equal(engine.version, pin.version);
assert.equal(engine.sha256, hash(path.join(extracted, 'local-engine/phonton.exe')));
assert.deepEqual(engine, read('src-tauri/binaries/local-engine/manifest.json'));
const record = { schema: 1, kind: 'controlled-updater-bootstrap', harnessCommit: process.env.GITHUB_SHA,
  productName: config.productName, identifier: config.identifier, version: bootstrapVersion,
  installer: { name, path: installer, sha256: hash(installer) }, ...identity, engine,
  endpoint: override.plugins.updater.endpoints[0], updaterPublicKey: override.plugins.updater.pubkey,
  windowTitle: override.app.windows[0].title, limitation: 'Labelled test bootstrap; never a public installer.' };
writeFileSync('acceptance-evidence/updater-bootstrap.json', JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
