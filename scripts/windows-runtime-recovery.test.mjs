import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { validateRecoveredModel, recoveredSelectionScript, recoveryPanelScript } from './windows-acceptance/runtime-recovery.mjs';

function readPanel({ visible = true, open = true, rect = {}, clip = {}, supported = true } = {}) {
  const box = { width: 300, height: 20, left: 20, right: 320, top: 40, bottom: 60, ...rect };
  const reason = { textContent: 'OS diagnostic', offsetWidth: box.width, offsetHeight: box.height,
    getClientRects: () => [box], getBoundingClientRect: () => ({ ...box, toJSON: () => box }),
    closest: () => ({ getBoundingClientRect: () => ({ left: 0, right: 580, top: 0, bottom: 700, ...clip }) }),
    ...(supported ? { checkVisibility(options) {
      assert.equal(options.visibilityProperty, true);
      assert.equal(options.opacityProperty, true);
      return visible;
    } } : {}),
  };
  const panel = { getBoundingClientRect: () => ({ left: 0, right: 580 }),
    querySelector: selector => selector === 'details' ? { open, querySelector: () => reason } : { textContent: 'Recovery guidance' },
  };
  return runInNewContext(`(function(){${recoveryPanelScript}})()`, {
    document: { querySelector: () => panel, documentElement: { scrollWidth: 580 } }, innerWidth: 580, innerHeight: 700,
  });
}

test('nonzero diagnostic rectangles do not imply rendered disclosure content', () => {
  for (const open of [false, true]) {
    const observed = readPanel({ visible: false, open });
    assert.equal(observed.reasonRect.height, 20);
    assert.equal(observed.reasonVisible, false);
    assert.equal(observed.reasonInView, false);
  }
  assert.equal(readPanel().reasonVisible, true);
  assert.equal(readPanel().reasonInView, true);
});

test('rendered diagnostics must still fit both the native viewport and scrolling content', () => {
  for (const bounds of [
    { rect: { top: -5 } }, { rect: { bottom: 710 } }, { rect: { left: -5 } }, { rect: { right: 590 } },
    { clip: { top: 45 } }, { clip: { bottom: 55 } }, { clip: { left: 25 } }, { clip: { right: 315 } },
    { rect: { width: 0 } }, { rect: { height: 0 } },
  ]) {
    const observed = readPanel(bounds);
    assert.equal(observed.reasonVisible, true);
    assert.equal(observed.reasonInView, false);
  }
});

test('a browser without rendering visibility support cannot pass disclosure acceptance', () => {
  assert.throws(() => readPanel({ supported: false }), /requires browser checkVisibility/);
});

const previous = {
  endpoint: 'http://127.0.0.1:11434', runtime_version: '0.34.2', active_model: 'qwen2.5-coder:3b',
  model_store: { status: 'verified_managed', pid: 100, goal_run_blocked: false },
  managed_storage: { root: 'D:\\state\\runtime', models_path: 'D:\\state\\runtime\\models', runs_path: 'D:\\state\\runs', source: 'override' },
  models: [{ model: { name: 'qwen2.5-coder:3b', digest: 'digest-a' }, profile_sha256: 'profile-a',
    profile: { protocol: 'search_replace', digest: 'digest-a', context_tokens: 4096, runtime_version: '0.34.2' } }],
};
const recovered = () => ({ ...structuredClone(previous), runtime_error: null,
  model_store: { status: 'verified_managed', pid: 200, goal_run_blocked: false } });

test('native selected-model readiness rejects stale, ambiguous and not-ready rows', () => {
  const ready = { name: previous.active_model, marker: '✓ SELECTED' };
  const read = rows => runInNewContext(`(function(){${recoveredSelectionScript}})(model)`, {
    model: previous.active_model,
    document: { querySelectorAll: () => rows.map(row => ({ querySelector: selector => ({ textContent: selector === 'h3' ? row.name : row.marker }) })) },
  });
  assert.equal(read([ready]), true);
  for (const rows of [[], [ready, ready], [{ ...ready, name: 'wrong:model' }], [{ ...ready, marker: 'SELECTED · NOT READY' }]]) assert.equal(read(rows), false);
});

test('recovery accepts a new managed process retaining exact model, calibration and storage', () => {
  assert.deepEqual(validateRecoveredModel(previous, recovered()), previous.models[0]);
  // Windows may recycle a numeric PID. Empty-before and owned-after native
  // process snapshots establish the new launch in the actual cloud journey.
  const recycled = recovered(); recycled.model_store.pid = previous.model_store.pid;
  assert.deepEqual(validateRecoveredModel(previous, recycled), previous.models[0]);
});

test('recovery fails closed on changed model, profile, selection or storage', () => {
  const changes = [
    value => { value.active_model = null; },
    value => { value.models[0].model.digest = 'replacement'; },
    value => { value.models[0].profile.context_tokens = 8192; },
    value => { value.models[0].profile_sha256 = 'recalibrated'; },
    value => { value.models = []; },
    value => { value.models.push(structuredClone(value.models[0])); },
    ...['root', 'models_path', 'runs_path', 'source'].map(field => value => { value.managed_storage[field] = 'elsewhere'; }),
  ];
  for (const change of changes) {
    const value = recovered(); change(value);
    assert.throws(() => validateRecoveredModel(previous, value));
  }
});

test('a stopped, unverified, blocked or invalid process is not successful recovery', () => {
  const changes = [
    value => { value.runtime_version = null; },
    value => { value.runtime_error = 'inventory unreadable'; },
    value => { value.endpoint = 'http://127.0.0.1:11435'; },
    value => { value.runtime_version = 'replacement'; },
    value => { value.model_store.status = 'unverified'; },
    value => { value.model_store.goal_run_blocked = true; },
    value => { value.model_store.recovery_required = true; },
    value => { value.model_store.pid = 1.5; },
    value => { value.model_store.pid = 0; },
  ];
  for (const change of changes) {
    const value = recovered(); change(value);
    assert.throws(() => validateRecoveredModel(previous, value));
  }
});
