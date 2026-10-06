import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { sameLinuxLifetime, sameLinuxProcess } from './contract.mjs';
import { linuxProcessSnapshot, parseProcessStat } from './processes.mjs';

export const profileEnvironmentKeys = ['HOME', 'XDG_DATA_HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME'];
const environmentKeys = ['APPIMAGE', 'APPDIR', ...profileEnvironmentKeys];
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const withoutDeletedMarker = value => value.replace(/ \(deleted\)$/, '');
const isDesktop = row => path.posix.basename(withoutDeletedMarker(row.exe)) === 'phonton-desktop';
const unescapeMount = value => value.replace(/\\(040|011|012|134)/g, (_, octal) => String.fromCharCode(Number.parseInt(octal, 8)));

/** Retain mount identity, filesystem and read-only flags without assuming its source filename. */
export function parseMountInfo(text) {
  return text.trim().split('\n').filter(Boolean).map(line => {
    const halves = line.split(' - '); assert.equal(halves.length, 2);
    const before = halves[0].split(' '), after = halves[1].split(' ');
    assert.ok(before.length >= 6 && after.length >= 3);
    assert.match(before[0], /^\d+$/); assert.match(before[1], /^\d+$/);
    return { id: before[0], parentId: before[1], device: before[2], root: unescapeMount(before[3]),
      mountPoint: unescapeMount(before[4]), options: before[5].split(','), filesystem: after[0], source: unescapeMount(after[1]) };
  });
}

/** Environment is only one part of the binding: mounted bytes and stable processes are mandatory. */
export function verifyAppImageObservation(value, pin, launcher, expectedProfile) {
  assert.equal(value.launcher, launcher); assert.equal(value.launcherSha256, pin.appImage.sha256);
  assert.equal(value.environment.APPIMAGE, launcher);
  const appDir = value.environment.APPDIR;
  assert.ok(path.posix.isAbsolute(appDir));
  assert.equal(path.posix.normalize(appDir), appDir);
  assert.equal(value.process.exe, path.posix.join(appDir, 'usr/bin/phonton-desktop'));
  assert.equal(value.payloadSha256, pin.appImage.payloadSha256);
  assert.equal(value.appRunSha256, pin.appImage.appRunSha256);
  for (const key of profileEnvironmentKeys) assert.equal(value.environment[key] ?? null, expectedProfile[key] ?? null, key + ' changed');
  assert.equal(value.mount.mountPoint, appDir); assert.equal(value.mount.root, '/');
  const imageName = path.posix.basename(launcher);
  assert.equal(imageName, pin.appImage.name);
  // The exact packaged runtime uses its executable basename for FUSE identity.
  assert.equal(value.mount.filesystem, 'fuse.' + imageName);
  assert.equal(value.mount.source, imageName);
  assert.ok(value.mount.options.includes('ro'), 'Require actual read-only FUSE mounting, not extracted AppRun');
  assert.equal(value.daemon.exe, launcher); assert.notEqual(value.daemon.pid, value.process.pid);
  assert.equal(value.daemonSha256, pin.appImage.sha256);
  assert.equal(sameLinuxProcess(value.process, value.processAfter), true);
  assert.equal(sameLinuxProcess(value.daemon, value.daemonAfter), true);
}

/** Unknown or lingering prior process/mount identity cannot be accepted as normal cleanup. */
export function appImageClosed(value, snapshot, mounts) {
  const prior = [value.process, value.daemon];
  return prior.every(item => !snapshot.inaccessible.includes(item.pid) && !snapshot.unstable.includes(item.pid) &&
    !snapshot.processes.some(current => sameLinuxLifetime(item, current))) &&
    !snapshot.processes.some(current => isDesktop(current) || withoutDeletedMarker(current.exe) === value.launcher) &&
    !mounts.some(mount => mount.mountPoint === value.mount.mountPoint);
}

export const currentMounts = () => parseMountInfo(readFileSync('/proc/self/mountinfo', 'utf8'));
const identity = pid => parseProcessStat(readFileSync(`/proc/${pid}/stat`, 'utf8'), readlinkSync(`/proc/${pid}/exe`));
function selectedEnvironment(pid) {
  const selected = {};
  for (const entry of readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0')) {
    const separator = entry.indexOf('=');
    const key = entry.slice(0, separator);
    if (!environmentKeys.includes(key)) continue;
    assert.ok(!(key in selected), 'Duplicate environment field'); selected[key] = entry.slice(separator + 1);
  }
  return selected;
}

/** Called only after WebDriver launches the original AppImage, never an extracted substitute. */
export function observeAppImage(launcher, pin, expectedProfile) {
  assert.equal(process.platform, 'linux'); assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
  assert.equal(realpathSync(launcher), launcher); assert.equal(hash(launcher), pin.appImage.sha256);
  for (const suffix of ['.home', '.config']) assert.equal(existsSync(launcher + suffix), false, 'Portable profile overrides are out of scope');
  const snapshot = linuxProcessSnapshot();
  const apps = snapshot.processes.filter(isDesktop);
  assert.ok(apps.length <= 1, 'Ambiguous Desktop processes');
  if (!apps.length) return false;
  const app = apps[0], environment = selectedEnvironment(app.pid);
  assert.equal(environment.APPIMAGE, launcher);
  assert.ok(environment.APPDIR && path.posix.isAbsolute(environment.APPDIR));
  const mounts = currentMounts().filter(row => row.mountPoint === environment.APPDIR);
  assert.equal(mounts.length, 1, 'AppImage must have its own visible mount');
  const daemons = snapshot.processes.filter(row => row.exe === launcher);
  assert.equal(daemons.length, 1, 'Observe the actual AppImage FUSE service independently');
  const daemon = daemons[0];
  const observation = { launcher, launcherSha256: hash(launcher), environment, process: app,
    payloadSha256: hash(`/proc/${app.pid}/exe`), appRunSha256: hash(path.join(environment.APPDIR, 'AppRun')),
    mount: mounts[0], daemon, daemonSha256: hash(`/proc/${daemon.pid}/exe`),
    processAfter: identity(app.pid), daemonAfter: identity(daemon.pid) };
  verifyAppImageObservation(observation, pin, launcher, expectedProfile);
  return observation;
}

/** Cached canonical paths stay usable as identity data after the mount has disappeared. */
export function appImageSnapshot(observation, { engine, runtime }) {
  const snapshot = linuxProcessSnapshot();
  const expected = { app: observation?.process.exe ?? null, engine: realpathSync(engine), runtime: realpathSync(runtime) };
  return { ...snapshot, expected, mounts: currentMounts(),
    apps: snapshot.processes.filter(isDesktop),
    engines: snapshot.processes.filter(row => row.exe === expected.engine),
    runtimes: snapshot.processes.filter(row => row.exe === expected.runtime) };
}
