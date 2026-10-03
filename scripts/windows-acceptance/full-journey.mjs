import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const MODEL = 'qwen2.5-coder:3b';
const DIGEST = 'f72c60cabf6237b07f6e632b2c48d533cef25eda2efbd34bed21c5e9c01e6225';
const CONTEXT = 4096;
const CHECK = ['python', '-m', 'unittest', 'discover'];
export const fullFixtureTests = `import unittest
from port import parse_port

class PortTests(unittest.TestCase):
    def test_valid_ports(self):
        for value in ("1", "8080", "65535"):
            self.assertEqual(parse_port(value), int(value))

    def test_non_digits(self):
        for value in ("+80", " 80", "80 ", "80x", ""):
            with self.subTest(value=value), self.assertRaises(ValueError):
                parse_port(value)

    def test_range(self):
        for value in ("0", "65536"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                parse_port(value)
`;

// All mutations below use the visible application controls. RPC is read-only
// observation of the already ownership-checked installed engine.
export async function fullJourney(api) {
  const { command, execute, click, type, screenshot, hash, record, fixture,
    evidence, identities, start, closeNormally, ownedEngine, native } = api;
  assert.equal(process.env.PHONTON_ACCEPTANCE_FULL_JOURNEY, 'true');
  assert.ok(path.isAbsolute(process.env.PHONTON_LOCAL_STATE));
  const stateDirectory = path.dirname(process.env.PHONTON_LOCAL_STATE);
  const save = (name, value) => writeFileSync(path.join(evidence, `${name}.json`), JSON.stringify(value, null, 2) + '\n');
  const unchanged = (includeSource = true) => {
    for (const [file, digest] of identities) {
      if (includeSource || file !== 'port.py') assert.equal(hash(path.join(fixture, file)), digest, `${file} changed`);
    }
  };
  async function readRpc(method, params = {}) {
    assert.ok(['models.operation', 'models.status', 'local.run.status', 'local.run.read'].includes(method));
    const response = await fetch('http://127.0.0.1:47831/rpc', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: method === 'models.status' ? { context: CONTEXT } : params }),
      signal: AbortSignal.timeout(180000),
    });
    assert.equal(response.status, 200);
    const reply = await response.json();
    assert.ok(!reply.error, JSON.stringify(reply.error));
    return reply.result;
  }
  async function wait(check, description, minutes = 3) {
    const deadline = Date.now() + minutes * 60000;
    let lastProgress = 0;
    while (Date.now() < deadline) {
      const value = await check(); // Terminal errors fail immediately; no retry-until-green.
      if (value) return value;
      if (Date.now() - lastProgress > 30000) {
        console.log(`WAIT ${description}`); lastProgress = Date.now();
      }
      await delay(1000);
    }
    throw new Error(`Timed out: ${description}`);
  }
  async function button(text, scope = '') {
    const xpath = `${scope || '//'}button[normalize-space(.)=${JSON.stringify(text)}]`;
    const id = await wait(async () => {
      try {
        const found = await command('POST', '/element', { using: 'xpath', value: xpath });
        const current = found['element-6066-11e4-a52e-4f735466cecf'];
        return await command('GET', `/element/${current}/enabled`) ? current : false;
      } catch (error) {
        if (/"error":"(?:no such element|stale element reference)"/.test(error.message)) return false;
        throw error;
      }
    }, `${text} present and enabled`);
    await command('POST', `/element/${id}/click`, {});
  }
  async function operation(kind, model, action, minutes) {
    const previous = await readRpc('models.operation');
    await action();
    const id = await wait(async () => {
      const current = await execute('return sessionStorage.getItem("phonton.models.ownedOperationId")');
      return current && current !== previous.id ? current : false;
    }, `${kind} operation ID`);
    assert.notEqual(id, previous.id, 'UI must start a new operation');
    const result = await wait(async () => {
      const current = await readRpc('models.operation');
      assert.equal(current.id, id, 'Model operation was replaced');
      assert.equal(current.kind, kind);
      if (model) assert.equal(current.model, model);
      save(`operation-${kind}`, current);
      assert.ok(!current.error, current.error);
      return current.running ? false : current;
    }, `${kind} ${model || 'managed runtime'}`, minutes);
    record(`native UI ${kind}`, { id, model: result.model });
    return result;
  }
  function python(name, expectedExit) {
    const result = spawnSync(CHECK[0], CHECK.slice(1), { cwd: fixture, encoding: 'utf8', timeout: 30000, windowsHide: true });
    const output = (result.stdout || '') + (result.stderr || '');
    writeFileSync(path.join(evidence, `${name}.log`), output);
    assert.ifError(result.error);
    assert.equal(result.status, expectedExit, output);
    assert.match(output, /Ran 3 tests/);
    return { exitCode: result.status, output };
  }
  function jsonIfPresent(file) {
    try { return JSON.parse(readFileSync(file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }

  record('independent original checks fail', python('full-baseline', 1));
  unchanged();
  const initial = await readRpc('models.status');
  save('full-initial-model-status', initial);
  assert.equal(initial.runtime_version, null, 'Full acceptance requires a fresh runtime');
  assert.equal(initial.active_model, null);
  assert.deepEqual(initial.models, []);
  assert.ok(initial.hardware.ram_available_bytes >= 6 * 1024 ** 3, 'At least 6 GiB free RAM required');
  assert.ok(initial.managed_storage.available_bytes >= 12 * 1024 ** 3, 'At least 12 GiB free disk required');
  assert.equal(initial.managed_storage.source, 'override');
  await operation('setup', null, () => button('Download and start runtime'), 20);
  const setup = await readRpc('models.status');
  assert.equal(setup.model_store.status, 'verified_managed');
  assert.ok(setup.runtime_version);
  save('full-runtime-status', setup);

  await click('.model-advanced > summary');
  await type('#custom-model', MODEL);
  await operation('install', MODEL, () => button('Download'), 20);
  const downloaded = await readRpc('models.status');
  const installed = downloaded.models.find(row => row.model.name === MODEL);
  assert.ok(installed, 'Exact model tag must be installed');
  assert.equal(installed.model.digest, DIGEST, 'Model tag moved; review its new digest before testing');
  await wait(() => execute('return document.querySelector("#model-context")?.disabled === false'), 'calibration context enabled');
  await click(`#model-context option[value="${CONTEXT}"]`);
  assert.equal(await execute('return document.querySelector("#model-context").value'), String(CONTEXT));
  const rowScope = `//article[contains(concat(' ',normalize-space(@class),' '),' model-row ')][.//h3[normalize-space(.)="${MODEL}"]]//`;
  await operation('calibrate', MODEL, () => button('Calibrate', rowScope), 30);
  await operation('select', MODEL, () => button('Select model', rowScope), 3);
  const selected = await readRpc('models.status');
  const selectedRow = selected.models.find(row => row.model.name === MODEL);
  assert.equal(selected.active_model, MODEL);
  assert.equal(selected.model_store.status, 'verified_managed');
  assert.equal(selectedRow.profile.digest, DIGEST);
  assert.equal(selectedRow.profile.context_tokens, CONTEXT);
  assert.ok(selectedRow.profile.protocol);
  assert.match(selectedRow.profile_sha256, /^[a-f0-9]{64}$/);
  save('full-selected-model-status', selected);
  const runtime = native();
  const daemon = runtime.runtimes.find(p => p.ProcessId === selected.model_store.pid);
  assert.ok(daemon, 'Managed daemon must be in the isolated runtime directory');
  assert.equal(daemon.ParentProcessId, runtime.engines[0].ProcessId);
  for (const child of runtime.runtimes) {
    assert.ok(child.ProcessId === daemon.ProcessId || runtime.runtimes.some(p => p.ProcessId === child.ParentProcessId), 'Runtime subprocess must belong to managed daemon tree');
  }
  assert.equal(runtime.runtimeListeners.length, 1);
  assert.equal(runtime.runtimeListeners[0].LocalAddress, '127.0.0.1');
  assert.equal(runtime.runtimeListeners[0].OwningProcess, selected.model_store.pid);
  await screenshot('full-01-selected-model');
  record('managed model identity and runtime ownership', { model: MODEL, digest: DIGEST, profileSha256: selectedRow.profile_sha256, runtime });

  await button('← Workspace');
  await wait(() => execute('return !!document.querySelector("#local-goal")'), 'workbench restored');
  await type('#local-goal', 'Make parse_port reject non-digit input and ports outside 1 through 65535. Keep valid ports working.');
  if (!(await execute('return document.querySelector(".lw-scope-details").open'))) await click('.lw-scope-details > summary');
  await type('#local-files', 'port.py');
  if (!(await execute('return document.querySelector(".lw-verification").open'))) await click('.lw-verification > summary');
  await type('#local-check', JSON.stringify(CHECK));
  assert.equal(await execute('return document.querySelectorAll(".lw-approval input").length'), 1, 'Unverified-runtime consent must not appear');
  assert.equal(await execute('return document.querySelector(".lw-approval input").checked'), false);
  await click('.lw-submit .lw-primary');
  await wait(() => execute('return !!document.querySelector("[aria-label=Plan]")'), 'fresh calibrated plan');
  const planText = await execute('return document.querySelector("[aria-label=Plan]").textContent');
  for (const value of ['port.py', 'unittest', MODEL, DIGEST.slice(0, 12), selectedRow.profile_sha256]) assert.ok(planText.includes(value), `Missing plan evidence: ${value}`);
  assert.equal(await execute('return document.querySelector(".lw-approval input").checked'), false, 'Fresh plan must require fresh host approval');
  await click('.lw-approval input');
  assert.equal(await execute('return document.querySelector(".lw-approval input").checked'), true);
  unchanged();
  await screenshot('full-02-approved-plan');
  await click('.lw-plan-actions .lw-primary');
  const runId = await wait(() => execute('return localStorage.getItem("phonton.local.lastRun")'), 'new run ID');
  assert.match(runId, /^[a-f0-9-]{36}$/);
  const runDirectory = path.join(stateDirectory, 'runs', runId);
  const receiptPath = path.join(runDirectory, 'end.json');
  const journalPath = path.join(runDirectory, 'apply.json');
  let admitted = false;
  const receipt = await wait(async () => {
    const status = await readRpc('local.run.status');
    if (status.id !== runId) {
      assert.equal(admitted, false, 'Admitted goal was replaced');
      const pending = await execute('return {id:localStorage.getItem("phonton.local.lastRun"),error:document.querySelector(".lw-error")?.textContent || null}');
      assert.equal(pending.id, runId, 'Native start rejected the requested goal');
      assert.ok(!pending.error, pending.error);
      return false;
    }
    admitted = true;
    if (status.running) return false;
    assert.ok(!status.error, status.error);
    const saved = await readRpc('local.run.read', { id: runId });
    assert.equal(saved.state, 'review_ready', `Goal ended without verified candidate: ${saved.state}`);
    const durable = jsonIfPresent(receiptPath);
    assert.deepEqual(durable, saved, 'Saved completion must match engine readback');
    return saved;
  }, 'verified local goal receipt', 12);
  assert.equal(receipt.id, runId);
  assert.equal(receipt.runtime_origin, 'managed_verified');
  assert.equal(receipt.profile.model, MODEL);
  assert.equal(receipt.profile.digest, DIGEST);
  assert.equal(receipt.profile.runtime_version, selected.runtime_version);
  assert.equal(receipt.profile.protocol, selectedRow.profile.protocol);
  assert.equal(receipt.profile.context_tokens, CONTEXT);
  assert.deepEqual(receipt.request.files, ['port.py']);
  assert.deepEqual(receipt.request.checks, [{ program: CHECK[0], args: CHECK.slice(1) }]);
  assert.equal(receipt.request.approve_host_execution, true);
  assert.equal(receipt.request.allow_unverified_runtime, false);
  assert.equal(receipt.git_index.status, 'passed');
  assert.equal(receipt.git_index.stage, 'final review');
  assert.equal(receipt.baseline_checks.length, 1);
  assert.equal(receipt.baseline_checks[0].status, 'failed');
  assert.deepEqual(receipt.baseline_checks[0].check, receipt.request.checks[0]);
  const chosen = receipt.candidates.find(c => c.number === receipt.selected_candidate);
  assert.ok(chosen?.diff);
  assert.match(chosen.content_sha256, /^[a-f0-9]{64}$/);
  assert.equal(chosen.checks.length, 1);
  assert.equal(chosen.checks[0].status, 'passed');
  assert.equal(chosen.checks[0].exit_code, 0);
  assert.deepEqual(chosen.checks[0].check, receipt.request.checks[0]);
  unchanged();
  save('full-receipt', receipt);
  const receiptHash = hash(receiptPath);
  await wait(() => execute('return !!document.querySelector(".lw-apply .lw-primary:not(:disabled)")'), 'verified candidate in native review');
  await screenshot('full-03-verified-candidate');
  record('verified candidate preserves original source and staging', { runId, receiptHash });

  await button('Apply selected changes →');
  const applied = await wait(() => { const v = jsonIfPresent(journalPath); return v?.state === 'applied' ? v : false; }, 'Apply journal');
  assert.equal(applied.run_id, runId);
  assert.equal(applied.candidate_number, chosen.number);
  assert.notEqual(hash(path.join(fixture, 'port.py')), identities.find(([file]) => file === 'port.py')[1]);
  unchanged(false);
  record('native Apply passes independent checks', python('full-after-apply', 0));
  save('full-applied-journal', applied);
  await screenshot('full-04-applied');
  await closeNormally('full journey normal close releases engine and managed runtime');

  await start();
  await ownedEngine();
  assert.equal(await execute('return localStorage.getItem("phonton.local.lastRun")'), runId);
  await wait(() => execute('return document.querySelector(".lw-apply h2")?.textContent === "✓ Applied"'), 'saved applied receipt in new native process');
  assert.equal(hash(receiptPath), receiptHash);
  assert.equal(jsonIfPresent(journalPath).state, 'applied');
  await screenshot('full-05-reopened-receipt');
  record('new installed app process reopens same applied receipt', { runId });
  await button('Restore original files →');
  const rolledBack = await wait(() => { const v = jsonIfPresent(journalPath); return v?.state === 'rolled_back' ? v : false; }, 'rollback journal');
  assert.equal(rolledBack.run_id, runId);
  assert.equal(rolledBack.candidate_number, chosen.number);
  unchanged();
  assert.equal(hash(receiptPath), receiptHash);
  record('native rollback restores exact original bytes and failing checks', python('full-after-rollback', 1));
  save('full-rollback-journal', rolledBack);
  await wait(() => execute('return document.querySelector(".lw-apply h2")?.textContent === "Original files restored"'), 'restored state in native UI');
  await screenshot('full-06-restored');
  await closeNormally('full journey restarted app closes cleanly');
}
