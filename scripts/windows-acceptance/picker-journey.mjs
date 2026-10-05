import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const json = file => JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));

export const pickerStateScript = `
  const footer=document.querySelector('.lw-footer')?.textContent ?? '';
  if (!/^(Managed runtime connected|Loopback runtime connected|Local model runtime unavailable|Managed runtime recovery required)/.test(footer)) return false;
  if (arguments[0] && !document.querySelector('.lw-plan-flow code')?.textContent.trim()) return false;
  return {
    active:localStorage.getItem('phonton.projects.active'), recent:localStorage.getItem('phonton.projects.recent'),
    goal:document.querySelector('#local-goal')?.value, files:document.querySelector('#local-files')?.value,
    checks:document.querySelector('#local-check')?.value, plan:document.querySelector('[aria-label=Plan]')?.textContent ?? null,
    consent:[...document.querySelectorAll('.lw-approval input')].map(input=>input.checked)
  }`;

export const settledPickerState = ({ execute, until }, requirePlan = false) =>
  until(() => execute(pickerStateScript, requirePlan), 'settled runtime and plan metadata for native dialog comparison');

export function validatePickerReport(value, action, app, fixture) {
  assert.equal(value.schema, 1);
  assert.equal(value.status, 'passed');
  assert.equal(value.action, action);
  assert.equal(value.app, app);
  assert.equal(value.fixture, fixture);
  assert.ok(Number.isInteger(value.appProcessId) && value.appProcessId > 0);
  assert.ok(Number.isInteger(value.mainWindow) && value.mainWindow > 0);
  assert.equal(value.dialog.processId, value.appProcessId);
  assert.equal(value.dialog.rootOwner, value.mainWindow);
  assert.ok(value.dialog.owner > 0 && value.dialog.hwnd > 0 && value.dialog.hwnd !== value.mainWindow);
  assert.equal(value.dialog.title, 'Open repository');
  assert.equal(value.dialogClosed, true);
  assert.equal(value.invokedControl.type, 'ControlType.Button');
  assert.equal(value.invokedControl.name.toLowerCase(), action === 'select' ? 'select folder' : 'cancel');
  if (action === 'select') assert.equal(value.enteredDirectory, fixture);
  else assert.equal(value.enteredDirectory, undefined);
}

export async function nativePicker(action, label, { click, evidence, fixture }) {
  const reportPath = path.join(evidence, `${label}.json`);
  assert.equal(existsSync(reportPath), false);
  const executable = path.join(process.env.WINDIR, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const child = spawn(executable, ['-NoProfile', '-NonInteractive', '-STA', '-File',
    'scripts/windows-acceptance/native-picker.ps1', '-Action', action, '-ReportPath', reportPath],
  { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => appendFileSync(`${reportPath}.log`, data));
  child.stderr.on('data', data => appendFileSync(`${reportPath}.error.log`, data));
  let ended = false;
  const completed = new Promise((resolve, reject) => {
    child.once('error', error => { ended = true; reject(error); });
    child.once('exit', code => { ended = true; code === 0 ? resolve() : reject(new Error(`Native ${action} helper exited ${code}; see ${label} evidence`)); });
  });
  // Attach a rejection handler immediately while waiting for helper readiness.
  completed.catch(() => {});
  const timer = setTimeout(() => { if (!ended) child.kill(); }, 115000);
  try {
    const deadline = Date.now() + 30000;
    while (!existsSync(`${reportPath}.ready.json`)) {
      if (ended) { await completed; throw new Error('Native picker helper ended before readiness'); }
      assert.ok(Date.now() < deadline, 'Native picker helper did not become ready');
      await delay(100);
    }
    const ready = json(`${reportPath}.ready.json`);
    assert.equal(ready.ready, true);
    await Promise.all([click('.lw-sidebar-project button'), completed]);
    const result = json(reportPath);
    assert.equal(result.appProcessId, ready.appProcessId);
    assert.equal(result.mainWindow, ready.mainWindow);
    validatePickerReport(result, action, process.env.PHONTON_ACCEPTANCE_APP, fixture);
    return result;
  } finally {
    clearTimeout(timer);
    if (!ended) { child.kill(); await completed.catch(() => {}); }
  }
}

export async function pickerJourney(api) {
  const { execute, type, until, screenshot, record, fixture, identities, hash, ownedEngine } = api;
  const snapshot = () => settledPickerState(api);
  const engineBefore = await ownedEngine();
  await type('#local-goal', 'Keep this draft while choosing a repository.');
  const before = await snapshot();
  assert.equal(before.active, null, 'Picker test requires an unseeded project');
  assert.equal(before.recent, null);
  const cancelled = await nativePicker('cancel', 'picker-01-cancel', api);
  assert.deepEqual(await snapshot(), before, 'Cancel must preserve project, draft, plan and consent');
  record('native folder picker cancel preserves unseeded workspace and draft', { before, appProcessId: cancelled.appProcessId });
  const selected = await nativePicker('select', 'picker-02-select', api);
  await until(() => execute('return localStorage.getItem("phonton.projects.active") === arguments[0]', fixture), 'native selection activates the fixture');
  const after = await snapshot();
  assert.equal(after.active, fixture);
  assert.deepEqual(JSON.parse(after.recent), [fixture]);
  assert.equal(after.goal, before.goal);
  assert.equal(after.plan, null);
  assert.ok(after.consent.every(value => value === false));
  assert.ok((await execute('return document.querySelector(".lw-intro h1").textContent')).includes(path.basename(fixture)));
  const engineAfter = await ownedEngine();
  assert.equal(engineAfter.apps[0].ProcessId, selected.appProcessId);
  assert.equal(engineAfter.engines[0].ProcessId, engineBefore.engines[0].ProcessId);
  for (const [file, digest] of identities) assert.equal(hash(path.join(fixture, file)), digest, 'Folder selection changed source/index');
  await screenshot('picker-03-selected-workbench');
  record('native folder picker selects real fixture without storage injection', { after, engineProcessId: engineAfter.engines[0].ProcessId });
}
