import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fullFixtureTests, fullJourney } from './full-journey.mjs';
import { interfaceJourney } from './interface-journey.mjs';
import { pickerJourney, nativePicker, settledPickerState } from './picker-journey.mjs';
import { verifyRetainedPreferences } from './upgrade-contract.mjs';
import { launchAndAttachDefaultProfile, observeDefaultProfile } from './default-profile.mjs';

assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Disposable Actions runner required');
assert.equal(process.platform, 'win32');
const app = process.env.PHONTON_ACCEPTANCE_APP;
const profile = process.env.PHONTON_ACCEPTANCE_PROFILE;
const fixture = process.env.PHONTON_ACCEPTANCE_FIXTURE;
const full = process.env.PHONTON_ACCEPTANCE_FULL_JOURNEY === 'true';
const picker = process.env.PHONTON_ACCEPTANCE_NATIVE_PICKER === 'true';
const upgrade = process.env.PHONTON_ACCEPTANCE_UPGRADE_RECORD
  ? JSON.parse(readFileSync(process.env.PHONTON_ACCEPTANCE_UPGRADE_RECORD, 'utf8')) : null;
assert.ok(app && fixture && (profile || upgrade));
if (upgrade) {
  assert.equal(full, true);
  assert.equal(profile, undefined, 'Upgrade must use the default WebView profile');
  assert.equal(process.env.WEBVIEW2_USER_DATA_FOLDER, undefined);
}
const candidate = JSON.parse(readFileSync('acceptance-candidate/candidate.json', 'utf8'));
const evidence = path.resolve('acceptance-evidence');
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const report = { schema: 1, status: 'running', mode: full ? 'full' : 'smoke', candidateProfile: candidate.profile, installerKind: candidate.installer.kind ?? 'nsis', checks: [], limitations: [
  'Silent installer: prompts, SmartScreen and standard-user permissions are not exercised.',
  ...(picker ? ['Native folder picker covers the owned English Windows Server dialog and one disposable fixture only.'] : ['Workspace selection is seeded in localStorage; native folder picker is not exercised.']),
  ...(full ? ['One pinned model and one Python fixture only; no general model-quality or language-coverage claim.'] : ['No model download, calibration, inference, Apply, receipt reopen or rollback in this smoke test.']),
  ...(upgrade ? [`Windows Server ${candidate.installer.kind.toUpperCase()} forward upgrade with named fixture preferences only; consumer Windows, authenticated account migration, cross-installer migration, native signing and updater installation remain untested.`] : ['Windows Server runner; consumer Windows, native signing, stable-version upgrade and updater installation remain untested.']),
] };
if (upgrade) report.upgrade = { from: '0.3.4', storage: 'default-webview', harnessCommit: process.env.GITHUB_SHA, candidateCommit: candidate.desktopCommit };
let session;
const save = () => writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(report, null, 2) + '\n');
const record = (name, detail = true) => { report.checks.push({ name, detail }); save(); console.log(`PASS ${name}`); };
async function request(method, route, payload) {
  const response = await fetch(`http://127.0.0.1:4444${route}`, {
    method, headers: { 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload), signal: AbortSignal.timeout(190000),
  });
  const data = await response.json();
  if (!response.ok || data.value?.error) throw new Error(`${method} ${route}: ${JSON.stringify(data.value)}`);
  return data.value;
}
const command = (method, route, payload) => request(method, `/session/${session}${route}`, payload);
const execute = (script, ...args) => command('POST', '/execute/sync', { script, args });
async function until(check, description, timeout = 180000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try { const value = await check(); if (value) return value; } catch (error) { last = error; }
    await delay(1000);
  }
  throw new Error(`Timed out: ${description}${last ? `: ${last.message}` : ''}`);
}
async function element(selector) {
  const result = await command('POST', '/element', { using: 'css selector', value: selector });
  return result['element-6066-11e4-a52e-4f735466cecf'];
}
async function click(selector) { await command('POST', `/element/${await element(selector)}/click`, {}); }
async function type(selector, text) {
  const id = await element(selector);
  await command('POST', `/element/${id}/clear`, {});
  await command('POST', `/element/${id}/value`, { text });
}
async function screenshot(name) {
  const png = await command('GET', '/screenshot');
  writeFileSync(path.join(evidence, `${name}.png`), Buffer.from(png, 'base64'));
}
function native(action = 'observe') {
  const output = execFileSync('pwsh', ['-NoProfile', '-File', 'scripts/windows-acceptance/native-process.ps1', '-Action', action], {
    encoding: 'utf8', windowsHide: true, timeout: 30000,
  });
  return action === 'observe' ? JSON.parse(output) : undefined;
}
async function ownedEngine() {
  const state = await until(async () => {
    const value = native();
    return value.apps.length === 1 && value.engines.length === 1 && value.listeners.length ? value : false;
  }, 'installed application and engine listener');
  assert.equal(state.engines[0].ParentProcessId, state.apps[0].ProcessId, 'Desktop must own engine child');
  for (const listener of state.listeners) {
    assert.equal(listener.LocalAddress, '127.0.0.1');
    assert.equal(listener.OwningProcess, state.engines[0].ProcessId);
  }
  const response = await fetch('http://127.0.0.1:47831/health', { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200);
  return state;
}
async function ready() {
  await until(() => execute('return document.querySelector(".lw-engine")?.textContent === arguments[0]', `engine ${candidate.engine.version}`), 'real engine ready in native workbench');
}
async function start() {
  const value = upgrade ? await launchAndAttachDefaultProfile(request) : await request('POST', '/session', { capabilities: { alwaysMatch: {
    'tauri:options': { application: app, ...(upgrade ? {} : { webviewOptions: { userDataFolder: profile } }) },
  } } });
  session = value.sessionId;
  assert.ok(session, 'WebDriver session ID missing');
  await command('POST', '/timeouts', { implicit: 0, pageLoad: 180000, script: 180000 });
  await ready();
  const identity = await command('POST', '/execute/async', { script: `
    const done = arguments[arguments.length - 1];
    Promise.all(['name','identifier','version'].map(key => window.__TAURI_INTERNALS__.invoke('plugin:app|' + key)))
      .then(([productName, identifier, version]) => done({productName, identifier, version}))
      .catch(error => done({error: String(error)}));
  `, args: [] });
  assert.deepEqual(identity, {productName: candidate.productName, identifier: candidate.identifier, version: candidate.version}, 'Installed application identity must match the tested profile');
  record('native application name, identifier and version', identity);
}
async function closeNormally(name) {
  // Keep both WebDrivers alive until the app's own cleanup has been observed.
  native('close');
  await until(() => { const s = native(); return !s.apps.length && !s.engines.length && !s.listeners.length && (!upgrade || !s.debugListeners.length) && (!full || (!s.runtimes.length && !s.runtimeListeners.length)); }, 'normal close releases engine and owned runtime listeners', 30000);
  const driverStatus = await request('GET', '/status');
  assert.equal(typeof driverStatus?.ready, 'boolean', 'Both WebDrivers must still respond after app cleanup');
  record(name);
  try { await command('DELETE', ''); } catch { /* window close can end the WebDriver session itself */ }
  session = undefined;
}

try {
  if (upgrade) {
    assert.equal(fixture, upgrade.fixture);
    for (const [file, digest] of upgrade.sourceHashes) assert.equal(hash(path.join(fixture, file)), digest, 'Upgrade changed the retained fixture');
    assert.deepEqual(upgrade.sourceHashes.map(([file]) => file), ['port.py', 'test_port.py', '.git/index']);
  } else {
  mkdirSync(fixture);
  writeFileSync(path.join(fixture, 'port.py'), 'def parse_port(value):\n    return int(value)\n');
  writeFileSync(path.join(fixture, 'test_port.py'), full ? fullFixtureTests : 'import unittest\nfrom port import parse_port\n\nclass PortTests(unittest.TestCase):\n    def test_port(self):\n        self.assertEqual(parse_port("8080"), 8080)\n');
  execFileSync('git', ['init', '--quiet', fixture]);
  execFileSync('git', ['-C', fixture, 'add', 'port.py', 'test_port.py']);
  }
  const identities = ['port.py', 'test_port.py', '.git/index'].map(file => [file, hash(path.join(fixture, file))]);
  await until(async () => (await request('GET', '/status'))?.ready === true, 'WebDriver startup', 30000);
  await start();
  const first = await ownedEngine();
  record('installed engine ownership and health', first);
  await screenshot('01-first-launch');

  if (upgrade) {
    const observed = await execute('return Object.fromEntries(arguments[0].map(key => [key, localStorage.getItem(key)]))', Object.keys(upgrade.preferences));
    const nativeProfile = observeDefaultProfile();
    const page = await execute('return {href:location.href,origin:location.origin}');
    assert.deepEqual(nativeProfile.userDataDirectories, upgrade.firstSession.userDataDirectories, 'Upgraded app must discover the same native profile');
    assert.deepEqual(page, upgrade.firstSession.page, 'Upgraded app must retain the same origin');
    verifyRetainedPreferences(upgrade, observed, candidate);
    assert.equal(await execute('return document.documentElement.dataset.theme'), 'light', 'Retained theme must be rendered');
    assert.ok((await execute('return document.querySelector(".lw-intro h1").textContent')).includes(path.basename(fixture)), 'Retained repository must be active in the native workbench');
    await screenshot('upgrade-02-retained-workbench');
    record(`${candidate.installer.kind.toUpperCase()} upgrade retains default-profile theme, active and recent repository before any reseed`, { observed, nativeProfile, page, stableDesktopSha256: upgrade.stableDesktopSha256 });
  } else if (picker) {
    assert.equal(upgrade, null, 'Native picker mode is separate from retained-profile upgrade');
    await pickerJourney({ execute, click, type, until, screenshot, record, fixture, evidence, identities, hash, ownedEngine });
  } else {
    await execute('localStorage.setItem("phonton.projects.active",arguments[0]);localStorage.setItem("phonton.projects.recent",JSON.stringify([arguments[0]]));', fixture);
  }
  await command('POST', '/refresh', {});
  await ready();
  const refreshed = await ownedEngine();
  assert.equal(refreshed.engines[0].ProcessId, first.engines[0].ProcessId, 'WebView reconnect must reuse its owned engine');
  record('WebView reload reconnect preserves owned engine');

  await type('#local-goal', 'Make parse_port reject non-digit input and ports outside 1 through 65535.');
  await click('.lw-scope-details > summary');
  await type('#local-files', 'port.py');
  await click('.lw-verification > summary');
  await type('#local-check', '["python","-m","unittest","discover"]');
  await click('.lw-submit .lw-primary');
  await until(() => execute('return !!document.querySelector("[aria-label=Plan]")'), 'native plan review');
  const planText = await execute('return document.querySelector("[aria-label=Plan]").innerText');
  assert.ok(planText.includes('port.py') && planText.includes('unittest'), 'Plan must show actual source and check');
  assert.equal(await execute('return document.querySelector(".lw-plan-actions .lw-primary").disabled'), true, 'Unconfigured runtime must not start inference');
  assert.equal(await execute('return document.querySelector(".lw-approval input").checked'), false, 'Plan must not approve host execution');
  for (const [file, digest] of identities) assert.equal(hash(path.join(fixture, file)), digest, `${file} changed during review`);
  await screenshot('02-plan-review');
  record('native plan, source identity, unchanged source and index, execution gates', { sourceHashes: identities, planText });

  if (picker) {
    const snapshot = () => settledPickerState({ execute, until }, true);
    const beforeCancel = await snapshot();
    await nativePicker('cancel', 'picker-04-reviewed-plan-cancel', { click, evidence, fixture });
    assert.deepEqual(await snapshot(), beforeCancel, 'Native cancel must preserve reviewed plan and unapproved consent');
    record('native folder picker cancel preserves reviewed plan and consent');
  }

  await interfaceJourney({ command, execute, click, screenshot, record, until });
  const afterNavigation = await ownedEngine();
  assert.equal(afterNavigation.engines[0].ProcessId, first.engines[0].ProcessId, 'Settings and optional setup must preserve the owned engine');
  for (const [file, digest] of identities) assert.equal(hash(path.join(fixture, file)), digest, `${file} changed during settings navigation`);
  record('settings navigation preserves engine, source and staging');

  await click('nav[aria-label=Workspace] button[aria-label="Local models"]');
  await until(() => execute('return document.querySelector("#models-title")?.textContent === "Local models" && [...document.querySelectorAll("button")].some(b => b.textContent === "Refresh readings" && !b.disabled)'), 'native model hardware readings');
  assert.match(await execute('return document.querySelector(".model-hardware-details summary").textContent'), /RAM free/);
  await screenshot('03-local-models');
  record('native Local models page reads machine state');
  if (full) {
    await fullJourney({ command, execute, click, type, screenshot, hash, record, fixture,
      evidence, identities, start, closeNormally, ownedEngine, native });
  } else {
  await closeNormally('normal window close releases engine and listener');

  await start();
  const restarted = await ownedEngine();
  assert.equal(await execute('return localStorage.getItem("phonton.projects.active")'), fixture);
  assert.ok((await execute('return document.querySelector(".lw-intro h1").textContent')).includes('phonton acceptance fixture'));
  assert.equal(await execute('return document.querySelector("#local-goal").value'), '', 'Goal draft is intentionally not persisted');
  await screenshot('04-restarted-workspace');
  record('new native process restores active repository', restarted);
  for (const [file, digest] of identities) assert.equal(hash(path.join(fixture, file)), digest);
  await closeNormally('restarted window close also releases engine');
  }
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.stack;
  if (session) {
    try { await screenshot('failure'); } catch { /* preserve original failure */ }
    try { writeFileSync(path.join(evidence, 'failure-page.html'), await command('GET', '/source')); } catch { /* same */ }
  }
  try { report.failureProcesses = native(); } catch { /* same */ }
  process.exitCode = 1;
} finally { save(); }
