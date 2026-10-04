import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { interfaceJourney } from './windows-acceptance/interface-journey.mjs';

// This models asynchronous DOM metadata for the acceptance harness itself.
// It is not native product/runtime evidence; the installed cloud journey supplies that.
function harness({ changeConsent = false, neverReady = false } = {}) {
  const state = { view: 'workbench', section: 'Account', theme: 'nebula', ready: false, approved: false };
  const records = [];
  let metadataWaits = 0;
  const document = {
    documentElement: { get dataset() { return { theme: state.theme }; }, scrollWidth: 1280 },
    querySelector(selector) {
      const fields = {
        '#local-goal': { value: 'Fix port parsing', getBoundingClientRect: () => ({ height: state.view === 'workbench' ? 120 : 0 }) },
        '#local-files': { value: 'port.py' }, '#local-check': { value: '["python","-m","unittest"]' },
        '[aria-label=Plan]': { textContent: `EDIT port.py CHECK unittest${state.ready ? ' · evidence under C:\\fixture\\runs' : ''}` },
        '.lw-approval input': { checked: state.approved },
        '.lw-plan-flow code': state.ready ? { textContent: 'C:\\fixture\\runs' } : null,
        '.settings-page': state.view === 'settings' ? {} : null,
        '.settings-nav [aria-current=page]': { textContent: state.section },
        '.local-workbench': {},
        '.online-return': state.view === 'online' ? { closest: () => null } : null,
      };
      assert.ok(Object.hasOwn(fields, selector), `Unexpected DOM query: ${selector}`);
      return fields[selector];
    },
    querySelectorAll(selector) {
      assert.equal(selector, '.settings-page h2');
      return [{ textContent: ({ MCP: 'MCP servers', Updates: 'App updates' })[state.section] || state.section }];
    },
  };
  const context = vm.createContext({ document, innerWidth: 1280,
    localStorage: { getItem: () => 'C:\\fixture' },
    getComputedStyle: () => ({ color: 'rgb(20, 22, 22)', backgroundColor: state.theme === 'light' ? 'rgb(246, 247, 251)' : 'rgb(20, 22, 22)' }),
  });
  const execute = async (script, ...args) => {
    const result = vm.runInContext(`(function(){${script}})`, context)(...args);
    return result === undefined ? null : JSON.parse(JSON.stringify(result));
  };
  const until = async (check, description) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await check();
      if (result) return result;
      if (description === 'machine evidence directory in the plan') {
        metadataWaits++;
        if (!neverReady) state.ready = true; // The asynchronous probe completes.
      }
    }
    throw new Error(`Timed out: ${description}`);
  };
  let pending;
  const command = async (method, route, payload) => {
    if (method === 'POST' && route === '/element') {
      const match = payload.value.match(/normalize-space\(\.\)=("[^"]*")/);
      assert.ok(match);
      pending = { label: JSON.parse(match[1]), section: payload.value.includes('Settings sections') };
      return { 'element-6066-11e4-a52e-4f735466cecf': 'button' };
    }
    if (method === 'GET') return true;
    assert.equal(route, '/element/button/click');
    if (pending.section) state.section = pending.label;
    else if (pending.label === 'Light') state.theme = 'light';
    else if (pending.label === 'Graphite') state.theme = 'nebula';
    else if (pending.label === 'Open online workspace') state.view = 'online';
    else if (['Back', '← Return to local workspace'].includes(pending.label)) {
      state.view = 'workbench'; state.ready = false; // Focus refresh drops old metadata.
      if (pending.label.startsWith('←') && changeConsent) state.approved = true;
    } else assert.fail(`Unexpected button: ${pending.label}`);
  };
  return {
    run: () => interfaceJourney({ command, execute, until,
      click: async selector => { assert.match(selector, /Settings/); state.view = 'settings'; },
      screenshot: async () => {}, record: (...args) => records.push(args),
    }),
    records, waits: () => metadataWaits,
  };
}

test('installed navigation waits for late and refreshed machine metadata at every snapshot', async () => {
  const app = harness();
  await app.run();
  assert.equal(app.waits(), 3, 'Initial, Settings-return and online-return snapshots must each wait');
  assert.equal(app.records.length, 2);
});

test('metadata readiness does not hide a changed consent state after navigation', async () => {
  const app = harness({ changeConsent: true });
  await assert.rejects(app.run(), /Optional setup must preserve the complete local draft/);
  assert.equal(app.waits(), 3);
  assert.equal(app.records.length, 1, 'No success record for changed state');
});

test('missing machine metadata fails rather than comparing incomplete plan text', async () => {
  const app = harness({ neverReady: true });
  await assert.rejects(app.run(), /Timed out: machine evidence directory/);
  assert.equal(app.records.length, 0);
});
