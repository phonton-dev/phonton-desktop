import assert from 'node:assert/strict';
import test from 'node:test';
import { appImageClosed, parseMountInfo, verifyAppImageObservation } from './linux-acceptance/appimage.mjs';

const imageName = 'Phonton_0.4.0-beta.1_amd64.AppImage';
const launcher = '/tmp/candidate/' + imageName;
const pin = { appImage: { name: imageName, sha256: 'a'.repeat(64), payloadSha256: 'b'.repeat(64), appRunSha256: 'c'.repeat(64) } };
const profile = { HOME: '/home/runner' };
const process = { pid: 12, startTime: '111', exe: '/tmp/.mount_Phonton/usr/bin/phonton-desktop' };
const daemon = { pid: 13, startTime: '112', exe: launcher };
const mount = { id: '99', parentId: '1', root: '/', device: '0:66', filesystem: 'fuse.' + imageName, mountPoint: '/tmp/.mount_Phonton', options: ['ro', 'nosuid'], source: imageName };
function observation() {
  return { launcher, launcherSha256: pin.appImage.sha256, environment: { ...profile, APPIMAGE: launcher, APPDIR: mount.mountPoint },
    process, processAfter: { ...process }, daemon, daemonAfter: { ...daemon }, mount,
    payloadSha256: pin.appImage.payloadSha256, appRunSha256: pin.appImage.appRunSha256, daemonSha256: pin.appImage.sha256 };
}
test('AppImage binding rejects substituted bytes, spoofed environment, portable profiles and extracted launchers', () => {
  verifyAppImageObservation(observation(), pin, launcher, profile);
  for (const mutate of [
    value => { value.launcherSha256 = 'd'.repeat(64); }, value => { value.payloadSha256 = 'a'.repeat(64); },
    value => { value.environment.APPIMAGE = '/tmp/other.AppImage'; }, value => { value.environment.APPDIR = '/tmp/extracted'; },
    value => { value.environment.HOME = '/tmp/portable'; }, value => { value.environment.XDG_DATA_HOME = '/tmp/profile'; },
    value => { value.mount.options = ['rw']; }, value => { value.mount.filesystem = 'ext4'; },
    value => { value.mount.filesystem = 'fuse.squashfuse'; }, value => { value.mount.source = 'other.AppImage'; },
    value => { value.processAfter.startTime = '999'; }, value => { value.daemonAfter.exe = '/tmp/other'; },
    value => { value.daemonSha256 = 'e'.repeat(64); }, value => { value.appRunSha256 = 'e'.repeat(64); },
  ]) { const value = structuredClone(observation()); mutate(value); assert.throws(() => verifyAppImageObservation(value, pin, launcher, profile)); }
});
test('normal close requires vanished mount and stable old app/daemon identities before teardown', () => {
  const state = { processes: [], inaccessible: [], unstable: [] };
  assert.equal(appImageClosed(observation(), state, []), true);
  assert.equal(appImageClosed(observation(), { ...state, processes: [daemon] }, []), false);
  assert.equal(appImageClosed(observation(), { ...state, processes: [process] }, []), false);
  assert.equal(appImageClosed(observation(), { ...state, inaccessible: [13] }, []), false);
  assert.equal(appImageClosed(observation(), { ...state, unstable: [12] }, []), false);
  assert.equal(appImageClosed(observation(), state, [mount]), false);
  assert.equal(appImageClosed(observation(), state, [{ ...mount, id: '100' }]), false);
  assert.equal(appImageClosed(observation(), { ...state, processes: [{ ...daemon, startTime: '999' }] }, []), false);
  assert.equal(appImageClosed(observation(), { ...state, processes: [{ ...daemon, startTime: '999', exe: '/usr/bin/unrelated' }] }, []), true);
  assert.equal(appImageClosed(observation(), { ...state, processes: [{ ...daemon, exe: '/usr/bin/another-program' }] }, []), false);
  const replacement = { ...process, pid: 44, startTime: '200', exe: '/tmp/.mount_New/usr/bin/phonton-desktop' };
  assert.equal(appImageClosed(observation(), { ...state, processes: [replacement] }, [{ ...mount, id: '101', mountPoint: '/tmp/.mount_New' }]), false);
  assert.equal(appImageClosed(observation(), { ...state, processes: [{ ...process, exe: process.exe + ' (deleted)' }] }, []), false);
  assert.equal(appImageClosed(observation(), state, [{ ...mount, mountPoint: '/tmp/unrelated', device: '0:77' }]), true);
});
test('mountinfo parsing preserves read-only FUSE identity and decodes kernel path escapes', () => {
  const [value] = parseMountInfo('99 1 0:66 / /tmp/image\\040mount ro,nosuid shared:4 - fuse.squashfuse squashfuse ro,user_id=1001\n');
  assert.equal(value.mountPoint, '/tmp/image mount'); assert.equal(value.source, 'squashfuse');
  assert.equal(value.filesystem, 'fuse.squashfuse'); assert.deepEqual(value.options, ['ro', 'nosuid']);
  assert.throws(() => parseMountInfo('not a mount record'));
});
