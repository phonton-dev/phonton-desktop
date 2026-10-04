import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the actual harness action and its button helper without a native app.
// Installed cloud acceptance remains the proof for the product journey.
const source = readFileSync(new URL('./windows-acceptance/full-journey.mjs', import.meta.url), 'utf8');
const helper = source.slice(source.indexOf('  async function button('), source.indexOf('  async function operation('));
const action = source.slice(source.indexOf("  await screenshot('full-02-approved-plan');"), source.indexOf('  const runId = await wait('));
assert.ok(helper.includes('async function button('));
assert.ok(action.includes('full-02-approved-plan'));

function harness({ neverReady = false, lookupError = null, clickError = null } = {}) {
  let polls = 0;
  let clicks = 0;
  let started = 0;
  let enabled = false;
  const command = async (method, route, payload) => {
    if (method === 'POST' && route === '/element') {
      assert.equal(payload.using, 'xpath');
      assert.match(payload.value, /lw-plan-actions/);
      assert.match(payload.value, /button\[normalize-space\(\.\)="Run local goal →"\]$/);
      polls++;
      if (lookupError) throw new Error(lookupError);
      return { 'element-6066-11e4-a52e-4f735466cecf': 'run-button' };
    }
    if (method === 'GET' && route === '/element/run-button/enabled') {
      enabled = !neverReady && polls >= 3;
      return enabled;
    }
    assert.equal(route, '/element/run-button/click');
    clicks++;
    assert.equal(enabled, true, 'Never click while readiness disables Run');
    if (clickError) throw new Error(clickError);
    started++;
  };
  const context = vm.createContext({ command, screenshot: async () => {},
    // A WebDriver click on a disabled native control has no effect.
    click: async () => { clicks++; if (enabled) started++; },
    wait: async (check, description) => {
      for (let attempt = 0; attempt < 4; attempt++) {
        const value = await check();
        if (value) return value;
      }
      throw new Error(`Timed out: ${description}`);
    },
  });
  return { run: () => vm.runInContext(`(async () => { ${helper}\n${action} })()`, context),
    counts: () => ({ polls, clicks, started }) };
}

test('approved Run waits for readiness and starts exactly once', async () => {
  const app = harness();
  await app.run();
  assert.deepEqual(app.counts(), { polls: 3, clicks: 1, started: 1 });
});

test('permanently disabled Run fails without clicking', async () => {
  const app = harness({ neverReady: true });
  await assert.rejects(app.run(), /Timed out: Run local goal → present and enabled/);
  assert.deepEqual(app.counts(), { polls: 4, clicks: 0, started: 0 });
});

test('terminal driver errors fail immediately instead of retrying', async () => {
  const app = harness({ lookupError: 'invalid session id' });
  await assert.rejects(app.run(), /invalid session id/);
  assert.deepEqual(app.counts(), { polls: 1, clicks: 0, started: 0 });
});

test('a rejected click is never repeated', async () => {
  const app = harness({ clickError: 'element click intercepted' });
  await assert.rejects(app.run(), /element click intercepted/);
  assert.deepEqual(app.counts(), { polls: 3, clicks: 1, started: 0 });
});
