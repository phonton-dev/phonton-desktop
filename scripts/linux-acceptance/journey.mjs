import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fullFixtureTests } from '../windows-acceptance/full-journey.mjs';
import { interfaceJourney } from '../windows-acceptance/interface-journey.mjs';
import { settledPickerState } from '../windows-acceptance/picker-journey.mjs';
import { verifyExternalModel, sameLinuxProcess } from './contract.mjs';
import { linuxSnapshot, isDescendant } from './processes.mjs';

assert.equal(process.platform, 'linux');
assert.equal(process.env.GITHUB_ACTIONS, 'true');
assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const pin = read('scripts/linux-acceptance/source.json');
const installed = read('acceptance-evidence/install.json');
const expected = { app: installed.app, engine: installed.engine, runtime: installed.runtime };
const fixture = path.join(process.env.RUNNER_TEMP, 'phonton acceptance fixture');
const evidence = path.resolve('acceptance-evidence');
const stateDirectory = path.dirname(process.env.PHONTON_LOCAL_STATE);
const model = { model: 'qwen2.5-coder:3b', digest: 'f72c60cabf6237b07f6e632b2c48d533cef25eda2efbd34bed21c5e9c01e6225', context: 4096, runtimeVersion: '0.34.2' };
const CHECK = ['python3', '-m', 'unittest', 'discover'];
const save = (name, data) => writeFileSync(path.join(evidence, name + '.json'), JSON.stringify(data, null, 2) + '\n');
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const report = { schema: 1, status: 'running', harnessCommit: process.env.GITHUB_SHA, candidateCommit: pin.commit,
  checks: [], limitations: ['Ubuntu22.04/Xvfb and one pinned model/existing-file fixture only.', 'External Ollama origin remains unverified in the product.', 'No trusted signing, public updates or other Linux distributions are implied.'] };
const record = (name, detail = true) => { report.checks.push({ name, detail }); save('result', report); console.log('PASS ' + name); };
let session;
const request = async (method, route, payload) => {
  const response = await fetch('http://127.0.0.1:4444' + route, { method, headers: { 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload), signal: AbortSignal.timeout(190000) });
  const data = await response.json();
  if (!response.ok || data.value?.error) throw new Error(`${method} ${route}: ${JSON.stringify(data.value)}`);
  return data.value;
};
const command = (method, route, payload) => request(method, `/session/${session}${route}`, payload);
const execute = (script, ...args) => command('POST', '/execute/sync', { script, args });
async function until(check, label, timeout = 180000) {
  const end = Date.now() + timeout;
  let nextLog = 0;
  while (Date.now() < end) {
    const value = await check();
    if (value) return value;
    if (Date.now() >= nextLog) { console.log('WAIT ' + label); nextLog = Date.now() + 30000; }
    await delay(500);
  }
  throw new Error('Timed out: ' + label);
}
const element = async (selector, using = 'css selector') => (await command('POST', '/element', { using, value: selector }))['element-6066-11e4-a52e-4f735466cecf'];
const click = async selector => command('POST', `/element/${await element(selector)}/click`, {});
async function type(selector, text) {
  const id = await element(selector);
  await command('POST', `/element/${id}/clear`, {});
  await command('POST', `/element/${id}/value`, { text });
}
async function button(text, scope = '//') {
  const id = await until(async () => {
    try {
      const id = await element(`${scope}button[normalize-space(.)=${JSON.stringify(text)}]`, 'xpath');
      return await command('GET', `/element/${id}/enabled`) ? id : false;
    } catch (error) { if (/"error":"(?:no such element|stale element reference)"/.test(error.message)) return false; throw error; }
  }, text + ' enabled');
  await command('POST', `/element/${id}/click`, {});
}
const screenshot = async name => writeFileSync(path.join(evidence, name + '.png'), Buffer.from(await command('GET', '/screenshot'), 'base64'));
const native = () => linuxSnapshot(expected);
const readRpc = async (method, params = {}) => {
  assert.ok(['models.status', 'models.operation', 'local.run.status', 'local.run.read'].includes(method));
  const response = await fetch('http://127.0.0.1:47831/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: method === 'models.status' ? { context: model.context } : params }), signal: AbortSignal.timeout(180000) });
  const reply = await response.json(); assert.ok(response.ok && !reply.error, JSON.stringify(reply.error)); return reply.result;
};
const external = read('acceptance-evidence/external-runtime.json');
function runtimeRetained(snapshot) {
  assert.equal(sameLinuxProcess(external.process, snapshot.runtimes.find(row => row.pid === external.process.pid)), true, 'External runtime identity changed');
  const listeners = snapshot.listeners.filter(row => row.port === 11434);
  assert.equal(listeners.length, 1); assert.equal(listeners[0].loopback, true);
  assert.deepEqual(listeners[0].pids, [external.process.pid]);
}
async function ownedEngine() {
  return until(() => {
    const snapshot = native(); runtimeRetained(snapshot);
    if (snapshot.apps.length !== 1 || snapshot.engines.length !== 1) return false;
    assert.equal(isDescendant(snapshot.engines[0].pid, snapshot.apps[0].pid, snapshot.processes), true, 'Desktop must own the external CLI child');
    const listeners = snapshot.listeners.filter(row => row.port === 47831);
    if (!listeners.length) return false;
    assert.equal(listeners.length, 1); assert.equal(listeners[0].loopback, true);
    assert.deepEqual(listeners[0].pids, [snapshot.engines[0].pid]);
    return snapshot;
  }, 'installed Desktop owns pinned CLI and loopback listener');
}
async function start() {
  const value = await request('POST', '/session', { capabilities: { alwaysMatch: { 'tauri:options': { application: expected.app } } } });
  session = value.sessionId; assert.ok(session);
  report.sessions ??= []; report.sessions.push(value.capabilities); save('result', report);
  await command('POST', '/timeouts', { implicit: 0, pageLoad: 180000, script: 180000 });
  await until(() => execute('return document.querySelector(".lw-engine")?.textContent === "engine 0.22.0"'), 'real installed engine ready');
  const identity = await command('POST', '/execute/async', { script: `const done=arguments[arguments.length-1];Promise.all(['name','identifier','version'].map(key=>window.__TAURI_INTERNALS__.invoke('plugin:app|'+key))).then(([productName,identifier,version])=>done({productName,identifier,version})).catch(e=>done({error:String(e)}));`, args: [] });
  assert.deepEqual(identity, { productName: 'Phonton', identifier: 'dev.phonton.desktop', version: '0.4.0-beta.1' });
  record('installed native app and engine identities', { identity, processes: await ownedEngine() });
}
async function closeNormally(label) {
  const before = await ownedEngine();
  const owned = before.processes.filter(row => row.pid === before.apps[0].pid || isDescendant(row.pid, before.apps[0].pid, before.processes));
  const windows = execFileSync('wmctrl', ['-lp'], { encoding: 'utf8' }).split('\n').map(line => /^(0x[0-9a-f]+)\s+-?\d+\s+(\d+)\s+\S+\s+(.+)$/i.exec(line))
    .filter(row => row && Number(row[2]) === before.apps[0].pid && row[3] === 'Phonton');
  assert.equal(windows.length, 1);
  execFileSync('wmctrl', ['-i', '-c', windows[0][1]]);
  const after = await until(() => {
    const observed = native(); runtimeRetained(observed);
    return !observed.apps.length && !observed.engines.length && !observed.listeners.some(row => row.port === 47831) &&
      !owned.some(prior => observed.inaccessible.includes(prior.pid) || observed.unstable.includes(prior.pid)) &&
      !owned.some(prior => observed.processes.some(current => sameLinuxProcess(prior, current))) ? observed : false;
  }, 'normal close removes owned children and preserves external Ollama', 30000);
  assert.equal(typeof (await request('GET', '/status')).ready, 'boolean');
  record(label, { before, after, owned });
  try { await command('DELETE', ''); } catch (error) { if (!/invalid session id|no such window/i.test(error.message)) throw error; }
  session = undefined;
}
function python(label, expectedExit) {
  const result = spawnSync(CHECK[0], CHECK.slice(1), { cwd: fixture, encoding: 'utf8', timeout: 30000 });
  const output = (result.stdout || '') + (result.stderr || '');
  writeFileSync(path.join(evidence, label + '.log'), output);
  assert.ifError(result.error); assert.equal(result.status, expectedExit, output); assert.match(output, /Ran 3 tests/);
  return { exitCode: result.status, output };
}
const optionalJson = file => existsSync(file) ? read(file) : null;
const pickerState = (requirePlan = false) => settledPickerState({ execute, until }, requirePlan);
async function picker(action, label) {
  const pid = (await ownedEngine()).apps[0].pid;
  const output = path.join(evidence, label + '.json');
  const child = spawn('/usr/bin/python3', ['scripts/linux-acceptance/picker.py', String(pid), action, fixture, output], { stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; child.stdout.on('data', data => { log += data; }); child.stderr.on('data', data => { log += data; });
  let ended = false;
  const completed = new Promise((resolve, reject) => {
    child.once('error', error => { ended = true; reject(error); });
    child.once('exit', (code, signal) => { ended = true; resolve({ code, signal }); });
  });
  completed.catch(() => {});
  const timer = setTimeout(() => { if (!ended) child.kill(); }, 115000);
  try {
    await until(async () => {
      if (ended) { await completed; throw new Error('Native picker ended before readiness'); }
      return existsSync(output.replace(/\.json$/, '.ready.json'));
    }, 'native accessibility helper ready', 20000);
    const ready = read(output.replace(/\.json$/, '.ready.json'));
    assert.equal(ready.ready, true); assert.equal(ready.appPid, pid);
    const [, exit] = await Promise.all([click('.lw-sidebar-project button'), completed]);
    assert.equal(exit.code, 0, log);
    const result = read(output); assert.equal(result.status, 'passed'); assert.equal(result.appPid, pid);
    assert.equal(result.action, action); assert.equal(result.fixture, fixture); assert.equal(result.closed, true);
    assert.equal(result.dialog.pid, pid); assert.equal(result.invokedButton.pid, pid);
    if (action === 'select') assert.equal(result.enteredDirectory, fixture);
    record('native GTK picker ' + action, result);
  } finally {
    clearTimeout(timer);
    if (!ended) { child.kill(); await completed.catch(() => {}); }
    writeFileSync(path.join(evidence, label + '.log'), log);
  }
}

async function operation(kind, action, minutes) {
  const previous = await readRpc('models.operation');
  await action();
  const id = await until(async () => {
    const current = await execute('return sessionStorage.getItem("phonton.models.ownedOperationId")');
    return current && current !== previous.id ? current : false;
  }, kind + ' operation ID');
  const result = await until(async () => {
    const current = await readRpc('models.operation');
    assert.equal(current.id, id); assert.equal(current.kind, kind); assert.equal(current.model, model.model);
    save('operation-' + kind, current); assert.ok(!current.error, current.error);
    return current.running ? false : current;
  }, kind + ' ' + model.model, minutes * 60000);
  record('native UI ' + kind, { id, model: result.model });
}

const profileDirectory = path.join(process.env.XDG_DATA_HOME || path.join(process.env.HOME, '.local/share'), 'dev.phonton.desktop');
function profile() {
  const info = statSync(profileDirectory);
  assert.ok(info.isDirectory());
  return { directory: profileDirectory, device: info.dev, inode: info.ino,
    entries: readdirSync(profileDirectory).sort() };
}

// All product mutations use visible controls. RPC, storage and /proc are read-only observations.
try {
  assert.ok(path.isAbsolute(process.env.PHONTON_LOCAL_STATE));
  assert.ok(!existsSync(fixture), 'Use a fresh disposable fixture');
  mkdirSync(fixture);
  writeFileSync(path.join(fixture, 'port.py'), 'def parse_port(value):\n    return int(value)\n');
  writeFileSync(path.join(fixture, 'test_port.py'), fullFixtureTests);
  execFileSync('git', ['init', '--quiet', fixture]);
  execFileSync('git', ['-C', fixture, 'add', 'port.py', 'test_port.py']);
  const identities = ['port.py', 'test_port.py', '.git/index'].map(file => [file, hash(path.join(fixture, file))]);
  const unchanged = (source = true) => {
    for (const [file, digest] of identities) if (source || file !== 'port.py') assert.equal(hash(path.join(fixture, file)), digest, file + ' changed');
  };
  const runFiles = () => existsSync(path.join(stateDirectory, 'runs')) ? readdirSync(path.join(stateDirectory, 'runs')).sort() : [];
  assert.deepEqual(runFiles(), []);
  record('original fixture fails unchanged independent tests', { sourceHashes: identities, tests: python('baseline', 1) });
  await until(async () => (await request('GET', '/status')).ready, 'WebDriver ready', 30000);
  await start();
  const first = await ownedEngine();
  await screenshot('01-first-launch');
  await type('#local-goal', 'Keep this draft while choosing a repository.');
  const before = await pickerState();
  assert.equal(before.active, null); assert.equal(before.recent, null);
  await picker('cancel', 'picker-01-cancel');
  assert.deepEqual(await pickerState(), before);
  await picker('select', 'picker-02-select');
  await until(() => execute('return localStorage.getItem("phonton.projects.active")===arguments[0]', fixture), 'native chosen repository');
  const chosenFolder = await pickerState();
  assert.equal(chosenFolder.active, fixture); assert.deepEqual(JSON.parse(chosenFolder.recent), [fixture]);
  assert.equal(chosenFolder.goal, before.goal); assert.equal(chosenFolder.plan, null);
  assert.ok(chosenFolder.consent.every(value => value === false));
  unchanged();
  record('native selection preserves draft and fixture without storage injection', chosenFolder);
  await screenshot('picker-03-selected-workbench');

  await type('#local-goal', 'Make parse_port reject non-digit input and ports outside 1 through 65535. Keep valid ports working.');
  if (!(await execute('return document.querySelector(".lw-scope-details").open'))) await click('.lw-scope-details > summary');
  await type('#local-files', 'port.py');
  if (!(await execute('return document.querySelector(".lw-verification").open'))) await click('.lw-verification > summary');
  await type('#local-check', JSON.stringify(CHECK));
  await click('.lw-submit .lw-primary');
  const unconfiguredPlan = await pickerState(true);
  assert.ok(unconfiguredPlan.plan.includes('port.py') && unconfiguredPlan.plan.includes('unittest'));
  assert.equal(await execute('return document.querySelector(".lw-plan-actions .lw-primary").disabled'), true);
  assert.deepEqual(unconfiguredPlan.consent, [false, false]);
  await picker('cancel', 'picker-04-reviewed-plan-cancel');
  assert.deepEqual(await pickerState(true), unconfiguredPlan);
  await screenshot('02-plan-review');
  await interfaceJourney({ command, execute, click, screenshot, record, until });
  assert.deepEqual((await pickerState(true)).consent, [false, false]);
  assert.equal(sameLinuxProcess(first.engines[0], (await ownedEngine()).engines[0]), true);
  unchanged();
  await click('nav[aria-label=Workspace] button[aria-label="Local models"]');
  await until(() => execute('return document.querySelector("#models-title")?.textContent==="Local models"'), 'Local models');
  const initial = await readRpc('models.status'); save('initial-model-status', initial);
  assert.equal(initial.runtime_version, model.runtimeVersion); assert.equal(initial.model_store.status, 'unverified');
  assert.equal(initial.local_only, false); assert.equal(initial.managed_runtime_supported, false);
  assert.equal(initial.active_model, null); assert.deepEqual(initial.models, []);
  assert.ok(initial.hardware.ram_available_bytes >= 6 * 1024 ** 3);
  assert.ok(initial.managed_storage.available_bytes >= 12 * 1024 ** 3);
  await screenshot('03-local-models');
  await click('.model-advanced > summary');
  await type('#custom-model', model.model);
  await operation('install', () => button('Download'), 20);
  const downloaded = await readRpc('models.status');
  assert.equal(downloaded.models.find(row => row.model.name === model.model)?.model.digest, model.digest);
  await until(() => execute('return document.querySelector("#model-context")?.disabled===false'), 'calibration context');
  await click(`#model-context option[value="${model.context}"]`);
  assert.equal(await execute('return document.querySelector("#model-context").value'), String(model.context));
  const rowScope = `//section[@aria-labelledby="installed-title"]//article[contains(concat(' ',normalize-space(@class),' '),' model-row ')][.//h3[normalize-space(.)="${model.model}"]]//`;
  await operation('calibrate', () => button('Calibrate', rowScope), 30);
  await operation('select', () => button('Select model', rowScope), 3);
  const selected = await readRpc('models.status');
  const selectedRow = verifyExternalModel(selected, model);
  save('selected-model-status', selected); runtimeRetained(native());
  await screenshot('full-01-selected-model');
  await button('← Workspace');
  await until(() => execute('return document.querySelector("#local-goal")?.getBoundingClientRect().height>0'), 'visible workbench');
  await button('Review plan again');
  await until(() => execute('return document.querySelector("[aria-label=Plan]")?.textContent.includes(arguments[0]) && [...document.querySelectorAll(".lw-plan-actions button")].some(button=>button.textContent==="Review plan again" && !button.disabled)', selectedRow.profile_sha256), 'fresh calibrated plan replaces unconfigured plan');
  const calibratedPlan = await pickerState(true);
  for (const value of ['port.py', 'unittest', model.model, model.digest.slice(0, 12), selectedRow.profile_sha256]) assert.ok(calibratedPlan.plan.includes(value), value);
  assert.deepEqual(calibratedPlan.consent, [false, false]);
  const host = await element('//label[contains(@class,"lw-approval")][contains(.,"Allow the listed setup")]//input', 'xpath');
  await command('POST', `/element/${host}/click`, {});
  assert.equal(await execute('return document.querySelector(".lw-plan-actions .lw-primary").disabled'), true, 'External context consent must gate goal execution');
  assert.deepEqual(runFiles(), []);
  assert.equal(await execute('return localStorage.getItem("phonton.local.lastRun")'), null);
  record('no repository-context goal before external-runtime consent', { consent: (await pickerState(true)).consent, runDirectories: runFiles(), calibrationAlreadyPerformed: true });
  const externalConsent = await element('//label[contains(@class,"lw-approval")][contains(.,"Allow this unverified loopback runtime")]//input', 'xpath');
  await command('POST', `/element/${externalConsent}/click`, {});
  assert.deepEqual((await pickerState(true)).consent, [true, true]);
  unchanged(); await screenshot('full-02-approved-plan');
  await button('Run local goal →');
  const runId = await until(() => execute('return localStorage.getItem("phonton.local.lastRun")'), 'goal ID');
  assert.match(runId, /^[a-f0-9-]{36}$/);
  const runDirectory = path.join(stateDirectory, 'runs', runId);
  const receiptPath = path.join(runDirectory, 'end.json'), journalPath = path.join(runDirectory, 'apply.json');
  let admitted = false;
  const receipt = await until(async () => {
    const status = await readRpc('local.run.status');
    if (status.id !== runId) {
      assert.equal(admitted, false, 'Admitted goal was replaced');
      const pending = await execute('return {id:localStorage.getItem("phonton.local.lastRun"),error:document.querySelector(".lw-error")?.textContent||null}');
      assert.equal(pending.id, runId); assert.ok(!pending.error, pending.error); return false;
    }
    admitted = true;
    if (status.running) return false;
    assert.ok(!status.error, status.error);
    const saved = await readRpc('local.run.read', { id: runId });
    assert.equal(saved.state, 'review_ready'); assert.deepEqual(optionalJson(receiptPath), saved); return saved;
  }, 'verified local candidate', 12 * 60000);
  assert.equal(receipt.id, runId); assert.equal(receipt.runtime_origin, 'external_unverified');
  assert.equal(receipt.profile.model, model.model); assert.equal(receipt.profile.digest, model.digest);
  assert.equal(receipt.profile.runtime_version, model.runtimeVersion); assert.equal(receipt.profile.context_tokens, model.context);
  assert.equal(receipt.profile.protocol, selectedRow.profile.protocol);
  assert.deepEqual(receipt.request.files, ['port.py']);
  assert.equal(realpathSync(receipt.request.repository), realpathSync(fixture));
  assert.deepEqual(receipt.request.checks, [{ program: CHECK[0], args: CHECK.slice(1) }]);
  assert.equal(receipt.request.approve_host_execution, true); assert.equal(receipt.request.allow_unverified_runtime, true);
  assert.equal(receipt.git_index.status, 'passed'); assert.equal(receipt.git_index.stage, 'final review');
  assert.equal(receipt.baseline_checks.length, 1); assert.equal(receipt.baseline_checks[0].status, 'failed');
  assert.deepEqual(receipt.baseline_checks[0].check, receipt.request.checks[0]);
  const candidate = receipt.candidates.find(item => item.number === receipt.selected_candidate);
  assert.ok(candidate?.diff); assert.match(candidate.content_sha256, /^[a-f0-9]{64}$/);
  assert.equal(candidate.checks.length, 1); assert.equal(candidate.checks[0].status, 'passed');
  assert.equal(candidate.checks[0].exit_code, 0); assert.deepEqual(candidate.checks[0].check, receipt.request.checks[0]);
  unchanged(); save('receipt', receipt);
  const receiptHash = hash(receiptPath);
  await until(() => execute('return !!document.querySelector(".lw-apply .lw-primary:not(:disabled)")'), 'native candidate review');
  assert.match(await execute('return document.querySelector(".lw-telemetry").textContent'), /External runtime · inference location unverified/);
  await screenshot('full-03-verified-candidate');
  record('verified candidate retains honest external-origin receipt and original files', { runId, receiptHash });
  await button('Apply selected changes →');
  const applied = await until(() => optionalJson(journalPath)?.state === 'applied' && read(journalPath), 'durable Apply');
  assert.equal(applied.run_id, runId); assert.equal(applied.candidate_number, candidate.number);
  assert.equal(applied.baseline_sha256, receipt.baseline_sha256);
  assert.equal(applied.candidate_sha256, candidate.content_sha256);
  assert.equal(applied.files.length, 1); assert.equal(applied.files[0].path, 'port.py');
  assert.equal(applied.files[0].before_sha256, identities[0][1]);
  assert.equal(applied.files[0].after_sha256, hash(path.join(fixture, 'port.py')));
  assert.notEqual(hash(path.join(fixture, 'port.py')), identities[0][1]); unchanged(false);
  save('applied-journal', applied); record('Apply passes independent unchanged tests', python('after-apply', 0));
  await screenshot('full-04-applied');
  const origin = await execute('return {href:location.href,origin:location.origin}');
  await closeNormally('normal close removes owned CLI and preserves external Ollama');
  const firstProfile = profile(); save('default-profile-before-reopen', firstProfile);
  await start();
  const restarted = await ownedEngine(); assert.equal(sameLinuxProcess(first.apps[0], restarted.apps[0]), false);
  assert.deepEqual(await execute('return {href:location.href,origin:location.origin}'), origin);
  assert.equal(await execute('return localStorage.getItem("phonton.projects.active")'), fixture);
  assert.equal(await execute('return localStorage.getItem("phonton.local.lastRun")'), runId);
  await until(() => execute('return document.querySelector(".lw-apply h2")?.textContent==="✓ Applied"'), 'retained receipt');
  const retainedModel = verifyExternalModel(await readRpc('models.status'), model);
  assert.equal(retainedModel.profile_sha256, selectedRow.profile_sha256);
  const reopenedProfile = profile(); save('default-profile-after-reopen', reopenedProfile);
  for (const key of ['directory', 'device', 'inode']) assert.equal(reopenedProfile[key], firstProfile[key]);
  assert.equal(hash(receiptPath), receiptHash); assert.equal(read(journalPath).state, 'applied');
  await screenshot('full-05-reopened-receipt');
  record('new native process retains default profile, model and applied receipt', { firstProfile, reopenedProfile, runId, origin });
  await button('Restore original files →');
  const restored = await until(() => optionalJson(journalPath)?.state === 'rolled_back' && read(journalPath), 'durable rollback');
  assert.equal(restored.run_id, runId); assert.equal(restored.candidate_number, candidate.number);
  assert.equal(restored.baseline_sha256, applied.baseline_sha256);
  assert.equal(restored.candidate_sha256, applied.candidate_sha256);
  assert.deepEqual(restored.files, applied.files);
  unchanged(); assert.equal(hash(receiptPath), receiptHash); save('rollback-journal', restored);
  record('rollback restores exact original bytes and expected failing checks', python('after-rollback', 1));
  await until(() => execute('return document.querySelector(".lw-apply h2")?.textContent==="Original files restored"'), 'native restored state');
  await screenshot('full-06-restored');
  await closeNormally('second normal close preserves external runtime');
  report.status = 'passed'; save('result', report);
} catch (error) {
  report.status = 'failed'; report.error = String(error.stack || error);
  try { if (session) await screenshot('failure'); } catch (captureError) { report.screenshotError = String(captureError); }
  try { save('failure-processes', native()); } catch (captureError) { report.processError = String(captureError); }
  save('result', report); throw error;
}
