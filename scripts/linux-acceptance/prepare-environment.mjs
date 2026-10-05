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
const packageKind = process.env.PHONTON_ACCEPTANCE_PACKAGE;
assert.ok(['debian', 'appimage'].includes(packageKind));
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
let app = null;
if (packageKind === 'debian') {
  execFileSync('sudo', ['apt-get', 'install', '-y', download.payloads.deb], { stdio: 'inherit', timeout: 600000 });
  assert.equal(output('dpkg-query', ['-W', '-f=${Status}', 'phonton']), 'install ok installed');
  app = '/usr/bin/phonton-desktop';
  assert.equal(realpathSync(app), app); assert.equal(await hash(app), pin.desktopSha256);
} else {
  assert.equal(existsSync('/usr/bin/phonton-desktop'), false, 'AppImage acceptance must not use a Debian installation');
  for (const key of ['APPIMAGE_EXTRACT_AND_RUN', 'APPIMAGE_EXTRACT_AND_RUN_NO_CLEANUP', 'TARGET_APPIMAGE']) assert.ok(!process.env[key], 'Reject nonstandard AppImage launch override');
  for (const suffix of ['.home', '.config']) assert.equal(existsSync(download.payloads.appImage + suffix), false);
}
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
const report = { schema: 1, candidateCommit: pin.commit, packageKind,
  package: { name: 'phonton', version: '0.4.0-beta.1', architecture: 'amd64', sha256: packageKind === 'debian' ? pin.deb.sha256 : pin.appImage.sha256 },
  app, launchApplication: packageKind === 'debian' ? app : realpathSync(download.payloads.appImage),
  desktopSha256: app ? await hash(app) : null, engine, engineSha256: await hash(engine), engineCommit: pin.engine.commit,
  runtime, runtimeSha256: await hash(runtime), runtimeArchiveSha256: pin.ollama.sha256,
  appImage: download.payloads.appImage, appImageSha256: pin.appImage.sha256,
  scope: 'Verified package with separately installed pinned CLI/Ollama; AppImage mounted payload still requires live verification; native behavior untested' };
writeFileSync('acceptance-evidence/install.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log('Package bytes and independent external CLI/runtime identities recorded.');
