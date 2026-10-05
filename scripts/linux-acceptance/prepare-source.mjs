import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, closeSync, createReadStream, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { verifyLinuxCandidate } from './contract.mjs';

assert.equal(process.platform, 'linux');
assert.equal(process.env.GITHUB_ACTIONS, 'true');
assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
assert.equal(process.env.GITHUB_REPOSITORY, 'phonton-dev/phonton-desktop');
assert.ok(path.isAbsolute(process.env.RUNNER_TEMP ?? ''));
const pin = JSON.parse(readFileSync('scripts/linux-acceptance/source.json', 'utf8'));
assert.equal(pin.repository, process.env.GITHUB_REPOSITORY);
assert.deepEqual(pin.engine, JSON.parse(readFileSync('engine-source.json', 'utf8')));
assert.match(pin.engine.commit, /^[a-f0-9]{40}$/);
const api = route => execFileSync('gh', ['api', `repos/${pin.repository}/${route}`], { timeout: 60000, maxBuffer: 32 * 1024 ** 2 });
const run = JSON.parse(api(`actions/runs/${pin.runId}`));
const jobs = JSON.parse(api(`actions/runs/${pin.runId}/jobs?per_page=100`));
assert.equal(jobs.jobs.length, jobs.total_count, 'Do not silently truncate build-job evidence');
const artifact = JSON.parse(api(`actions/artifacts/${pin.artifact.id}`));
const buildLog = api(`actions/jobs/${pin.buildJobId}/logs`).toString('utf8');
verifyLinuxCandidate(pin, run, jobs.jobs, artifact, buildLog);
// The test harness may advance; application and all build inputs stay identical.
execFileSync('git', ['diff', '--exit-code', pin.commit, 'HEAD', '--', 'src', 'src-tauri', 'public', 'index.html',
  'package.json', 'package-lock.json', '.npmrc', 'Cargo.toml', 'Cargo.lock', 'engine-source.json', 'vite.config.*', 'tsconfig*.json',
  'postcss.config.*', 'tailwind.config.*', 'scripts/prepare-local-engine.mjs', 'scripts/engine-build-profile.mjs'], { stdio: 'pipe' });
const evidence = path.resolve('acceptance-evidence');
mkdirSync(evidence);
for (const [name, value] of [['source', pin], ['candidate-run', run], ['candidate-jobs', jobs], ['candidate-artifact', artifact]]) {
  writeFileSync(path.join(evidence, name + '.json'), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
}
writeFileSync(path.join(evidence, 'candidate-linux-build.log'), buildLog, { flag: 'wx' });
const root = path.join(process.env.RUNNER_TEMP, 'phonton-linux-candidate');
mkdirSync(root);
const archive = path.join(root, 'candidate.zip');
const output = openSync(archive, 'wx');
try {
  const download = spawnSync('gh', ['api', `repos/${pin.repository}/actions/artifacts/${pin.artifact.id}/zip`], {
    stdio: ['ignore', output, 'pipe'], timeout: 600000,
  });
  assert.ifError(download.error);
  assert.equal(download.status, 0, 'Pinned artifact download failed');
} finally { closeSync(output); }
async function hash(file) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
assert.equal(await hash(archive), pin.artifact.sha256, 'Downloaded ZIP differs from GitHub artifact digest');
const destination = path.join(root, 'bundle');
execFileSync('python3', ['scripts/linux-acceptance/extract.py', archive, destination], { stdio: 'inherit' });
const payloads = {};
for (const [kind, directory] of [['deb', 'deb'], ['appImage', 'appimage']]) {
  const file = path.join(destination, directory, pin[kind].name);
  assert.equal(await hash(file), pin[kind].sha256, `${kind} payload differs from the reviewed pin`);
  payloads[kind] = file;
}
const report = { schema: 1, harnessCommit: process.env.GITHUB_SHA, candidateCommit: pin.commit, runId: pin.runId,
  buildJobId: pin.buildJobId, artifactId: artifact.id, archiveSha256: pin.artifact.sha256, payloads,
  scope: 'Verified download and source identity; no installed or native UI claim' };
writeFileSync(path.join(evidence, 'download.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log('Exact Linux candidate ZIP and both payload hashes verified.');
appendFileSync(process.env.GITHUB_OUTPUT, `engine_sha=${pin.engine.commit}\n`);
