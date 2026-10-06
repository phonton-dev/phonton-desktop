import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fullFixtureTests } from '../windows-acceptance/full-journey.mjs';
import { verifyExternalModel } from '../linux-acceptance/contract.mjs';
import { requireExternalRuntime } from './external-runtime.mjs';

const model = { model: 'qwen2.5-coder:3b', digest: 'f72c60cabf6237b07f6e632b2c48d533cef25eda2efbd34bed21c5e9c01e6225', context: 4096, runtimeVersion: '0.34.2' };
const check = ['python3', '-m', 'unittest', 'discover'];
const goal = 'Make parse_port reject non-digit input and ports outside 1 through 65535. Keep valid ports working.';
const hostConsent = 'Allow the listed setup and check commands to run project code on my machine. Filesystem and network isolation are unavailable.';
const runtimeConsent = 'Allow this unverified loopback runtime to receive repository context. Phonton cannot tell whether it relays that context outside this machine.';
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const read = file => JSON.parse(readFileSync(file, 'utf8'));

/** Product mutations use owned native controls; RPC/files are read-only observations. */
export async function fullMacJourney(api) {
  const { inspect, action, capture, save, record, until, ready, folderPathReady, verifyOwnership, temporary, evidence, stateDirectory, webkitData, external, closeNormally, reopen } = api;
  assert.equal(process.env.PHONTON_MACOS_FULL_JOURNEY, 'true');
  const fixture = path.join(temporary, 'phonton macos acceptance fixture');
  assert.equal(existsSync(fixture), false); mkdirSync(fixture);
  writeFileSync(path.join(fixture, 'port.py'), 'def parse_port(value):\n    return int(value)\n');
  writeFileSync(path.join(fixture, 'test_port.py'), fullFixtureTests);
  execFileSync('git', ['init', '--quiet', fixture]); execFileSync('git', ['-C', fixture, 'add', 'port.py', 'test_port.py']);
  const identities = ['port.py', 'test_port.py', '.git/index'].map(file => [file, hash(path.join(fixture, file))]);
  const unchanged = (includeSource = true) => {
    for (const [file, digest] of identities) if (includeSource || file !== 'port.py') assert.equal(hash(path.join(fixture, file)), digest, file + ' changed');
  };
  const runFiles = () => existsSync(path.join(stateDirectory, 'runs')) ? readdirSync(path.join(stateDirectory, 'runs')).sort() : [];
  const python = (label, expected) => {
    const result = spawnSync(check[0], check.slice(1), { cwd: fixture, encoding: 'utf8', timeout: 30000 });
    const output = (result.stdout || '') + (result.stderr || '');
    writeFileSync(path.join(evidence, label + '.log'), output);
    assert.ifError(result.error); assert.equal(result.status, expected, output); assert.match(output, /Ran 3 tests/);
    if (expected === 1) assert.match(output, /FAILED \(failures=5\)/);
    return { exitCode: result.status, output };
  };
  const observe = (label, scope) => { const tree = inspect(scope); save(label, tree); capture(label); return tree; };
  const values = tree => tree.rows.flatMap(row => [row.AXTitle, row.AXValue, row.AXDescription]).filter(value => typeof value === 'string');
  const field = (tree, role, title) => {
    const rows = tree.rows.filter(row => row.AXRole === role && row.AXTitle === title);
    assert.equal(rows.length, 1, 'Unique native control: ' + title); return rows[0];
  };
  async function reveal(selector, scope) {
    const observed = await until(() => {
      const tree = inspect(scope);
      return ready(tree, selector, 'reveal') ? tree : false;
    }, 'native scroll target ready ' + selector.AXTitle);
    if (selector.AXRole === 'AXButton' && ready(observed, selector, 'press')) return;
    action('reveal', { selector, ...(scope ? { scope } : {}) });
  }
  async function press(title, role = 'AXButton', scope) {
    const selector = { AXRole: role, AXTitle: title };
    if (scope !== 'modal') {
      const tree = inspect();
      if (!ready(tree, selector, 'press')) await reveal(selector);
    }
    await until(() => ready(inspect(scope), selector, 'press'), 'enabled native ' + title, 60000);
    return action('press', { selector, ...(scope ? { scope } : {}) });
  }
  async function type(title, text, role = 'AXTextArea') {
    const selector = { AXRole: role, AXTitle: title };
    const tree = inspect();
    if (!ready(tree, selector, 'type')) await reveal(selector);
    await until(() => ready(inspect(), selector, 'type'), 'editable native ' + title);
    action('type', { selector, text });
    await until(() => field(inspect(), role, title).AXValue === text, 'native text readback ' + title);
  }
  async function expand(title) {
    const selector = { AXRole: 'AXDisclosureTriangle', AXTitle: title };
    const tree = await until(() => {
      const current = inspect();
      return current.rows.some(row => row.AXRole === selector.AXRole && row.AXTitle === title) ? current : false;
    }, 'native disclosure appears ' + title);
    if (field(tree, selector.AXRole, title).AXValue === true) return;
    if (!ready(tree, selector, 'summary-toggle')) await reveal(selector);
    action('summary-toggle', { selector });
    await until(() => field(inspect(), selector.AXRole, title).AXValue === true, 'expanded native ' + title);
  }
  async function rpc(method, params = {}) {
    assert.ok(['models.status', 'models.operation', 'local.run.status', 'local.run.read'].includes(method));
    verifyOwnership(); requireExternalRuntime(external);
    const response = await fetch('http://127.0.0.1:47831/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: method === 'models.status' ? { context: model.context } : params }), signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 200); const result = await response.json(); assert.ok(!result.error, JSON.stringify(result.error)); return result.result;
  }
  async function operation(kind, title, minutes) {
    const previous = await rpc('models.operation');
    await press(title);
    const first = await until(async () => { const current = await rpc('models.operation'); return current.id && current.id !== previous.id ? current : false; }, 'new native ' + kind + ' operation');
    assert.equal(first.kind, kind); assert.equal(first.model, model.model);
    const result = await until(async () => {
      const current = await rpc('models.operation');
      assert.equal(current.id, first.id); assert.equal(current.kind, kind); assert.equal(current.model, model.model);
      save('full-operation-' + kind, current); assert.ok(!current.error, current.error);
      return current.running ? false : current;
    }, 'completed native ' + kind, minutes * 60000);
    record('native UI ' + kind + ' exact pinned model', { id: result.id, kind, model: result.model });
    observe('full-operation-' + kind + '-visible');
    return result;
  }
  assert.deepEqual(runFiles(), []); requireExternalRuntime(external);
  record('Mac original fixture fails unchanged independent tests', { fixture, identities, tests: python('full-baseline', 1) });

  await press('Change folder ↗');
  await until(() => inspect('modal').modalScope.found, 'owned repository chooser');
  action('folder-shortcut', { scope: 'modal', shortcut: 'go-to-folder' });
  await until(() => folderPathReady(inspect('modal'), fixture, 'folder-path-type'), 'focused editable native Go to Folder field');
  observe('full-picker-path-before', 'modal');
  action('folder-path-type', { scope: 'modal', path: fixture });
  await until(() => folderPathReady(inspect('modal'), fixture, 'folder-path-confirm'), 'exact native folder path readback before confirmation');
  const typed = observe('full-picker-path-typed', 'modal');
  assert.equal(typed.rows.filter(row => row.AXRole === 'AXTextField' && row.AXFocused === true && row.AXValue === fixture).length, 1);
  action('folder-path-confirm', { scope: 'modal', path: fixture });
  await until(() => {
    const tree = inspect('modal');
    return tree.rows.filter(row => row.AXRole === 'AXSheet').length === 1 && ready(tree, { AXRole: 'AXButton', AXTitle: 'Open' }, 'press');
  }, 'confirmed native folder and enabled Open');
  observe('full-picker-confirmed', 'modal');
  await press('Open', 'AXButton', 'modal');
  await until(() => !inspect('modal').modalScope.found, 'selected folder closes native chooser');
  await until(() => values(inspect()).includes(fixture), 'native workbench displays exact selected fixture');
  observe('full-01-selected-folder');
  record('native Mac repository chooser selects exact fixture', { fixture });

  await type('Coding goal', goal);
  await expand('Scope · files, new file');
  await type('Files to edit optional — leave blank to discover from the goal', 'port.py', 'AXTextField');
  await expand('Checks & permissions');
  await type('Verification commands optional; one JSON array per line, up to four; blank proposes checks from repository files', JSON.stringify(check));
  await press('Review plan →');
  await until(() => values(inspect()).includes('Run local goal →'), 'native initial reviewed plan');
  const initialPlan = observe('full-02-unconfigured-plan');
  assert.equal(field(initialPlan, 'AXButton', 'Run local goal →').AXEnabled, false);
  for (const title of [hostConsent, runtimeConsent]) assert.equal(field(initialPlan, 'AXCheckBox', title).AXValue, 0);
  unchanged();
  await press('Local models');
  const initial = await rpc('models.status'); save('full-initial-model-status', initial);
  assert.equal(initial.runtime_version, model.runtimeVersion); assert.equal(initial.model_store.status, 'unverified');
  assert.equal(initial.local_only, false); assert.equal(initial.managed_runtime_supported, false);
  assert.equal(initial.active_model, null); assert.deepEqual(initial.models, []);
  await expand('Advanced settings');
  await type('Exact Ollama model tag', model.model, 'AXTextField');
  await operation('install', 'Download', 20);
  const downloaded = await rpc('models.status');
  assert.equal(downloaded.models.find(row => row.model.name === model.model)?.model.digest, model.digest);
  const contextSelector = { AXRole: 'AXPopUpButton', AXTitle: 'Calibration context' };
  await reveal(contextSelector);
  await until(() => ready(inspect(), contextSelector, 'select-context'), 'native calibration context control');
  action('select-context', { selector: contextSelector });
  await until(() => field(inspect(), 'AXPopUpButton', 'Calibration context').AXValue === '4,096 tokens', 'exact4096native context readback');
  observe('full-03-context-selected');
  await operation('calibrate', 'Calibrate ' + model.model, 30);
  await operation('select', 'Select model ' + model.model, 3);
  const selected = await rpc('models.status'); const selectedRow = verifyExternalModel(selected, model);
  save('full-selected-model-status', selected); observe('full-04-selected-model');
  await press('← Workspace');
  await until(() => inspect().rows.some(row => row.AXRole === 'AXButton' && row.AXTitle === 'Review plan →' && row.AXEnabled), 'returned draft requires a fresh review');
  // Local models invalidates the old model-bound plan and both approvals.
  await expand('Scope · files, new file');
  await expand('Checks & permissions');
  const returnedDraft = observe('full-04-returned-draft');
  assert.equal(field(returnedDraft, 'AXTextArea', 'Coding goal').AXValue, goal);
  assert.equal(field(returnedDraft, 'AXTextField', 'Files to edit optional — leave blank to discover from the goal').AXValue, 'port.py');
  assert.equal(field(returnedDraft, 'AXTextArea', 'Verification commands optional; one JSON array per line, up to four; blank proposes checks from repository files').AXValue, JSON.stringify(check));
  assert.ok(values(returnedDraft).includes(fixture));
  assert.ok(!returnedDraft.rows.some(row => row.AXTitle === 'Plan' || row.AXTitle === 'Run local goal →' || row.AXTitle === 'Review plan again'));
  for (const title of [hostConsent, runtimeConsent]) assert.equal(field(returnedDraft, 'AXCheckBox', title).AXValue, 0);
  assert.deepEqual(runFiles(), []); unchanged();
  record('native model setup preserves draft and invalidates old plan and approvals', { fixture, goal, files: 'port.py', checks: check, consent: [false, false] });
  await press('Review plan →');
  await expand('Plan contract & source identity');
  await until(() => values(inspect()).some(value => value.includes(selectedRow.profile_sha256)), 'native reviewed plan binds exact calibrated profile');
  const consentBefore = inspect();
  for (const title of [hostConsent, runtimeConsent]) assert.equal(field(consentBefore, 'AXCheckBox', title).AXValue, 0);
  await press(hostConsent, 'AXCheckBox');
  const hostOnly = inspect();
  assert.equal(field(hostOnly, 'AXCheckBox', hostConsent).AXValue, 1);
  assert.equal(field(hostOnly, 'AXCheckBox', runtimeConsent).AXValue, 0);
  assert.equal(field(hostOnly, 'AXButton', 'Run local goal →').AXEnabled, false);
  assert.deepEqual(runFiles(), []); unchanged();
  record('Mac native external-runtime consent gates repository inference', { runDirectories: [], hostApproved: true, externalApproved: false });
  await press(runtimeConsent, 'AXCheckBox');
  for (const title of [hostConsent, runtimeConsent]) assert.equal(field(inspect(), 'AXCheckBox', title).AXValue, 1);
  observe('full-05-approved-plan');
  const beforeRun = await rpc('local.run.status');
  await press('Run local goal →');
  const admitted = await until(async () => { const status = await rpc('local.run.status'); return status.id && status.id !== beforeRun.id ? status : false; }, 'native goal admitted');
  const runId = admitted.id; assert.match(runId, /^[a-f0-9-]{36}$/);
  const runDirectory = path.join(stateDirectory, 'runs', runId);
  const receiptPath = path.join(runDirectory, 'end.json'), journalPath = path.join(runDirectory, 'apply.json');
  const receipt = await until(async () => {
    const status = await rpc('local.run.status'); assert.equal(status.id, runId); assert.ok(!status.error, status.error);
    if (status.running) return false;
    const saved = await rpc('local.run.read', { id: runId });
    assert.equal(saved.state, 'review_ready'); assert.deepEqual(read(receiptPath), saved); return saved;
  }, 'Mac real model produces verified candidate', 15 * 60000);
  assert.deepEqual(runFiles(), [runId]);
  assert.equal(receipt.id, runId);
  assert.equal(receipt.runtime_origin, 'external_unverified');
  for (const [key, value] of Object.entries({ model: model.model, digest: model.digest, runtime_version: model.runtimeVersion, context_tokens: model.context, protocol: selectedRow.profile.protocol })) assert.equal(receipt.profile[key], value);
  assert.deepEqual(receipt.request.files, ['port.py']); assert.equal(realpathSync(receipt.request.repository), realpathSync(fixture));
  assert.deepEqual(receipt.request.checks, [{ program: check[0], args: check.slice(1) }]);
  assert.equal(receipt.request.approve_host_execution, true); assert.equal(receipt.request.allow_unverified_runtime, true);
  assert.equal(receipt.git_index.status, 'passed'); assert.equal(receipt.git_index.stage, 'final review');
  assert.equal(receipt.baseline_checks.length, 1); assert.equal(receipt.baseline_checks[0].status, 'failed');
  assert.deepEqual(receipt.baseline_checks[0].check, receipt.request.checks[0]);
  const candidate = receipt.candidates.find(row => row.number === receipt.selected_candidate);
  assert.ok(candidate?.diff); assert.match(candidate.content_sha256, /^[a-f0-9]{64}$/);
  assert.equal(candidate.checks.length, 1); assert.equal(candidate.checks[0].status, 'passed');
  assert.equal(candidate.checks[0].exit_code, 0); assert.deepEqual(candidate.checks[0].check, receipt.request.checks[0]);
  unchanged(); save('full-receipt', receipt);
  // Retain the original bytes too; RPC JSON equivalence is a separate check.
  writeFileSync(path.join(evidence, 'full-original-end.json'), readFileSync(receiptPath), { flag: 'wx' });
  const receiptHash = hash(receiptPath);
  await until(() => ready(inspect(), { AXRole: 'AXButton', AXTitle: 'Apply selected changes →' }, 'reveal'), 'native candidate review');
  await reveal({ AXRole: 'AXButton', AXTitle: 'Apply selected changes →' });
  observe('full-06-verified-candidate');
  await expand('Evidence · model, baseline, plan, integrity');
  const visibleReceipt = inspect();
  assert.ok(values(visibleReceipt).includes('Run ' + runId));
  assert.ok(values(visibleReceipt).some(value => value.includes('External runtime · inference location unverified')));
  record('Mac verified candidate preserves original fixture before Apply', { runId, receiptHash, model, profileSha256: selectedRow.profile_sha256 });
  await press('Apply selected changes →');
  const applied = await until(() => existsSync(journalPath) && read(journalPath).state === 'applied' && read(journalPath), 'Mac durable Apply');
  assert.equal(applied.run_id, runId); assert.equal(applied.candidate_number, candidate.number);
  assert.equal(applied.baseline_sha256, receipt.baseline_sha256); assert.equal(applied.candidate_sha256, candidate.content_sha256);
  assert.equal(applied.files.length, 1); assert.equal(applied.files[0].path, 'port.py');
  assert.equal(applied.files[0].before_sha256, identities[0][1]); assert.equal(applied.files[0].after_sha256, hash(path.join(fixture, 'port.py')));
  assert.notEqual(hash(path.join(fixture, 'port.py')), identities[0][1]); unchanged(false);
  save('full-applied-journal', applied); record('Mac Apply passes independent unchanged tests', python('full-after-apply', 0));
  await until(() => values(inspect()).includes('✓ Applied'), 'native Applied receipt'); observe('full-07-applied');
  await closeNormally();
  const profile = () => { const info = statSync(webkitData); assert.ok(info.isDirectory()); assert.equal(realpathSync(webkitData), webkitData); return { directory: webkitData, device: info.dev, inode: info.ino, entries: readdirSync(webkitData).sort() }; };
  const beforeProfile = profile(); save('full-default-profile-before-reopen', beforeProfile);
  const restarted = await reopen();
  await until(() => values(inspect()).includes('✓ Applied'), 'native reopened applied receipt');
  const reopened = inspect();
  assert.ok(values(reopened).includes(fixture), 'Retained selected repository must be visible');
  await expand('Evidence · model, baseline, plan, integrity');
  assert.ok(values(inspect()).includes('Run ' + runId), 'Native reopened receipt must identify the same exact run');
  const retainedModel = verifyExternalModel(await rpc('models.status'), model);
  assert.equal(retainedModel.profile_sha256, selectedRow.profile_sha256);
  const afterProfile = profile(); save('full-default-profile-after-reopen', afterProfile);
  for (const key of ['directory', 'device', 'inode']) assert.equal(afterProfile[key], beforeProfile[key]);
  assert.equal(hash(receiptPath), receiptHash); assert.equal(read(journalPath).state, 'applied');
  observe('full-08-reopened-receipt');
  record('Mac new native process retains default profile, selected model and applied receipt', { restarted, beforeProfile, afterProfile, runId, receiptHash });
  await press('Restore original files →');
  const restored = await until(() => read(journalPath).state === 'rolled_back' && read(journalPath), 'Mac durable rollback');
  for (const key of ['run_id', 'candidate_number', 'baseline_sha256', 'candidate_sha256']) assert.equal(restored[key], applied[key]);
  assert.deepEqual(restored.files, applied.files); unchanged(); assert.equal(hash(receiptPath), receiptHash);
  save('full-rollback-journal', restored); record('Mac rollback restores exact original bytes and expected failures', python('full-after-rollback', 1));
  await until(() => values(inspect()).includes('Original files restored'), 'native rollback status'); observe('full-09-restored');
  requireExternalRuntime(external);
}
