import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { interfaceJourney } from './windows-acceptance/interface-journey.mjs';

// This models asynchronous DOM metadata for the acceptance harness itself.
// It is not native product/runtime evidence; the installed cloud journey supplies that.
function harness({ changeConsent = false, neverReady = false, unreadableLabel = null, settlingTheme = false, accentProblem = null, generalDelay = false, missingFieldLabel = false, wrongPressedTheme = false, scrollProblem = null } = {}) {
  const state = { view: 'workbench', section: 'Account', theme: 'nebula', ready: false, approved: false, hovered: false, generalReady: !generalDelay };
  const records = [];
  const screenshots = [];
  let generalWaits = 0;
  let metadataWaits = 0;
  let appearanceWaits = 0;
  let colorsReady = !settlingTheme;
  const surface = { parentElement: null };
  const scrollViewports = [{}, {}];
  const saveGeneral = { textContent: 'Save general', parentElement: surface,
    get disabled() { return accentProblem === 'disabled'; },
    checkVisibility: () => accentProblem !== 'hidden', matches: selector => { assert.equal(selector, ':hover'); return state.hovered; } };
  const colors = {
    nebula: { foreground: [16,32,24], fill: [169,205,185], surface: [20,22,22] },
    'cursor-dark': { foreground: [6,19,33], fill: [55,148,255], surface: [30,30,30] },
    light: { foreground: [255,255,255], fill: [107,76,230], surface: [246,247,251] },
    'high-contrast': { foreground: [0,0,0], fill: [255,255,0], surface: [0,0,0] },
  };
  const document = {
    body: {},
    createElement(tag) {
      assert.equal(tag, 'canvas');
      const context = { clearRect() {}, fillRect() {}, getImageData() {
        const match = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(context.fillStyle); assert.ok(match);
        return {data:[Number(match[1]),Number(match[2]),Number(match[3]),Math.round(Number(match[4])*255)]};
      } };
      return { getContext: kind => { assert.equal(kind, '2d'); return context; } };
    },
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
      if (selector === '.settings-page [data-slot="scroll-area-viewport"]') return scrollViewports;
      if (selector === '.settings-page input:not([aria-hidden="true"]):not([type="hidden"]), .settings-page [role=combobox]') {
        const names = {Provider:['Provider','Model','API key','Base URL','Account ID (Cloudflare)'],Budget:['Max tokens per session','Max USD cents per session'],Index:['Backend','Qdrant URL','Qdrant collection'],Permissions:['Default mode']}[state.section];
        return names.map((name,index) => ({id:`field-${index}`,labels:missingFieldLabel && name === 'Model' ? [] : [{textContent:name}]}));
      }
      if (selector === '.settings-page button[aria-pressed]') {
        const names = state.section === 'Appearance' ? ['Graphite','Cursor Dark','Light','High contrast'] : ['Global','This project'];
        const active = state.section === 'Appearance' ? {nebula:'Graphite','cursor-dark':'Cursor Dark',light:'Light','high-contrast':'High contrast'}[state.theme] : 'Global';
        return names.map(name => ({textContent:name,getAttribute:attribute => { assert.equal(attribute,'aria-pressed'); return String(name === active && !(wrongPressedTheme && state.section === 'Appearance')); }}));
      }
      if (selector === '.settings-page button') {
        if (state.section !== 'General' || !state.generalReady || accentProblem === 'absent') return [];
        return accentProblem === 'ambiguous' ? [saveGeneral, saveGeneral] : [saveGeneral];
      }
      if (selector === '.settings-page h2') {
        return [{ textContent: ({ MCP: 'MCP servers', Updates: 'App updates' })[state.section] || state.section }];
      }
      assert.equal(selector, '.settings-page h1, .settings-page h2, .settings-page > header button, .settings-nav button, .settings-page section button span.text-sm');
      return ['Settings', 'Appearance', 'Back', 'Account', 'Appearance', 'Provider', 'Budget', 'Index', 'Permissions', 'General', 'Steering', 'MCP', 'Doctor', 'Updates', 'Graphite', 'Cursor Dark', 'Light', 'High contrast']
        .map(textContent => ({ textContent }));
    },
  };
  const context = vm.createContext({ document, innerWidth: 1280,
    localStorage: { getItem: () => 'C:\\fixture' },
    getComputedStyle: (element, pseudo) => {
      if (scrollViewports.includes(element)) {
        if (pseudo) {
          assert.equal(pseudo, '::-webkit-scrollbar');
          return { display: scrollProblem === 'webkit-track' ? 'block' : 'none' };
        }
        return { scrollbarWidth: scrollProblem === 'native-track' ? 'auto' : 'none',
          overflowX: scrollProblem === 'horizontal-disabled' ? 'hidden' : 'scroll',
          overflowY: scrollProblem === 'vertical-disabled' ? 'hidden' : 'scroll' };
      }
      if (element === saveGeneral || element === surface) {
        const palette = colors[state.theme];
        const unreadable = accentProblem === 'normal-contrast' && !state.hovered || accentProblem === 'hover-contrast' && state.hovered;
        const foreground = unreadable ? palette.fill : palette.foreground;
        return {opacity:'1',filter:'none',mixBlendMode:'normal',backgroundImage:'none',
          color:`rgba(${foreground.join(',')},1)`,
          backgroundColor:`rgba(${(element === surface ? palette.surface : palette.fill).join(',')},${element === saveGeneral && state.hovered ? 0.9 : 1})`};
      }
      return {
      color: state.theme === 'light' && (!colorsReady || element.textContent === unreadableLabel) ? 'rgb(238, 238, 232)' : 'rgb(20, 24, 40)',
      backgroundColor: state.theme === 'light' ? 'rgb(246, 247, 251)' : 'rgb(20, 22, 22)',
    }; },
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
      if (description === 'readable Light Settings labels') {
        appearanceWaits++;
        colorsReady = true; // Color transitions finish; an unreadableLabel stays wrong.
      }
      if (description === 'General action ready' && generalDelay) { generalWaits++; state.generalReady = true; }
    }
    throw new Error(`Timed out: ${description}`);
  };
  let pending;
  const command = async (method, route, payload) => {
    if (method === 'POST' && route === '/element') {
      const match = payload.value.match(/normalize-space\(\.\)=("[^"]*")/);
      assert.ok(match);
      pending = { label: JSON.parse(match[1]), section: payload.value.includes('Settings sections') };
      if (pending.label === 'Save general') assert.equal(state.generalReady, true, 'Wait for rendered control before native element lookup');
      return { 'element-6066-11e4-a52e-4f735466cecf': 'button' };
    }
    if (method === 'GET') return true;
    if (route === '/actions') {
      if (method === 'DELETE') return;
      assert.equal(method, 'POST');
      const pointer = payload.actions[0]; assert.equal(pointer.type, 'pointer'); assert.equal(pointer.parameters.pointerType, 'mouse');
      assert.equal(pointer.actions.length, 1); assert.equal(pointer.actions[0].type, 'pointerMove');
      const origin = pointer.actions[0].origin;
      if (origin === 'viewport') state.hovered = false;
      else { assert.equal(origin['element-6066-11e4-a52e-4f735466cecf'], 'button'); state.hovered = true; }
      return;
    }
    assert.equal(route, '/element/button/click');
    assert.notEqual(pending.label, 'Save general', 'Contrast inspection must never save configuration');
    if (pending.section) { state.section = pending.label; if (state.section === 'General') state.generalReady = !generalDelay; }
    else if (pending.label === 'Light') state.theme = 'light';
    else if (pending.label === 'Graphite') state.theme = 'nebula';
    else if (pending.label === 'Cursor Dark') state.theme = 'cursor-dark';
    else if (pending.label === 'High contrast') state.theme = 'high-contrast';
    else if (pending.label === 'Open online workspace') state.view = 'online';
    else if (['Back', '← Return to local workspace'].includes(pending.label)) {
      state.view = 'workbench'; state.ready = false; // Focus refresh drops old metadata.
      if (pending.label.startsWith('←') && changeConsent) state.approved = true;
    } else assert.fail(`Unexpected button: ${pending.label}`);
  };
  return {
    run: () => interfaceJourney({ command, execute, until,
      click: async selector => { assert.match(selector, /Settings/); state.view = 'settings'; },
      screenshot: async name => screenshots.push(name), record: (...args) => records.push(args),
    }),
    records, screenshots, waits: () => metadataWaits, appearanceWaits: () => appearanceWaits, generalWaits: () => generalWaits,
  };
}

test('installed settings audit rejects an unnamed field or missing selected theme', async () => {
  await assert.rejects(harness({missingFieldLabel:true}).run(), /Model must have its real associated label/);
  await assert.rejects(harness({wrongPressedTheme:true}).run(), /active theme must expose its pressed state/);
});

test('installed settings audit rejects duplicate native tracks and disabled scrolling', async () => {
  for (const scrollProblem of ['native-track', 'webkit-track', 'horizontal-disabled', 'vertical-disabled']) {
    const app = harness({ scrollProblem });
    await assert.rejects(app.run(), error => error.code === 'ERR_ASSERTION');
    assert.equal(app.records.length, 0, 'No settings success with broken viewport styles');
  }
});

test('installed navigation waits for late and refreshed machine metadata at every snapshot', async () => {
  const app = harness();
  await app.run();
  assert.equal(app.waits(), 3, 'Initial, Settings-return and online-return snapshots must each wait');
  assert.equal(app.records.length, 3);
});

test('metadata readiness does not hide a changed consent state after navigation', async () => {
  const app = harness({ changeConsent: true });
  await assert.rejects(app.run(), /Optional setup must preserve the complete local draft/);
  assert.equal(app.waits(), 3);
  assert.equal(app.records.length, 2, 'No success record for changed state');
});

test('missing machine metadata fails rather than comparing incomplete plan text', async () => {
  const app = harness({ neverReady: true });
  await assert.rejects(app.run(), /Timed out: machine evidence directory/);
  assert.equal(app.records.length, 0);
});

test('installed appearance acceptance rejects unreadable inherited Settings labels', async () => {
  for (const unreadableLabel of ['Settings', 'Appearance', 'Back', 'Account', 'Graphite']) {
    const app = harness({ unreadableLabel });
    await assert.rejects(app.run(), /Timed out: readable Light Settings labels/);
    assert.equal(app.records.length, 2, 'Unreadable labels must not produce a successful appearance record');
  }
});

test('installed appearance acceptance waits for theme transitions before checking readable labels', async () => {
  const app = harness({ settlingTheme: true });
  await app.run();
  assert.equal(app.appearanceWaits(), 1);
  assert.equal(app.records.length, 3);
  assert.equal(app.records[2][1].lightSettings.labels.length, 18);
  assert.ok(app.records[2][1].lightSettings.labels.every(label => label.color === 'rgb(20, 24, 40)'));
});

test('enabled native accent acceptance waits for General and records all four normal and hover states without saving', async () => {
  const app = harness({generalDelay:true}); await app.run();
  assert.equal(app.generalWaits(), 4);
  assert.equal(app.screenshots.filter(name => name.startsWith('ui-accent-')).length, 8);
  const checked = app.records[1][1]; assert.equal(checked.length, 4);
  for (const entry of checked) { assert.equal(entry.normal.hovered, false); assert.equal(entry.hover.hovered, true); assert.ok(entry.normal.ratio >= 4.5 && entry.hover.ratio >= 4.5); }
});
test('accent acceptance rejects missing, disabled, hidden or ambiguous actions', async () => {
  for (const accentProblem of ['absent','disabled','hidden','ambiguous']) {
    const app = harness({accentProblem});
    await assert.rejects(app.run(), /Timed out: General action ready/);
    assert.equal(app.records.length, 1, 'No accent success without the unique enabled action');
  }
});
test('accent acceptance rejects unreadable normal and hovered paint', async () => {
  for (const accentProblem of ['normal-contrast','hover-contrast']) {
    const app = harness({accentProblem});
    await assert.rejects(app.run(), /enabled action contrast/);
    assert.equal(app.records.length, 1, 'No accent success for unreadable paint');
  }
});
