import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
test('updater fixture value ownership preserves existing and changed settings and cleans partial setup', { skip: process.platform !== 'win32' }, () => {
  const result = spawnSync('pwsh', ['-NoProfile', '-File', 'scripts/windows-acceptance/owned-test-values.test.ps1'], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.ifError(result.error); assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /No OS settings accessed/);
});
