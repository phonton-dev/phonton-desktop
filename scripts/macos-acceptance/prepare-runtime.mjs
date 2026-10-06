import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statfsSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
assert.equal(process.env.GITHUB_ACTIONS, 'true'); assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
assert.equal(process.env.GITHUB_EVENT_NAME, 'workflow_dispatch'); assert.equal(process.env.RUNNER_OS, 'macOS');
assert.equal(process.env.GITHUB_REPOSITORY, 'phonton-dev/phonton-desktop');
const pin = JSON.parse(readFileSync('scripts/macos-acceptance/runtime-source.json', 'utf8'));
const temporary = realpathSync(process.env.RUNNER_TEMP);
const capacity = statfsSync(temporary);
assert.ok(capacity.bavail * capacity.bsize >= 12 * 1024 ** 3, 'Need 12 GiB before runtime/model preparation');
const output = (command, args) => execFileSync(command, args, { encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 ** 2 }).trim();
async function hash(file) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
const asset = JSON.parse(output('gh', ['api', `repos/ollama/ollama/releases/assets/${pin.assetId}`]));
assert.equal(asset.name, pin.name); assert.equal(asset.browser_download_url, pin.url);
assert.equal(asset.digest, 'sha256:' + pin.sha256); assert.equal(asset.size, pin.bytes);
const directory = path.join(temporary, 'phonton-macos-external-runtime');
assert.equal(existsSync(directory), false, 'Do not reuse an external runtime'); mkdirSync(directory);
const archive = path.join(directory, pin.name);
execFileSync('/usr/bin/curl', ['--fail', '--location', '--silent', '--show-error', '--max-time', '600', '--output', archive, pin.url], { stdio: 'inherit', timeout: 610000 });
assert.equal(statSync(archive).size, pin.bytes); assert.equal(await hash(archive), pin.sha256);
const payload = path.join(directory, 'payload');
const entries = JSON.parse(output('python3', ['-B', 'scripts/macos-acceptance/extract_runtime.py', archive, payload]));
const runtime = path.join(payload, 'ollama');
assert.ok(lstatSync(runtime).isFile() && !lstatSync(runtime).isSymbolicLink());
assert.equal(realpathSync(runtime), runtime);
const architecture = output('/usr/bin/lipo', ['-archs', runtime]).split(/\s+/);
assert.ok(architecture.includes('arm64'), 'Pinned external runtime must include ARM64');
const report = { schema: 1, runtime, runtimeSha256: await hash(runtime), archiveSha256: pin.sha256,
  version: pin.version, architecture, assetId: pin.assetId, archiveBytes: pin.bytes, entries,
  scope: 'Verified external runtime bytes and ARM64 payload on disposable Mac; no server/model or trusted-publisher acceptance yet' };
writeFileSync('acceptance-evidence/runtime-install.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log('Pinned Darwin runtime bytes and ARM64 payload verified; runtime has not been started.');
