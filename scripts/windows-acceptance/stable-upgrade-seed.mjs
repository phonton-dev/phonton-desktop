import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fullFixtureTests } from './full-journey.mjs';
import { expectedPreferences } from './upgrade-contract.mjs';

assert.equal(process.env.GITHUB_ACTIONS, 'true');
assert.equal(process.platform, 'win32');
assert.equal(process.env.WEBVIEW2_USER_DATA_FOLDER, undefined, 'Default profile must not be overridden');
assert.equal(process.env.PHONTON_ACCEPTANCE_PROFILE, undefined);
const fixture = process.env.PHONTON_ACCEPTANCE_FIXTURE;
assert.ok(fixture && path.isAbsolute(fixture));
const candidate = JSON.parse(readFileSync('acceptance-candidate/candidate.json', 'utf8'));
const evidence = path.resolve('acceptance-evidence');
const seed = { schema: 1, status: 'running', storage: 'default-webview', fixture, sentinel: randomUUID(),
  candidateCommit: candidate.desktopCommit, installerSha256: candidate.installer.sha256,
  limitation: 'Non-secret fixture preferences seeded via WebDriver in the real stable app; no authenticated account/session migration.' };
seed.preferences = expectedPreferences(fixture, seed.sentinel);
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const save = () => writeFileSync(path.join(evidence, 'upgrade-seed.json'), JSON.stringify(seed, null, 2) + '\n');
let session;
async function request(method, route, payload) {
  const response = await fetch(`http://127.0.0.1:4444${route}`, { method,
    headers: { 'Content-Type': 'application/json' }, body: payload === undefined ? undefined : JSON.stringify(payload),
    signal: AbortSignal.timeout(190000) });
  const data = await response.json();
  if (!response.ok || data.value?.error) throw new Error(`${method} ${route}: ${JSON.stringify(data.value)}`);
  return data.value;
}
const command = (method, route, payload) => request(method, `/session/${session}${route}`, payload);
const execute = (script, ...args) => command('POST', '/execute/sync', { script, args });
async function until(check, label, timeout = 60000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = await check(); if (value) return value; await delay(1000); }
  throw new Error(`Timed out: ${label}`);
}
function native(action = 'observe') {
  const value = execFileSync('pwsh', ['-NoProfile', '-File', 'scripts/windows-acceptance/native-process.ps1', '-Action', action], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  return action === 'observe' ? JSON.parse(value) : undefined;
}
async function screenshot(name) {
  writeFileSync(path.join(evidence, `${name}.png`), Buffer.from(await command('GET', '/screenshot'), 'base64'));
}
async function profileObservation(launched) {
  const processes = JSON.parse(execFileSync('pwsh', ['-NoProfile', '-File', 'scripts/windows-acceptance/observe-webview-profile.ps1'], { encoding: 'utf8', windowsHide: true, timeout: 30000 }));
  return { capabilities: launched.capabilities, page: await execute('return {href:location.href,origin:location.origin}'), ...processes };
}
try {
  mkdirSync(fixture); // Refuse to reuse a fixture from another attempt.
  writeFileSync(path.join(fixture, 'port.py'), 'def parse_port(value):\n    return int(value)\n');
  writeFileSync(path.join(fixture, 'test_port.py'), fullFixtureTests);
  execFileSync('git', ['init', '--quiet', fixture]);
  execFileSync('git', ['-C', fixture, 'add', 'port.py', 'test_port.py']);
  seed.sourceHashes = ['port.py', 'test_port.py', '.git/index'].map(file => [file, hash(path.join(fixture, file))]);
  seed.stableDesktopSha256 = hash(process.env.PHONTON_ACCEPTANCE_APP);
  await until(async () => { try { return (await request('GET', '/status'))?.ready; } catch { return false; } }, 'driver startup');
  const launched = await request('POST', '/session', { capabilities: { alwaysMatch: {
    'tauri:options': { application: process.env.PHONTON_ACCEPTANCE_APP },
  } } });
  session = launched.sessionId;
  assert.ok(session);
  await command('POST', '/timeouts', { implicit: 0, pageLoad: 180000, script: 180000 });
  await until(() => execute('return !!window.__TAURI_INTERNALS__ && document.body.innerText.includes("Phonton")'), 'stable native setup screen');
  seed.stableIdentity = await command('POST', '/execute/async', { script: `
    const done = arguments[arguments.length - 1];
    Promise.all(['name','identifier','version'].map(key => window.__TAURI_INTERNALS__.invoke('plugin:app|' + key)))
      .then(([productName,identifier,version]) => done({productName,identifier,version}))
      .catch(error => done({error:String(error)}));`, args: [] });
  assert.deepEqual(seed.stableIdentity, { productName: 'Phonton', identifier: 'dev.phonton.desktop', version: '0.3.4' });
  seed.firstSession = await profileObservation(launched);
  const before = await execute('return Object.fromEntries(arguments[0].map(key=>[key,localStorage.getItem(key)]))', Object.keys(seed.preferences));
  // Stable main.tsx applies and persists its default theme at startup.
  assert.deepEqual(before, { ...Object.fromEntries(Object.keys(seed.preferences).map(key => [key, null])), 'phonton.theme': 'nebula' }, 'Stable profile must contain only its startup default');
  await execute('for(const [key,value] of Object.entries(arguments[0])) localStorage.setItem(key,value)', seed.preferences);
  await command('POST', '/refresh', {});
  await until(() => execute('return document.documentElement.dataset.theme === "light"'), 'stable app consumes seeded light preference');
  assert.deepEqual(await execute('return Object.fromEntries(arguments[0].map(key=>[key,localStorage.getItem(key)]))', Object.keys(seed.preferences)), seed.preferences);
  await screenshot('upgrade-01-stable-preferences');
  native('close');
  await until(() => { const state = native(); return !state.apps.length && !state.engines.length && !state.listeners.length; }, 'stable normal close', 30000);
  assert.equal(typeof (await request('GET', '/status')).ready, 'boolean');
  try { await command('DELETE', ''); } catch { /* App close may end the session. */ }
  session = undefined;
  seed.firstProfilesAfterClose = seed.firstSession.userDataDirectories.map(directory => ({ directory, exists: existsSync(directory) }));
  // A same-binary restart is the control: failures here cannot be MSI data loss.
  const reopened = await request('POST', '/session', { capabilities: { alwaysMatch: {
    'tauri:options': { application: process.env.PHONTON_ACCEPTANCE_APP },
  } } });
  session = reopened.sessionId;
  await until(() => execute('return !!window.__TAURI_INTERNALS__ && document.body.innerText.includes("Phonton")'), 'same stable binary reopened');
  seed.reopenedSession = await profileObservation(reopened);
  seed.reopenedPreferences = await execute('return Object.fromEntries(arguments[0].map(key=>[key,localStorage.getItem(key)]))', Object.keys(seed.preferences));
  save();
  assert.deepEqual(seed.reopenedPreferences, seed.preferences, 'Unchanged stable binary must retain preferences before attempting MSI upgrade');
  await screenshot('upgrade-01b-stable-reopened');
  native('close');
  await until(() => { const state = native(); return !state.apps.length && !state.engines.length && !state.listeners.length; }, 'reopened stable normal close', 30000);
  try { await command('DELETE', ''); } catch { /* App close may end the session. */ }
  session = undefined;
  seed.status = 'stable-closed';
  console.log('PASS real stable identity, default-profile fixture preferences, normal close');
} catch (error) {
  seed.status = 'failed'; seed.error = error.stack; process.exitCode = 1;
  if (session) { try { await screenshot('upgrade-stable-failure'); } catch { /* Preserve original failure. */ } }
} finally { save(); }
