import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { requireDisposableUpdaterRunner } from './updater-bootstrap.mjs';
import { validateUpdaterPin, verifyUpdaterRun } from './updater-contract.mjs';

requireDisposableUpdaterRunner();
const pin = JSON.parse(process.env.PHONTON_UPDATER_PIN);
validateUpdaterPin(pin);
const api = route => JSON.parse(execFileSync('gh', ['api', `repos/${pin.repository}/${route}`], { encoding: 'utf8', windowsHide: true }));
const run = api(`actions/runs/${pin.runId}`);
const artifacts = [api(`actions/artifacts/${pin.candidateArtifact.id}`), api(`actions/artifacts/${pin.bundleArtifact.id}`)];
verifyUpdaterRun(pin, run, artifacts);
// A harness-only follow-up may test an accepted earlier commit, but its app,
// dependency, engine and production updater inputs must remain identical.
execFileSync('git', ['diff', '--exit-code', pin.commit, 'HEAD', '--', 'src', 'src-tauri', 'public', 'index.html',
  'package.json', 'package-lock.json', '.npmrc', 'Cargo.toml', 'Cargo.lock', 'engine-source.json', 'vite.config.*', 'tsconfig*.json',
  'postcss.config.*', 'tailwind.config.*', 'scripts/prepare-local-engine.mjs', 'scripts/engine-build-profile.mjs'], { stdio: 'pipe', windowsHide: true });
mkdirSync('acceptance-evidence');
for (const [file, value] of [['updater-pin', pin], ['updater-candidate-run', run], ['updater-candidate-artifacts', artifacts]]) {
  writeFileSync(`acceptance-evidence/${file}.json`, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
}
const engine = JSON.parse(readFileSync('engine-source.json', 'utf8'));
assert.equal(engine.repository, 'phonton-dev/phonton-cli');
assert.match(engine.commit, /^[a-f0-9]{40}$/);
appendFileSync(process.env.GITHUB_OUTPUT, `run_id=${pin.runId}\ncandidate_id=${pin.candidateArtifact.id}\nbundle_id=${pin.bundleArtifact.id}\nengine_sha=${engine.commit}\nengine_version=${engine.version}\n`);
