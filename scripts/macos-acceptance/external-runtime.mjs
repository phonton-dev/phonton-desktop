import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { assertSameProcess, parseProcessIdentity } from './process-identity.mjs';

export function runtimeListeners() {
  const result = spawnSync('/usr/sbin/lsof', ['-nP', '-iTCP:11434', '-sTCP:LISTEN', '-Fpn'], { encoding: 'utf8', timeout: 15000 });
  assert.ifError(result.error); assert.ok([0, 1].includes(result.status));
  const listeners = []; let pid;
  for (const line of result.stdout.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1));
    if (line.startsWith('n')) { assert.ok(Number.isSafeInteger(pid) && pid > 0); listeners.push({ pid, address: line.slice(1) }); }
  }
  return listeners;
}

export function nativeRuntimeIdentity(pid) {
  return parseProcessIdentity(spawnSync(path.join(process.env.RUNNER_TEMP, 'phonton-process-identity'), [String(pid)],
    { encoding: 'utf8', timeout: 10000 }), pid);
}

export function requireExternalRuntime(expected) {
  const observed = nativeRuntimeIdentity(expected.process.pid);
  assertSameProcess(expected.process, observed);
  const listeners = runtimeListeners();
  assert.deepEqual(listeners, [{ pid: expected.process.pid, address: '127.0.0.1:11434' }]);
  return { process: observed, listeners };
}
