import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, statfsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { linuxSnapshot } from './processes.mjs';
import { sameLinuxProcess } from './contract.mjs';
import { waitForNativeDriver } from './driver-ready.mjs';
import { appImageClosed, appImageSnapshot } from './appimage.mjs';

assert.equal(process.platform, 'linux');
assert.equal(process.env.GITHUB_ACTIONS, 'true');
assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
assert.ok(process.env.DISPLAY && process.env.DBUS_SESSION_BUS_ADDRESS);
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const installed = read('acceptance-evidence/install.json');
const pin = read('scripts/linux-acceptance/source.json');
assert.ok(['debian', 'appimage'].includes(installed.packageKind));
const expected = { app: installed.app, engine: installed.engine, runtime: installed.runtime };
const temporary = realpathSync(process.env.RUNNER_TEMP);
const space = statfsSync(temporary);
assert.ok(space.bavail * space.bsize >= 12 * 1024 ** 3, 'Need 12 GiB available after dependencies/builds');
const availableKiB = Number(/^MemAvailable:\s+(\d+) kB$/m.exec(readFileSync('/proc/meminfo', 'utf8'))?.[1]);
assert.ok(availableKiB * 1024 >= 6 * 1024 ** 3, 'Need 6 GiB available for real model work');
const snapshot = observation => installed.packageKind === 'appimage' ? appImageSnapshot(observation, expected) : linuxSnapshot(expected);
const before = snapshot(null);
assert.deepEqual(before.apps, []); assert.deepEqual(before.engines, []); assert.deepEqual(before.runtimes, []);
assert.ok(!before.processes.some(row => path.basename(row.exe) === 'phonton-desktop' || row.exe === installed.launchApplication));
assert.deepEqual(before.listeners, [], 'Do not occupy an existing app/model listener');
const profile = path.join(process.env.XDG_DATA_HOME || path.join(process.env.HOME, '.local/share'), 'dev.phonton.desktop');
assert.equal(existsSync(profile), false, 'Native default profile must be fresh; never erase it');
const state = path.join(temporary, 'phonton acceptance state');
const models = path.join(temporary, 'phonton external models');
assert.ok(!existsSync(state) && !existsSync(models)); mkdirSync(state); mkdirSync(models);
const environment = { ...process.env, PHONTON_LOCAL_STATE: path.join(state, 'local-models.json'),
  PHONTON_CONFIG_PATH: path.join(state, 'config.toml'), OLLAMA_HOST: '127.0.0.1:11434', OLLAMA_MODELS: models,
  OLLAMA_NUM_PARALLEL: '1', GTK_MODULES: 'gail:atk-bridge', NO_AT_BRIDGE: '0', LIBGL_ALWAYS_SOFTWARE: '1' };
// HOME/XDG and the native default WebKit profile are left untouched.
delete environment.GH_TOKEN; delete environment.GITHUB_TOKEN;
const children = [], descriptors = [];
function launch(executable, args, name, timeout) {
  const stdout = openSync(`acceptance-evidence/${name}.log`, 'wx');
  const stderr = openSync(`acceptance-evidence/${name}-error.log`, 'wx');
  descriptors.push(stdout, stderr);
  const child = spawn(executable, args, { env: environment, stdio: ['ignore', stdout, stderr], timeout });
  child.done = new Promise((resolve, reject) => {
    child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  child.done.catch(() => {}); children.push(child); return child;
}
async function wait(check, label, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await check(); if (value) return value; await delay(500); }
  throw new Error('Timed out: ' + label);
}
try {
  launch('openbox', [], 'window-manager');
  const runtime = launch(installed.runtime, ['serve'], 'external-ollama');
  const version = await wait(async () => {
    if (runtime.exitCode !== null) throw new Error('External runtime exited');
    try { const response = await fetch('http://127.0.0.1:11434/api/version', { signal: AbortSignal.timeout(2000) }); return response.ok ? response.json() : false; }
    catch (error) { if (error.cause?.code === 'ECONNREFUSED' || error.name === 'TimeoutError') return false; throw error; }
  }, 'external Ollama startup');
  assert.equal(version.version, pin.ollama.version);
  const started = snapshot(null);
  assert.equal(started.runtimes.length, 1); assert.equal(started.runtimes[0].pid, runtime.pid);
  assert.deepEqual(started.listeners.map(listener => ({ port: listener.port, loopback: listener.loopback, pids: listener.pids })),
    [{ port: 11434, loopback: true, pids: [runtime.pid] }]);
  writeFileSync('acceptance-evidence/external-runtime.json', JSON.stringify({ version, process: started.runtimes[0], snapshot: started }, null, 2) + '\n');
  const driver = launch('tauri-driver', ['--native-driver', '/usr/bin/WebKitWebDriver'], 'tauri-driver');
  await waitForNativeDriver({ isAlive: () => driver.exitCode === null && driver.signalCode === null });
  const journey = launch(process.execPath, ['scripts/linux-acceptance/journey.mjs'], 'journey', 70 * 60000);
  const outcome = await journey.done;
  assert.equal(outcome.code, 0, 'Native journey failed; preserve failure evidence');
  const result = read('acceptance-evidence/result.json');
  assert.equal(result.status, 'passed'); assert.equal(result.packageKind, installed.packageKind);
  const image = result.appImageLaunches?.at(-1);
  if (installed.packageKind === 'appimage') assert.equal(result.appImageLaunches.length, 2);
  const after = snapshot(image);
  assert.deepEqual(after.apps, []); assert.deepEqual(after.engines, []);
  if (image) assert.equal(appImageClosed(image, after, after.mounts), true);
  assert.equal(sameLinuxProcess(started.runtimes[0], after.runtimes.find(row => row.pid === runtime.pid)), true);
  assert.equal(driver.exitCode, null, 'Driver teardown must not substitute for normal app cleanup');
  writeFileSync('acceptance-evidence/environment-result.json', JSON.stringify({ status: 'passed', before, after,
    packageKind: installed.packageKind, scope: 'Named Linux package journey only; other package/platform gates require their own results' }, null, 2) + '\n');
} finally {
  // Stop only processes this disposable orchestrator launched, after preserving assertions.
  for (const child of children.toReversed()) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await Promise.race([child.done.catch(() => {}), delay(5000)]);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
  }
  for (const descriptor of descriptors) closeSync(descriptor);
}
