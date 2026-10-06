import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
assert.equal(process.env.GITHUB_ACTIONS, 'true'); assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const pin = read('scripts/macos-acceptance/source.json');
const download = read('acceptance-evidence/download.json');
assert.equal(download.candidateCommit, pin.commit);
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const temporary = realpathSync(process.env.RUNNER_TEMP);
const output = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', timeout: 120000 }).trim();
const save = (name, value) => writeFileSync('acceptance-evidence/' + name + '.json', JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
function recorded(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 120000 });
  assert.ifError(result.error);
  return { command, args, exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
}
function inventory(root) {
  const rows = [];
  function visit(directory) {
    for (const name of readdirSync(directory).sort()) {
      const file = path.join(directory, name), info = lstatSync(file), relative = path.relative(root, file);
      if (info.isSymbolicLink()) {
        assert.ok(realpathSync(file).startsWith(root + path.sep), 'Bundle link must remain internal');
        rows.push({ path: relative, type: 'link', target: readlinkSync(file) });
      } else if (info.isDirectory()) {
        rows.push({ path: relative, type: 'directory', mode: info.mode & 0o777 }); visit(file);
      } else {
        assert.ok(info.isFile()); rows.push({ path: relative, type: 'file', mode: info.mode & 0o777, bytes: info.size, sha256: hash(file) });
      }
    }
  }
  visit(root); return rows;
}
const dmg = realpathSync(download.payloads.dmg);
assert.ok(dmg.startsWith(temporary + path.sep)); assert.equal(hash(dmg), pin.dmg.sha256);
const mount = path.join(temporary, 'phonton-macos-mount');
const destination = path.join(temporary, 'phonton-macos-installed');
assert.ok(!existsSync(mount) && !existsSync(destination)); mkdirSync(destination);
let attached = false;
try {
  const attach = output('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-noautoopen', '-plist', '-mountpoint', mount, dmg]);
  attached = true; writeFileSync('acceptance-evidence/dmg-attach.plist', attach);
  const mountLines = output('/sbin/mount', []).split('\n').filter(line => line.includes(' on ' + mount + ' ('));
  assert.equal(mountLines.length, 1); assert.ok(mountLines[0].includes('read-only'));
  const original = path.join(mount, 'Phonton.app'), app = path.join(destination, 'Phonton.app');
  assert.ok(existsSync(original));
  const before = inventory(original); save('mounted-bundle', before);
  output('/usr/bin/ditto', [original, app]);
  const copied = inventory(app); assert.deepEqual(copied, before); save('installed-bundle', copied);
  const binary = path.join(app, 'Contents/MacOS/phonton-desktop'); assert.equal(hash(binary), pin.desktopSha256);
  const plist = JSON.parse(output('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path.join(app, 'Contents/Info.plist')]));
  assert.equal(plist.CFBundleIdentifier, 'dev.phonton.desktop'); assert.equal(plist.CFBundleShortVersionString, '0.4.0-beta.1');
  assert.equal(plist.CFBundleExecutable, 'phonton-desktop');
  const signature = recorded('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
  save('signature-verification', signature); assert.equal(signature.exitCode, 0);
  save('signature-details', recorded('/usr/bin/codesign', ['-d', '--verbose=4', app]));
  save('gatekeeper-assessment', recorded('/usr/sbin/spctl', ['--assess', '--type', 'execute', '--verbose=4', app]));
  save('bundle-attributes', recorded('/usr/bin/xattr', ['-lr', app]));
  assert.equal(output('git', ['-C', 'phonton-dev', 'rev-parse', 'HEAD']), pin.engine.commit);
  const sourceEngine = path.resolve('phonton-dev/target/release/phonton');
  assert.match(output(sourceEngine, ['version']), /^phonton 0\.22\.0(?:\s|$)/);
  const engineDirectory = path.join(temporary, 'phonton-external-cli'); assert.ok(!existsSync(engineDirectory)); mkdirSync(engineDirectory);
  const engine = path.join(engineDirectory, 'phonton'); copyFileSync(sourceEngine, engine); chmodSync(engine, 0o755);
  assert.equal(hash(engine), hash(sourceEngine));
  save('install', { schema: 1, candidateCommit: pin.commit, app, binary, desktopSha256: hash(binary),
    dmg, dmgSha256: hash(dmg), engine, engineSha256: hash(engine), engineCommit: pin.engine.commit,
    mount: mountLines[0], bundleEntries: copied.length,
    scope: 'Unchanged ARM64 DMG copied on disposable cloud host; preserved ad-hoc signature. No trusted signing or quarantined-download acceptance claim.' });
} finally {
  if (attached) {
    const detached = recorded('/usr/bin/hdiutil', ['detach', mount]); save('dmg-detach', detached);
    assert.equal(detached.exitCode, 0, 'Exact DMG mount must detach normally');
  }
}
