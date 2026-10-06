import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { requireDisposableUpdaterRunner } from './updater-bootstrap.mjs';
import { loadUpdaterCandidate } from './updater-artifacts.mjs';
import { startControlledUpdaterServer } from './updater-fixture.mjs';
import { launchAndAttachDefaultProfile, attachDefaultProfile, observeDefaultProfile } from './default-profile.mjs';
import { expectedPreferences } from './upgrade-contract.mjs';
import { verifyUpdaterEnginePaths, clickForUpdaterRestart } from './updater-contract.mjs';
import { validateNsisRegistration } from './nsis-upgrade-contract.mjs';
import { fullFixtureTests } from './full-journey.mjs';

requireDisposableUpdaterRunner();
assert.equal(process.env.PHONTON_ACCEPTANCE_PROFILE, undefined);
assert.equal(process.env.WEBVIEW2_USER_DATA_FOLDER, undefined);
const { pin, candidate, fixture: feed } = loadUpdaterCandidate();
const read = file => JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const bootstrap = read('acceptance-evidence/updater-bootstrap.json');
const app = process.env.PHONTON_ACCEPTANCE_APP;
const fixture = process.env.PHONTON_ACCEPTANCE_FIXTURE;
assert.ok(path.isAbsolute(app) && path.isAbsolute(fixture));
const evidence = 'acceptance-evidence';
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const save = (name, value) => writeFileSync(path.join(evidence, name + '.json'), JSON.stringify(value, null, 2) + '\n');
const report = { schema: 1, status: 'running', harnessCommit: process.env.GITHUB_SHA, candidateCommit: pin.commit,
  checks: [], limitations: ['Controlled HTTPS bootstrap update on Windows Server, not public-feed delivery or public 0.3.4 updater migration.',
    'Unsigned publisher identity; local TLS trust is temporary fixture transport only.', 'Named non-secret preferences; no authenticated-account migration.'] };
const seed = { schema: 1, kind: 'controlled-updater', status: 'running', storage: 'default-webview', fixture,
  sentinel: randomUUID(), candidateCommit: pin.commit, installerSha256: pin.installerSha256,
  bootstrapDesktopSha256: bootstrap.desktopSha256 };
seed.preferences = expectedPreferences(fixture, seed.sentinel);
let session, server, oldSession;
let driverPort = 4444;
const persist = () => { save('updater-result', report); save('updater-seed', seed); save('updater-transport', feed.snapshot()); };
const record = (name, detail) => { report.checks.push({ name, detail }); persist(); console.log(`PASS ${name}`); };
async function request(method, route, payload) {
  const response = await fetch(`http://127.0.0.1:${driverPort}${route}`, { method, headers: { 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload), signal: AbortSignal.timeout(190000) });
  const data = await response.json();
  if (!response.ok || data.value?.error) throw new Error(`${method} ${route}: ${JSON.stringify(data.value)}`);
  return data.value;
}
const command = (method, route, payload) => request(method, `/session/${session}${route}`, payload);
const execute = (script, ...args) => command('POST', '/execute/sync', { script, args });
async function until(check, label, timeout = 60000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await delay(500);
  }
  throw new Error(`Timed out: ${label}`);
}
function powershell(script, args = []) {
  const output = execFileSync('pwsh', ['-NoProfile', '-File', `scripts/windows-acceptance/${script}.ps1`, ...args], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  return output.trim() ? JSON.parse(output) : undefined;
}
const native = () => powershell('native-process');
async function screenshot(name) {
  writeFileSync(path.join(evidence, `${name}.png`), Buffer.from(await command('GET', '/screenshot'), 'base64'));
}
async function buttonId(text, scope = '//div[contains(@class,"settings-page")]//') {
  const found = await command('POST', '/element', { using: 'xpath', value: `${scope}button[normalize-space(.)=${JSON.stringify(text)}]` });
  const id = found['element-6066-11e4-a52e-4f735466cecf'];
  assert.equal(await command('GET', `/element/${id}/displayed`), true);
  assert.equal(await command('GET', `/element/${id}/enabled`), true);
  return id;
}
async function button(text, scope) {
  await command('POST', `/element/${await buttonId(text, scope)}/click`, {});
}
async function ready(expected) {
  await command('POST', '/timeouts', { implicit: 0, pageLoad: 180000, script: 180000 });
  await until(() => execute('return document.querySelector(".lw-engine")?.textContent === arguments[0]', `engine ${expected.engine.version}`), 'owned engine readiness');
  const identity = await command('POST', '/execute/async', { script: `const done = arguments[arguments.length - 1];
    Promise.all(['name','identifier','version'].map(key => window.__TAURI_INTERNALS__.invoke('plugin:app|' + key)))
      .then(([productName,identifier,version]) => done({productName,identifier,version})).catch(error => done({error:String(error)}));`, args: [] });
  assert.deepEqual(identity, { productName: expected.productName, identifier: expected.identifier, version: expected.version });
  return identity;
}
async function rpc(method) {
  assert.ok(['config.get', 'models.status'].includes(method));
  const response = await fetch('http://127.0.0.1:47831/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: {} }), signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200);
  const value = await response.json(); assert.ok(!value.error, JSON.stringify(value.error));
  return value.result;
}
async function observeInstalled(expected) {
  assert.equal(hash(app), expected.desktopSha256);
  assert.equal(hash(path.join(path.dirname(app), 'local-engine/phonton.exe')), expected.engine.sha256);
  assert.deepEqual(read(path.join(path.dirname(app), 'local-engine/manifest.json')), expected.engine);
  const processes = native();
  assert.equal(processes.apps.length, 1); assert.equal(processes.engines.length, 1);
  assert.equal(processes.engines[0].ParentProcessId, processes.apps[0].ProcessId);
  assert.ok(processes.listeners.length > 0);
  for (const listener of processes.listeners) {
    assert.equal(listener.LocalAddress, '127.0.0.1'); assert.equal(listener.OwningProcess, processes.engines[0].ProcessId);
  }
  const configuration = await rpc('config.get'), models = await rpc('models.status');
  verifyUpdaterEnginePaths(configuration, models, process.env);
  const registration = powershell('read-nsis-registration');
  validateNsisRegistration(registration, expected.version, path.dirname(app));
  return { processes,
    configPath: configuration.path, managedStorage: models.managed_storage, registration,
    desktopSha256: hash(app), engineSha256: expected.engine.sha256 };
}
async function observe(expected) {
  const installed = await observeInstalled(expected);
  const profile = observeDefaultProfile();
  assert.equal(profile.appProcessId, installed.processes.apps[0].ProcessId);
  return { ...installed, ...profile, page: await execute('return {href:location.href,origin:location.origin}') };
}
const preferences = () => execute('return Object.fromEntries(arguments[0].map(key => [key,localStorage.getItem(key)]))', Object.keys(seed.preferences));
function unchangedSource() { for (const [file, digest] of seed.sourceHashes) assert.equal(hash(path.join(fixture, file)), digest, file); }
async function retained(expected, label) {
  const observed = await observe(expected);
  assert.deepEqual(observed.userDataDirectories, seed.firstSession.userDataDirectories);
  assert.deepEqual(observed.page, seed.firstSession.page);
  assert.deepEqual(await preferences(), seed.preferences);
  assert.equal(await execute('return document.documentElement.dataset.theme'), 'light');
  unchangedSource();
  record(label, observed);
  return observed;
}
async function closeNormally() {
  powershell('native-process', ['-Action', 'close']);
  await until(() => { const s = native(); return !s.apps.length && !s.engines.length && !s.listeners.length && !s.debugListeners.length && !s.runtimes.length && !s.runtimeListeners.length; }, 'normal close releases all owned processes/listeners', 30000);
  assert.equal(typeof (await request('GET', '/status')).ready, 'boolean');
  try { await command('DELETE', ''); } catch { /* A closed window can end the session. */ }
  session = undefined;
}
async function openUpdates() {
  const found = await command('POST', '/element', { using: 'css selector', value: 'nav[aria-label=Workspace] button[aria-label="Settings"]' });
  await command('POST', `/element/${found['element-6066-11e4-a52e-4f735466cecf']}/click`, {});
  await until(() => execute('return !!document.querySelector(".settings-page")'), 'Settings');
  await button('Updates', '//nav[@aria-label="Settings sections"]//');
  await until(() => execute('return [...document.querySelectorAll(".settings-page button")].some(b => b.textContent === "Check for updates" && !b.disabled)'), 'manual update controls');
}
const updateState = () => execute(`const s=[...document.querySelectorAll('.settings-page section')].find(s=>s.querySelector('h2')?.textContent==='App updates');
  return {text:s?.querySelector('[role=status]')?.textContent ?? '',buttons:[...s.querySelectorAll('button')].map(b=>({text:b.textContent,disabled:b.disabled}))};`);
async function stateMatching(pattern, installAvailable) {
  return until(async () => {
    const state = await updateState();
    if (!pattern.test(state.text)) return false;
    assert.ok(state.buttons.some(b => b.text === 'Check for updates' && !b.disabled));
    assert.equal(state.buttons.some(b => b.text === `Update to v${candidate.version}` && !b.disabled), installAvailable);
    assert.ok(state.buttons.every(b => !b.disabled));
    return state;
  }, `update status ${pattern}`);
}
function completedPayload(phase, digest) {
  const events = feed.snapshot().events.filter(event => event.phase === phase && event.path === `/payload/${phase}.exe`);
  assert.equal(events.length, 1);
  assert.equal(events[0].status, 200); assert.equal(events[0].responseFinished, true);
  assert.equal(events[0].bodySha256, digest);
  return events[0];
}

try {
  const tlsDirectory = path.join(process.env.RUNNER_TEMP, 'phonton-updater-tls');
  server = await startControlledUpdaterServer(feed, { key: readFileSync(path.join(tlsDirectory, 'localhost-key.pem')), cert: readFileSync(path.join(tlsDirectory, 'localhost.pem')) });
  mkdirSync(fixture);
  writeFileSync(path.join(fixture, 'port.py'), 'def parse_port(value):\n    return int(value)\n');
  writeFileSync(path.join(fixture, 'test_port.py'), fullFixtureTests);
  execFileSync('git', ['init', '--quiet', fixture]);
  execFileSync('git', ['-C', fixture, 'add', 'port.py', 'test_port.py']);
  seed.sourceHashes = ['port.py', 'test_port.py', '.git/index'].map(file => [file, hash(path.join(fixture, file))]);
  await until(async () => { try { return (await request('GET', '/status'))?.ready; } catch { return false; } }, 'driver startup');
  session = (await launchAndAttachDefaultProfile(request)).sessionId;
  seed.bootstrapIdentity = await ready(bootstrap);
  seed.firstSession = await observe(bootstrap);
  const empty = Object.fromEntries(Object.keys(seed.preferences).map(key => [key, null]));
  assert.deepEqual(await preferences(), { ...empty, 'phonton.theme': 'nebula' }, 'Fresh profile contains only the startup theme');
  await execute('for (const [key,value] of Object.entries(arguments[0])) localStorage.setItem(key,value)', seed.preferences);
  await command('POST', '/refresh', {});
  await ready(bootstrap);
  await retained(bootstrap, 'bootstrap consumes only named fixture preferences');
  await screenshot('updater-01-bootstrap-preferences');
  await closeNormally();
  session = (await launchAndAttachDefaultProfile(request)).sessionId;
  await ready(bootstrap);
  const reopened = await retained(bootstrap, 'same bootstrap retains default profile after normal close');
  seed.bootstrapProcessId = reopened.appProcessId;
  await screenshot('updater-02-bootstrap-reopened');
  await openUpdates();
  await button('Check for updates');
  record('manual no-update check returns usable controls', await stateMatching(/latest version/, false));
  await screenshot('updater-03-current');
  feed.advance('advertised');
  await button('Check for updates');
  await stateMatching(/is available/, true);
  await screenshot('updater-04-available');
  feed.advance('withdrawn');
  await button(`Update to v${candidate.version}`);
  record('withdrawn update releases controls and stale availability', await stateMatching(/no longer available/, false));
  await screenshot('updater-05-withdrawn');
  feed.advance('tampered');
  await button('Check for updates');
  await stateMatching(/is available/, true);
  await button(`Update to v${candidate.version}`);
  const rejection = await stateMatching(/signature/i, true);
  assert.match(rejection.text, /verif|invalid|mismatch|failed|does not match/i, 'Require signature rejection, not a transport failure');
  const negative = completedPayload('tampered', feed.snapshot().tamperedSha256);
  assert.equal((await retained(bootstrap, 'rejected payload preserves bootstrap bytes, ownership, profile and preferences')).appProcessId, seed.bootstrapProcessId);
  record('real updater rejects altered bytes with the original signature and permits retry', { ...rejection, transport: negative });
  await screenshot('updater-06-signature-rejected');
  feed.advance('candidate');
  // The retained Update button is the retry action. No updater IPC is invoked by this test.
  const installButton = await buttonId(`Update to v${candidate.version}`);
  report.installClick = await clickForUpdaterRestart(() => command('POST', `/element/${installButton}/click`, {}));
  persist(); // Preserve lost acknowledgement; never repeat the click.
  // Observe replacement before any attach helper. Never launch a candidate here.
  const replacement = await until(() => {
    const state = powershell('native-process', ['-AllowMissingApp']);
    if (state.apps.some(process => process.ProcessId === seed.bootstrapProcessId)) return false;
    return state.apps.length === 1 && state.apps[0].ProcessId !== seed.bootstrapProcessId &&
      state.engines.length === 1 && state.engines[0].ParentProcessId === state.apps[0].ProcessId &&
      state.listeners.length && state.listeners.every(listener => listener.LocalAddress === '127.0.0.1' && listener.OwningProcess === state.engines[0].ProcessId) ? state : false;
  }, 'updater exits bootstrap and automatically restarts candidate', 180000);
  seed.restartedProcessId = replacement.apps[0].ProcessId;
  record('independent automatic replacement observed before attach', { replacement, transport: completedPayload('candidate', pin.installerSha256) });
  const installedReplacement = await observeInstalled(candidate);
  assert.equal(installedReplacement.processes.apps[0].ProcessId, seed.restartedProcessId);
  record('automatic replacement bytes, engine paths and registration verified before debugger attach', installedReplacement);
  await until(() => {
    const state = native();
    assert.equal(state.apps.length, 1);
    assert.equal(state.apps[0].ProcessId, seed.restartedProcessId, 'The automatically restarted app must survive until attachment');
    return state.debugListeners.length && state.debugListeners.every(listener => listener.LocalAddress === '127.0.0.1') ? state : false;
  }, 'automatically restarted candidate exposes runner-only loopback debugging', 60000);
  // Do not quit the old session while its replacement lives. A second owned
  // driver attaches independently, so old-session teardown cannot affect proof.
  oldSession = session;
  session = undefined;
  driverPort = 4446;
  assert.equal((await request('GET', '/status')).ready, true);
  session = (await attachDefaultProfile(request, seed.restartedProcessId)).sessionId;
  await ready(candidate);
  await retained(candidate, 'automatic restart retains identity, NSIS registration, engine paths, default profile and preferences');
  await screenshot('updater-07-candidate-retained');
  await closeNormally();
  driverPort = 4444;
  try { await request('DELETE', `/session/${oldSession}`); } catch { /* Old app close may already have ended its session. */ }
  assert.equal(typeof (await request('GET', '/status')).ready, 'boolean');
  seed.status = 'candidate-closed';
  report.status = 'passed';
  record('updated candidate closes normally before full post-update journey', native());
} catch (error) {
  report.status = 'failed'; report.error = error.stack; seed.status = 'failed'; process.exitCode = 1;
  if (session) { try { await screenshot('updater-failure'); } catch { /* Preserve original error. */ } }
  try { report.failureProcesses = native(); } catch { /* Same. */ }
} finally {
  if (server) await server.close();
  persist();
}
