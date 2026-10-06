import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { setTimeout as delay } from 'node:timers/promises';
import { assertSameProcess, parseProcessIdentity } from './process-identity.mjs';
import { interfaceProbe } from './interface-probe.mjs';
import { fullMacJourney } from './full-journey.mjs';
import { requireExternalRuntime } from './external-runtime.mjs';
assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
assert.equal(process.env.GITHUB_ACTIONS, 'true'); assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const installed = read('acceptance-evidence/install.json');
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const temporary = realpathSync(process.env.RUNNER_TEMP);
const evidence = path.resolve('acceptance-evidence');
const save = (name, value) => writeFileSync(path.join(evidence, name + '.json'), JSON.stringify(value, null, 2) + '\n');
const output = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', timeout: 30000 }).trim();
const report = { schema: 1, status: 'running', harnessCommit: process.env.GITHUB_SHA,
  candidateCommit: installed.candidateCommit, scope: 'ARM64 DMG launch, native draft/settings/theme controls, picker Cancel, path/control observation and normal Quit; not folder Select, model/coding/Apply, retained-profile or public-beta acceptance', checks: [] };
report.fullJourney = process.env.PHONTON_MACOS_FULL_JOURNEY === 'true';
if (report.fullJourney) report.scope = 'ARM64 native DMG, external Ollama and one existing-file fixture: native download/calibrate/select/consent/goal/Apply/default-profile Quit+reopen/rollback. No trusted publisher, Intel or public updater proof.';
const external = report.fullJourney ? read('acceptance-evidence/external-runtime.json') : null;
const record = (name, detail) => { report.checks.push({ name, detail }); save('probe-result', report); };
const identityHelper = path.join(temporary, 'phonton-process-identity');
const selectors = vm.createContext({});
// Host-side validation of observed AX data; never runs code in the application.
vm.runInContext(readFileSync('scripts/macos-acceptance/accessibility.js', 'utf8'), selectors);
const trackedPids = new Set();
const nativeIdentity = pid => parseProcessIdentity(spawnSync(identityHelper, [String(pid)], { encoding: 'utf8', timeout: 10000 }), pid);
function snapshot() {
  const raw = output('/bin/ps', ['-ww', '-axo', 'pid=,ppid=,lstart=,comm=']);
  const processes = raw.split('\n').map(line => {
    const match = /^\s*(\d+)\s+(\d+)\s+(.{24})\s+(.+)$/.exec(line); assert.ok(match, 'Unparsed process row');
    return { pid: Number(match[1]), ppid: Number(match[2]), started: match[3], comm: match[4] };
  });
  const sockets = spawnSync('/usr/sbin/lsof', ['-nP', '-iTCP:47831', '-sTCP:LISTEN', '-Fpn'], { encoding: 'utf8', timeout: 15000 });
  assert.ifError(sockets.error); assert.ok([0, 1].includes(sockets.status));
  const listeners = []; let pid;
  for (const line of sockets.stdout.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1));
    if (line.startsWith('n')) listeners.push({ pid, address: line.slice(1) });
  }
  // ps comm may be just "phonton". It selects candidates but never proves identity.
  const candidates = new Set(processes.filter(p => ['phonton', 'phonton-desktop'].includes(path.posix.basename(p.comm)) || trackedPids.has(p.pid)).map(p => p.pid));
  for (const listener of listeners) candidates.add(listener.pid);
  for (const row of processes) {
    if (!candidates.has(row.pid)) continue;
    row.native = nativeIdentity(row.pid);
    if (row.native.status === 'present') { row.ppid = row.native.ppid; row.exe = row.native.exe; }
  }
  return { processes, listeners, apps: processes.filter(p => p.exe === installed.binary), engines: processes.filter(p => p.exe === installed.engine) };
}
function descendants(rootPid, processes) {
  const ids = new Set([rootPid]); let changed = true;
  while (changed) { changed = false; for (const row of processes) if (ids.has(row.ppid) && !ids.has(row.pid)) { ids.add(row.pid); changed = true; } }
  return processes.filter(row => ids.has(row.pid));
}
async function until(check, label, timeout = 60000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await check(); if (value) return value; await delay(500); }
  throw new Error('Timed out: ' + label);
}
let accessibilityCalls = 0;
function accessibility(pid, mode, request) {
  const label = `ax-invocation-${String(++accessibilityCalls).padStart(3, '0')}`;
  const started = Date.now();
  const result = spawnSync('/usr/bin/osascript', ['-l', 'JavaScript', 'scripts/macos-acceptance/accessibility.js', String(pid), mode, ...(request ? [JSON.stringify(request)] : [])],
    { encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 ** 2 });
  // Preserve partial operation progress even if the native bridge times out.
  writeFileSync(path.join(evidence, label + '.stdout.log'), result.stdout || '', { flag: 'wx' });
  writeFileSync(path.join(evidence, label + '.stderr.log'), result.stderr || '', { flag: 'wx' });
  save(label, { pid, mode, scope: request?.scope || 'application', elapsedMs: Date.now() - started,
    status: result.status, signal: result.signal, error: result.error ? String(result.error) : null });
  assert.ifError(result.error); assert.equal(result.status, 0, 'Native accessibility command failed: ' + label);
  return JSON.parse(result.stdout);
}
try {
  assert.equal(hash(installed.binary), installed.desktopSha256); assert.equal(hash(installed.engine), installed.engineSha256);
  const before = snapshot(); assert.equal(before.apps.length, 0); assert.equal(before.engines.length, 0); assert.equal(before.listeners.length, 0);
  // Reject a pre-existing app with a different install path too.
  assert.ok(!before.processes.some(row => ['phonton-desktop', 'phonton'].includes(path.posix.basename(row.comm))));
  const appData = path.join(process.env.HOME, 'Library', 'Application Support', 'dev.phonton.desktop');
  const webkitRoot = path.join(process.env.HOME, 'Library', 'WebKit', 'dev.phonton.desktop');
  const webkitData = path.join(webkitRoot, 'WebsiteData');
  assert.equal(existsSync(appData), false, 'Do not reuse existing app data');
  assert.equal(existsSync(webkitRoot), false, 'Do not reuse existing WebKit data');
  const state = path.join(temporary, 'phonton-macos-probe-state'); assert.equal(existsSync(state), false); mkdirSync(state);
  const configPath = path.join(state, 'config.toml'), localState = path.join(state, 'local-models.json');
  const launchPath = path.dirname(installed.engine) + ':' + process.env.PATH;
  const help = spawnSync('/usr/bin/open', ['-h'], { encoding: 'utf8', timeout: 10000 });
  assert.ifError(help.error); assert.match(help.stdout + help.stderr, /--env/);
  writeFileSync(path.join(evidence, 'open-help.log'), help.stdout + help.stderr);
  record('no prior app data, WebKit root or app/engine listener', { before, appData, webkitRoot, webkitData, configPath, localState,
    limitation: 'Expected Cocoa default paths only; actual data location and retained-profile behavior are not established by this initial probe' });
  async function launchSession() {
  if (external) requireExternalRuntime(external);
  output('/usr/bin/open', ['-n', '--env', 'PATH=' + launchPath, '--env', 'PHONTON_CONFIG_PATH=' + configPath,
    '--env', 'PHONTON_LOCAL_STATE=' + localState, installed.app]);
  const started = await until(() => {
    const value = snapshot(); assert.ok(value.apps.length <= 1 && value.engines.length <= 1);
    if (!value.apps.length || !value.engines.length || !value.listeners.length) return false;
    const owned = descendants(value.apps[0].pid, value.processes);
    assert.ok(owned.some(row => row.pid === value.engines[0].pid), 'CLI must descend from actual app');
    assert.ok(value.listeners.every(row => row.pid === value.engines[0].pid && row.address === '127.0.0.1:47831'));
    return value;
  }, 'native installed bundle and owned external CLI', 120000);
  for (const row of [...started.apps, ...started.engines]) {
    trackedPids.add(row.pid);
    assertSameProcess(row.native, nativeIdentity(row.pid));
    const rawMapped = output('/usr/sbin/lsof', ['-a', '-p', String(row.pid), '-d', 'txt', '-Fn']);
    writeFileSync(path.join(evidence, `mapped-executable-${row.pid}.log`), rawMapped + '\n');
    const mapped = rawMapped.split('\n');
    assert.ok(mapped.includes('n' + row.exe), 'Actual mapped executable must match process identity');
  }
  assert.equal(hash(installed.binary), installed.desktopSha256); assert.equal(hash(installed.engine), installed.engineSha256);
  for (const row of [...started.apps, ...started.engines]) assertSameProcess(row.native, nativeIdentity(row.pid));
  record('actual native app owns the separately installed exact CLI', started);
  const response = await fetch('http://127.0.0.1:47831/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'config.get', params: {} }), signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200); const configuration = await response.json(); assert.ok(!configuration.error);
  assert.equal(configuration.result.path, configPath); save('configuration', configuration.result);
  return started;
  }
  let started = await launchSession();
  const tree = accessibility(started.apps[0].pid, 'inspect'); save('accessibility', tree);
  assert.equal(tree.pid, started.apps[0].pid); assert.equal(tree.frontmost, true); assert.ok(tree.rows.length > 0);
  output('/usr/sbin/screencapture', ['-x', '-t', 'png', path.join(evidence, '01-native-macos.png')]);
  assert.equal(readFileSync(path.join(evidence, '01-native-macos.png')).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  record('native accessibility tree and original screen captured', { pid: tree.pid, rows: tree.rows.length,
    storagePaths: { appData: { path: appData, exists: existsSync(appData) }, webkitRoot: { path: webkitRoot, exists: existsSync(webkitRoot) }, webkitData: { path: webkitData, exists: existsSync(webkitData) } } });
  let nativeActions = 0;
  const inspect = scope => {
    assertSameProcess(started.apps[0].native, nativeIdentity(started.apps[0].pid));
    const observed = accessibility(started.apps[0].pid, 'inspect', scope ? { scope } : undefined);
    assert.equal(observed.pid, started.apps[0].pid); assert.equal(observed.frontmost, true);
    assertSameProcess(started.apps[0].native, nativeIdentity(started.apps[0].pid));
    return observed;
  };
  const nativeApi = { inspect, save, record, until,
    verifyOwnership: () => {
      for (const row of [...started.apps, ...started.engines]) assertSameProcess(row.native, nativeIdentity(row.pid));
      const observed = snapshot();
      assert.equal(observed.apps.length, 1); assert.equal(observed.engines.length, 1);
      assert.equal(observed.apps[0].pid, started.apps[0].pid); assert.equal(observed.engines[0].pid, started.engines[0].pid);
      assert.ok(observed.listeners.length > 0 && observed.listeners.every(row => row.pid === started.engines[0].pid && row.address === '127.0.0.1:47831'));
      return observed;
    },
    ready: (tree, selector, mode) => {
      try { selectors.axSelect(tree.rows, selector, mode); return true; }
      catch (error) {
        if (/^(Expected one visible native match, got 0|Native control is disabled or unknown)$/.test(error.message)) return false;
        throw error;
      }
    },
    folderPathReady: (tree, fixture, mode) => {
      try { selectors.axFolderPath(tree.rows, { scope: 'modal', path: fixture }, mode); return true; }
      catch (error) {
        if (/^(Expected one focused native Go to Folder path field, got 0|Native path field is not editable|Native path must match exactly before confirm)$/.test(error.message)) return false;
        throw error;
      }
    },
    action: (mode, request) => {
      assertSameProcess(started.apps[0].native, nativeIdentity(started.apps[0].pid));
      const result = accessibility(started.apps[0].pid, mode, request);
      save(`native-action-${String(++nativeActions).padStart(2, '0')}`, result);
      assertSameProcess(started.apps[0].native, nativeIdentity(started.apps[0].pid));
      return result;
    },
    capture: label => output('/usr/sbin/screencapture', ['-x', '-t', 'png', path.join(evidence, label + '.png')]),
  };
  await interfaceProbe(nativeApi);
  async function closeSession(label) {
  const owned = descendants(started.apps[0].pid, snapshot().processes);
  for (const row of owned) {
    trackedPids.add(row.pid);
    const observed = nativeIdentity(row.pid);
    assert.equal(observed.status, 'present', 'Cannot establish owned process lifetime before Quit');
    if (row.native) assertSameProcess(row.native, observed);
    row.native = observed;
  }
  for (const row of [...started.apps, ...started.engines]) assertSameProcess(row.native, nativeIdentity(row.pid));
  const quit = accessibility(started.apps[0].pid, 'quit'); record('normal native Command-Q requested', quit);
  const closed = await until(() => {
    const value = snapshot();
    // Conservatively reject even reused old PIDs; never treat an exec change as exit.
    return !value.apps.length && !value.engines.length && !value.listeners.length &&
      !value.processes.some(row => owned.some(prior => row.pid === prior.pid)) &&
      !value.processes.some(row => ['phonton-desktop', 'phonton'].includes(path.posix.basename(row.comm))) ? value : false;
  }, 'normal Quit removes app and owned CLI before harness teardown', 30000);
  const runtime = external ? requireExternalRuntime(external) : undefined;
  record(label, { owned, closed, ...(runtime ? { externalRuntime: runtime } : {}) });
  }
  if (report.fullJourney) {
    await fullMacJourney({ ...nativeApi, temporary, evidence, stateDirectory: state, webkitData, external,
      closeNormally: () => closeSession('first normal Quit removes owned processes and retains external runtime'),
      reopen: async () => {
        const previous = started.apps[0].native;
        started = await launchSession();
        assert.notEqual(started.apps[0].pid, previous.pid, 'Reopen must create a new native application');
        return { previous, restarted: started.apps[0].native };
      },
    });
    report.fullJourneyCompleted = true;
  }
  await closeSession('normal native Quit removes owned processes and listener');
  report.status = 'passed'; save('probe-result', report);
} catch (error) {
  report.status = 'failed'; report.error = String(error.stack || error);
  try {
    const apps = snapshot().apps;
    if (apps.length === 1) save('failure-accessibility', accessibility(apps[0].pid, 'inspect'));
  } catch (captureError) { report.accessibilityError = String(captureError); }
  try { save('failure-processes', snapshot()); } catch (captureError) { report.processError = String(captureError); }
  try { output('/usr/sbin/screencapture', ['-x', '-t', 'png', path.join(evidence, 'failure.png')]); } catch (captureError) { report.captureError = String(captureError); }
  save('probe-result', report); throw error;
}
// No force-kill or permission repair: disposable runner cleanup follows preserved evidence.
