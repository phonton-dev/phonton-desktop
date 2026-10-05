import assert from 'node:assert/strict';
import path from 'node:path';

export function parseProcessIdentity(result, pid) {
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  const value = JSON.parse(result.stdout);
  assert.equal(result.stderr, '');
  if (value.status === 'unavailable') {
    assert.equal(result.status, 1);
    assert.ok(typeof value.stage === 'string' && value.stage.length > 0);
    assert.ok(Number.isSafeInteger(value.errno) && value.errno >= 0);
    return { ...value, pid };
  }
  assert.equal(result.status, 0);
  assert.equal(value.status, 'present');
  assert.ok(Number.isSafeInteger(pid) && pid > 0);
  assert.equal(value.pid, pid);
  assert.ok(Number.isSafeInteger(value.ppid) && value.ppid >= 0);
  assert.ok(Number.isSafeInteger(value.startSeconds) && value.startSeconds > 0);
  assert.ok(Number.isSafeInteger(value.startMicroseconds) && value.startMicroseconds >= 0 && value.startMicroseconds < 1000000);
  assert.ok(typeof value.exe === 'string' && path.posix.isAbsolute(value.exe) && !value.exe.includes('\0'));
  return value;
}

export function assertSameProcess(before, after) {
  assert.equal(before.status, 'present');
  assert.equal(after.status, 'present', 'Owned process identity became unavailable');
  for (const key of ['pid', 'ppid', 'startSeconds', 'startMicroseconds', 'exe']) {
    assert.equal(after[key], before[key], 'Owned process changed: ' + key);
  }
}
