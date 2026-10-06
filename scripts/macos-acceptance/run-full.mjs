import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, statfsSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { nativeRuntimeIdentity, requireExternalRuntime, runtimeListeners } from './external-runtime.mjs';

assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
assert.equal(process.env.GITHUB_ACTIONS, 'true'); assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
assert.equal(process.env.GITHUB_EVENT_NAME, 'workflow_dispatch'); assert.equal(process.env.GITHUB_REPOSITORY, 'phonton-dev/phonton-desktop');
assert.equal(process.env.RUNNER_OS, 'macOS');
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const installed = read('acceptance-evidence/runtime-install.json');
const pin = read('scripts/macos-acceptance/runtime-source.json');
const temporary = realpathSync(process.env.RUNNER_TEMP);
const runtime = realpathSync(installed.runtime);
assert.ok(runtime.startsWith(temporary + '/') && runtime === installed.runtime);
assert.equal(createHash('sha256').update(readFileSync(runtime)).digest('hex'), installed.runtimeSha256);
assert.equal(installed.archiveSha256, pin.sha256); assert.equal(installed.version, pin.version);
const capacity = statfsSync(temporary);
assert.ok(capacity.bavail * capacity.bsize >= 12 * 1024 ** 3);
assert.ok(os.totalmem() >= 7 * 1024 ** 3, 'Need at least 7 GiB physical memory; product fit gates still govern calibration');
assert.deepEqual(runtimeListeners(), [], 'Preserve any existing runtime listener');
const models = path.join(temporary, 'phonton-macos-external-models');
assert.equal(existsSync(models), false); mkdirSync(models);
const environment = { ...process.env, OLLAMA_HOST: '127.0.0.1:11434', OLLAMA_MODELS: models, OLLAMA_NUM_PARALLEL: '1', PHONTON_MACOS_FULL_JOURNEY: 'true' };
delete environment.GH_TOKEN; delete environment.GITHUB_TOKEN;
const children = [], descriptors = [];
function launch(executable, args, label, timeout) {
  const stdout = openSync(`acceptance-evidence/${label}.log`, 'wx');
  const stderr = openSync(`acceptance-evidence/${label}-error.log`, 'wx'); descriptors.push(stdout, stderr);
  const child = spawn(executable, args, { env: environment, stdio: ['ignore', stdout, stderr], timeout });
  child.done = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })); });
  child.done.catch(() => {}); children.push(child); return child;
}
try {
  const server = launch(runtime, ['serve'], 'external-ollama');
  // The pinned Darwin runtime can spend 30 seconds discovering unavailable GPU
  // devices before its HTTP handlers become ready. Retain a bounded startup
  // observation; the product's real memory/calibration gates remain unchanged.
  const startup = { status: 'waiting', expectedVersion: pin.version, timeoutMs: 90000, attempts: [] };
  const startupStarted = Date.now(), deadline = startupStarted + startup.timeoutMs; let version;
  try {
    while (Date.now() < deadline) {
      assert.equal(server.exitCode, null, 'External runtime exited during startup');
      assert.equal(server.signalCode, null, 'External runtime was terminated during startup');
      const attempt = { elapsedMs: Date.now() - startupStarted };
      try {
        const response = await fetch('http://127.0.0.1:11434/api/version', { signal: AbortSignal.timeout(2000) });
        attempt.httpStatus = response.status;
        assert.equal(response.ok, true); version = await response.json(); attempt.version = version; break;
      } catch (error) {
        attempt.error = { name: error.name, code: error.cause?.code || null };
        if (error.cause?.code !== 'ECONNREFUSED' && error.name !== 'TimeoutError') throw error;
      } finally { startup.attempts.push(attempt); }
      await delay(500);
    }
    assert.equal(version?.version, pin.version, 'Pinned runtime version must be ready within the bounded startup window');
    startup.status = 'passed';
  } catch (error) { startup.status = 'failed'; startup.error = String(error); throw error; }
  finally {
    startup.elapsedMs = Date.now() - startupStarted;
    writeFileSync('acceptance-evidence/external-runtime-startup.json', JSON.stringify(startup, null, 2) + '\n', { flag: 'wx' });
  }
  const identity = nativeRuntimeIdentity(server.pid);
  assert.equal(identity.status, 'present'); assert.equal(identity.exe, runtime); assert.equal(identity.ppid, process.pid);
  const external = { process: identity, version, models, scope: 'Separately started pinned external runtime; product origin remains unverified' };
  requireExternalRuntime(external);
  writeFileSync('acceptance-evidence/external-runtime.json', JSON.stringify(external, null, 2) + '\n', { flag: 'wx' });
  // No model is preloaded: download, calibration and selection must use native UI.
  const journey = launch(process.execPath, ['scripts/macos-acceptance/probe.mjs'], 'full-native-journey', 105 * 60000);
  const outcome = await journey.done;
  assert.equal(outcome.code, 0, 'Full native Mac journey failed; retain actual evidence');
  const result = read('acceptance-evidence/probe-result.json');
  assert.equal(result.status, 'passed'); assert.equal(result.fullJourney, true);
  assert.equal(result.fullJourneyCompleted, true);
  const retained = requireExternalRuntime(external);
  writeFileSync('acceptance-evidence/external-runtime-retained.json', JSON.stringify(retained, null, 2) + '\n', { flag: 'wx' });
} finally {
  // Owned helper handles only. App/CLI normal Quit is proved before this teardown.
  for (const child of children.toReversed()) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM'); await Promise.race([child.done.catch(() => {}), delay(5000)]);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
  }
  for (const descriptor of descriptors) closeSync(descriptor);
}
