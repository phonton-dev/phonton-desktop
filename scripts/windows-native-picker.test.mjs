import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { validatePickerReport, settledPickerState } from './windows-acceptance/picker-journey.mjs';
import { runtimeObservationResolved } from './windows-acceptance/runtime-observation.mjs';

const app = 'C:\\installed\\phonton-desktop.exe';
const fixture = 'D:\\fixture with spaces';
const report = { schema: 1, status: 'passed', action: 'select', app, fixture, appProcessId: 100,
  mainWindow: 500, dialog: { hwnd: 600, processId: 100, owner: 500, rootOwner: 500, title: 'Open repository' },
  dialogClosed: true, enteredDirectory: fixture, invokedControl: { type: 'ControlType.Button', name: 'Select Folder' } };
test('native picker reports must bind action, dialog owner, installed app and selected directory', () => {
  validatePickerReport(report, 'select', app, fixture);
  const cancelled = { ...report, action: 'cancel', enteredDirectory: undefined,
    invokedControl: { type: 'ControlType.Button', name: 'Cancel' } };
  validatePickerReport(cancelled, 'cancel', app, fixture);
  for (const changed of [
    { ...report, app: 'C:\\other.exe' }, { ...report, fixture: 'C:\\other' },
    { ...report, enteredDirectory: 'C:\\other' }, { ...report, action: 'cancel' },
    { ...report, status: 'running' }, { ...report, dialogClosed: false },
    { ...report, appProcessId: 0 }, { ...report, mainWindow: 0 },
    { ...report, dialog: { ...report.dialog, processId: 101 } },
    { ...report, dialog: { ...report.dialog, rootOwner: 501 } },
    { ...report, dialog: { ...report.dialog, owner: 0 } },
    { ...report, dialog: { ...report.dialog, hwnd: 500 } },
    { ...report, invokedControl: { type: 'ControlType.Button', name: 'Delete' } },
  ]) assert.throws(() => validatePickerReport(changed, 'select', app, fixture));
  assert.throws(() => validatePickerReport({ ...cancelled, enteredDirectory: fixture }, 'cancel', app, fixture));
});
const backend = { endpoint: 'http://127.0.0.1:11434', runtime_version: '0.1', runtime_error: null,
  active_model: 'qwen2.5-coder:3b', model_store: { status: 'verified_managed' },
  models: [{ model: { name: 'qwen2.5-coder:3b' }, profile: { protocol: 'edit' } }] };
const sample = { visibility: 'visible', focused: false, workbenchVisible: true,
  footer: 'Managed runtime connected · explicit execution', machine: 'This machine qwen2.5-coder:3b' };
test('runtime observations require visible, settled presentation matching healthy selected model', () => {
  assert.equal(runtimeObservationResolved(sample, backend), true);
  for (const changed of [
    { ...sample, visibility: 'hidden' }, { ...sample, workbenchVisible: false },
    { ...sample, footer: 'Checking local runtime' }, { ...sample, machine: 'Choose a local model' },
  ]) assert.equal(runtimeObservationResolved(changed, backend), false);
});
test('reopened historical receipt does not require a currently running model', () => {
  const stopped = { ...backend, runtime_version: null, runtime_error: 'not running' };
  assert.equal(runtimeObservationResolved({ ...sample, footer: 'Local model runtime unavailable' }, stopped), true);
  assert.equal(runtimeObservationResolved(sample, stopped), false);
  const blocked = { ...stopped, model_store: { status: 'unverified', goal_run_blocked: true } };
  assert.equal(runtimeObservationResolved({ ...sample, footer: 'Managed runtime recovery required' }, blocked), true);
});

test('cancel snapshot waits for atomic metadata but returns changed consent instead of retrying equality', async () => {
  let current;
  const read = (script, requirePlan) => runInNewContext(`(function(){${script}})(required)`, {
    required: requirePlan, localStorage: { getItem: () => null }, document: {
      querySelector: selector => selector === '.lw-footer' ? { textContent: current.footer }
        : selector === '.lw-plan-flow code' ? { textContent: current.metadata }
          : selector === '[aria-label=Plan]' ? { textContent: `Plan ${current.metadata}` } : { value: 'retained' },
      querySelectorAll: () => current.consent.map(checked => ({ checked })),
    },
  });
  const snapshot = async states => settledPickerState({ execute: read, until: async check => {
    for (current of states) { const value = await check(); if (value) return JSON.parse(JSON.stringify(value)); }
    throw new Error('No settled observation');
  } }, true);
  const loading = { footer: 'Checking local runtime', metadata: '', consent: [false] };
  const metadataPending = { footer: 'Local model runtime unavailable', metadata: '', consent: [false, false] };
  const ready = { footer: 'Local model runtime unavailable', metadata: 'C:\\evidence', consent: [false, false] };
  const before = await snapshot([loading, metadataPending, ready]);
  assert.deepEqual(await snapshot([loading, metadataPending, ready]), before);
  const changed = await snapshot([loading, { ...ready, consent: [true, false] }, ready]);
  assert.throws(() => assert.deepEqual(changed, before), 'A changed checked consent must fail, never retry until it matches');
});
