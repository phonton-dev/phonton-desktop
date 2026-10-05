import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, createReadStream, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

assert.equal(process.platform, 'linux');
assert.equal(process.env.GITHUB_ACTIONS, 'true');
assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const pin = read('scripts/linux-acceptance/source.json');
const download = read('acceptance-evidence/download.json');
assert.equal(download.candidateCommit, pin.commit);
const temporary = realpathSync(process.env.RUNNER_TEMP);
const output = (command, args) => execFileSync(command, args, { encoding: 'utf8', timeout: 120000 }).trim();
async function hash(file) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
for (const kind of ['deb', 'appImage']) assert.equal(await hash(download.payloads[kind]), pin[kind].sha256);
assert.equal(output('dpkg-deb', ['-f', download.payloads.deb, 'Package']), 'phonton');
assert.equal(output('dpkg-deb', ['-f', download.payloads.deb, 'Version']), '0.4.0-beta.1');
assert.equal(output('dpkg-deb', ['-f', download.payloads.deb, 'Architecture']), 'amd64');
const prior = spawnSync('dpkg-query', ['-W', '-f=${Status}', 'phonton'], { encoding: 'utf8' });
assert.notEqual(prior.status, 0, 'Do not overwrite an existing Desktop installation');
execFileSync('sudo', ['apt-get', 'install', '-y', download.payloads.deb], { stdio: 'inherit', timeout: 600000 });
assert.equal(output('dpkg-query', ['-W', '-f=${Status}', 'phonton']), 'install ok installed');
const app = '/usr/bin/phonton-desktop';
assert.equal(realpathSync(app), app); assert.equal(await hash(app), pin.desktopSha256);
assert.equal(output('git', ['-C', 'phonton-dev', 'rev-parse', 'HEAD']), pin.engine.commit);
const engineSource = path.resolve('phonton-dev/target/release/phonton');
assert.match(output(engineSource, ['version']), /^phonton 0\.22\.0(?:\s|$)/);
assert.equal(existsSync('/usr/local/bin/phonton'), false, 'Do not replace an existing external CLI');
execFileSync('sudo', ['install', '-m', '755', engineSource, '/usr/local/bin/phonton']);
const engine = '/usr/local/bin/phonton';
assert.equal(await hash(engine), await hash(engineSource));
assert.equal(output('sh', ['-c', 'command -v phonton']), engine);

// Verify upstream metadata and bytes before extracting or executing this external runtime.
const asset = JSON.parse(output('gh', ['api', `repos/ollama/ollama/releases/assets/${pin.ollama.assetId}`]));
assert.equal(asset.browser_download_url, pin.ollama.url);
assert.equal(asset.digest, 'sha256:' + pin.ollama.sha256); assert.equal(asset.size, pin.ollama.bytes);
const runtimeDirectory = path.join(temporary, 'phonton-external-ollama');
assert.equal(existsSync(runtimeDirectory), false); mkdirSync(runtimeDirectory);
const archive = path.join(runtimeDirectory, 'ollama.tar.zst');
execFileSync('curl', ['--fail', '--location', '--silent', '--show-error', '--max-time', '600', '--output', archive, pin.ollama.url], { stdio: 'inherit', timeout: 610000 });
assert.equal(statSync(archive).size, pin.ollama.bytes); assert.equal(await hash(archive), pin.ollama.sha256);
execFileSync('tar', ['--zstd', '-xf', archive, '-C', runtimeDirectory], { stdio: 'inherit', timeout: 600000 });
const runtime = realpathSync(path.join(runtimeDirectory, 'bin/ollama'));
assert.ok(runtime.startsWith(runtimeDirectory + path.sep));
chmodSync(download.payloads.appImage, 0o755);
const report = { schema: 1, candidateCommit: pin.commit, package: { name: 'phonton', version: '0.4.0-beta.1', architecture: 'amd64', sha256: pin.deb.sha256 },
  app, desktopSha256: await hash(app), engine, engineSha256: await hash(engine), engineCommit: pin.engine.commit,
  runtime, runtimeSha256: await hash(runtime), runtimeArchiveSha256: pin.ollama.sha256,
  appImage: download.payloads.appImage, appImageSha256: pin.appImage.sha256,
  scope: 'Exact Debian installation and separately installed pinned CLI/Ollama; native behavior is still untested' };
writeFileSync('acceptance-evidence/install.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log('Installed bytes and independent external CLI/runtime identities recorded.');
