import assert from 'node:assert/strict';
import path from 'node:path';
import { observeRuntime } from './runtime-observation.mjs';

export const recoveredSelectionScript = 'const rows=[...document.querySelectorAll(".model-row[data-selected=true]")];return rows.length===1 && rows[0].querySelector("h3")?.textContent===arguments[0] && rows[0].querySelector(".model-selected")?.textContent.trim()==="✓ SELECTED"';

// A closed <details> can retain layout rectangles for its unrendered content.
// Ask the browser about rendering, then independently check viewport clipping.
// Missing checkVisibility is a harness incompatibility, never a hidden-text pass.
export const recoveryPanelScript = `
  const panel=document.querySelector('.runtime-recovery');
  const details=panel?.querySelector('details');
  const reason=details?.querySelector('p');
  if (!reason || typeof reason.checkVisibility !== 'function') throw new Error('Recovery diagnostic requires browser checkVisibility');
  const visible=reason.checkVisibility({visibilityProperty:true,opacityProperty:true});
  const box=panel.getBoundingClientRect();
  const r=reason.getBoundingClientRect();
  const clip=reason.closest('.model-content')?.getBoundingClientRect();
  return {
    title:panel.querySelector('h3')?.textContent,description:panel.querySelector('.runtime-recovery-description')?.textContent,
    open:details.open,reason:reason.textContent,reasonVisible:visible,reasonRect:r.toJSON(),
    reasonInView:visible&&r.width>0&&r.height>0&&r.top>=Math.max(0,clip?.top??0)-1&&r.bottom<=Math.min(innerHeight,clip?.bottom??innerHeight)+1&&r.left>=Math.max(0,clip?.left??0)-1&&r.right<=Math.min(innerWidth,clip?.right??innerWidth)+1,
    width:innerWidth,panelFits:box.left>=0&&box.right<=innerWidth+1,scrollWidth:document.documentElement.scrollWidth
  }`;

export function validateRecoveredModel(previous, current) {
  assert.equal(current.endpoint, previous.endpoint);
  assert.equal(current.runtime_version, previous.runtime_version);
  assert.ok(current.runtime_version && !current.runtime_error);
  assert.equal(current.model_store.status, 'verified_managed');
  assert.equal(current.model_store.goal_run_blocked, false);
  assert.ok(!current.model_store.recovery_required);
  assert.ok(Number.isInteger(current.model_store.pid) && current.model_store.pid > 0);
  assert.equal(current.active_model, previous.active_model);
  for (const field of ['root', 'models_path', 'runs_path', 'source']) {
    assert.equal(current.managed_storage[field], previous.managed_storage[field], `Recovery changed ${field}`);
  }
  const before = previous.models.filter(row => row.model.name === previous.active_model);
  const after = current.models.filter(row => row.model.name === previous.active_model);
  assert.equal(before.length, 1);
  assert.equal(after.length, 1);
  assert.equal(after[0].model.digest, before[0].model.digest);
  assert.deepEqual(after[0].profile, before[0].profile, 'Recovery must reuse the measured profile');
  assert.equal(after[0].profile_sha256, before[0].profile_sha256);
  assert.ok(after[0].profile.protocol);
  return after[0];
}

// Called after the first app closes normally, a new process reopens its receipt,
// and rollback restores the fixture. All mutations use visible UI controls.
export async function recoveryJourney(api) {
  const { command, execute, click, type, screenshot, hash, record, fixture, evidence,
    readRpc, wait, button, unchanged, python, jsonIfPresent, save, stateDirectory,
    selected, runId: firstId, receiptPath: firstReceipt, receiptHash: firstReceiptHash,
    journalPath: firstJournal, native } = api;
  const firstJournalHash = hash(firstJournal);
  const preserveFirst = () => {
    assert.equal(hash(firstReceipt), firstReceiptHash, 'First receipt changed during recovery');
    assert.equal(hash(firstJournal), firstJournalHash, 'First rollback journal changed during second goal');
  };
  const before = await readRpc('models.status');
  save('recovery-before-status', before);
  assert.equal(before.runtime_version, null);
  assert.equal(before.active_model, selected.active_model);
  assert.equal(before.model_store.recovery_required, true);
  assert.equal(before.model_store.goal_run_blocked, true);
  assert.equal(before.model_store.setup_retryable, true);
  const beforeProcesses = native();
  assert.equal(beforeProcesses.apps.length, 1);
  assert.equal(beforeProcesses.engines.length, 1);
  assert.deepEqual(beforeProcesses.runtimes, []);
  assert.deepEqual(beforeProcesses.runtimeListeners, []);
  unchanged(); preserveFirst();

  await click('nav[aria-label=Workspace] button[aria-label="Local models"]');
  const action = await wait(() => execute('const buttons=[...document.querySelectorAll("button")].filter(b => ["Start runtime","Retry runtime setup"].includes(b.textContent) && !b.disabled);return buttons.length===1 ? buttons[0].textContent : false'), 'one visible retryable managed runtime action');
  await screenshot('recovery-01-retryable');
  if (process.env.PHONTON_ACCEPTANCE_RECOVERY_PRESENTATION === 'true') {
    assert.equal(action, 'Start runtime', 'New candidate must expose the clear installed-runtime action');
    const readPanel = () => execute(recoveryPanelScript);
    const closed = await readPanel();
    assert.equal(closed.title, 'Start your local runtime');
    assert.equal(closed.open, false); assert.equal(closed.reasonVisible, false);
    assert.equal(closed.reason, before.model_store.reason);
    assert.ok(!closed.description.includes(before.model_store.reason));
    assert.ok(closed.panelFits && closed.scrollWidth <= closed.width + 1);
    await click('.runtime-recovery-details > summary');
    await execute('document.querySelector(".runtime-recovery-details p").scrollIntoView({block:"nearest"});');
    const expanded = await readPanel();
    assert.equal(expanded.open, true); assert.equal(expanded.reasonVisible, true);
    assert.equal(expanded.reasonInView, true);
    assert.equal(expanded.reason, closed.reason);
    await screenshot('recovery-01a-technical-details');
    const rect = await command('GET', '/window/rect');
    let compact;
    try {
      await command('POST', '/window/rect', { width: 580, height: 700 });
      compact = await wait(async () => { const value = await readPanel(); return value.width <= 600 && value.width >= 400 ? value : false; }, 'resized native compact viewport');
      await execute('document.querySelector(".runtime-recovery-details p").scrollIntoView({block:"nearest"});');
      compact = await readPanel();
      assert.ok(compact.width <= 600 && compact.width >= 400, 'Actual compact native viewport required');
      assert.ok(compact.panelFits && compact.scrollWidth <= compact.width + 1);
      assert.equal(compact.open, true); assert.equal(compact.reasonVisible, true);
      assert.equal(compact.reasonInView, true);
      await screenshot('recovery-01b-compact-details');
    } finally { await command('POST', '/window/rect', rect); }
    await wait(async () => Math.abs((await readPanel()).width - closed.width) <= 1, 'restored desktop viewport');
    await click('.runtime-recovery-details > summary');
    const reclosed = await readPanel();
    assert.equal(reclosed.open, false); assert.equal(reclosed.reasonVisible, false);
    record('native recovery presentation keeps diagnostics inspectable at desktop and compact widths', { closed, expanded, compact });
  }
  const priorOperation = await readRpc('models.operation');
  await button(action);
  const operationId = await wait(async () => {
    const id = await execute('return sessionStorage.getItem("phonton.models.ownedOperationId")');
    return id && id !== priorOperation.id ? id : false;
  }, 'new recovery operation ID');
  const operation = await wait(async () => {
    const value = await readRpc('models.operation');
    assert.equal(value.id, operationId);
    assert.equal(value.kind, 'setup');
    save('recovery-setup-operation', value);
    assert.ok(!value.error, value.error);
    return value.running ? false : value;
  }, 'saved managed runtime restart', 5);
  assert.equal(operation.result?.managed_origin, 'started_by_phonton');
  record('native recovery restarts saved managed runtime', { operationId, beforeProcesses });

  const recovered = await readRpc('models.status');
  save('recovery-model-status', recovered);
  const model = validateRecoveredModel(selected, recovered);
  const processes = native();
  assert.equal(processes.apps.length, 1);
  assert.equal(processes.engines.length, 1);
  assert.equal(processes.apps[0].ProcessId, beforeProcesses.apps[0].ProcessId);
  assert.equal(processes.engines[0].ProcessId, beforeProcesses.engines[0].ProcessId);
  const daemon = processes.runtimes.find(row => row.ProcessId === recovered.model_store.pid);
  assert.ok(daemon);
  assert.equal(daemon.ParentProcessId, processes.engines[0].ProcessId);
  for (const child of processes.runtimes) assert.ok(child.ProcessId === daemon.ProcessId || processes.runtimes.some(row => row.ProcessId === child.ParentProcessId));
  assert.equal(processes.runtimeListeners.length, 1);
  assert.equal(processes.runtimeListeners[0].LocalAddress, '127.0.0.1');
  assert.equal(processes.runtimeListeners[0].OwningProcess, daemon.ProcessId);
  unchanged(); preserveFirst();
  await wait(() => execute(recoveredSelectionScript, recovered.active_model), 'retained ready selected model in native UI');
  await screenshot('recovery-02-retained-model');
  record('recovery preserves selected model calibration storage and first receipt', { model: recovered.active_model, digest: model.model.digest, profileSha256: model.profile_sha256, processes, firstId, firstReceiptHash, firstJournalHash });

  await button('← Workspace');
  await wait(() => execute('return !!document.querySelector(".lw-apply")'), 'first restored receipt after recovery');
  await observeRuntime('runtime-recovered', { execute, evidence, record, screenshot });
  await button('New goal');
  await wait(() => execute('return !!document.querySelector("#local-goal")'), 'second goal composer');
  assert.equal(await execute('return localStorage.getItem("phonton.projects.active")'), fixture);
  await type('#local-goal', 'Make parse_port reject non-digit input and ports outside 1 through 65535. Keep valid ports working.');
  if (!(await execute('return document.querySelector(".lw-scope-details").open'))) await click('.lw-scope-details > summary');
  await type('#local-files', 'port.py');
  if (!(await execute('return document.querySelector(".lw-verification").open'))) await click('.lw-verification > summary');
  await type('#local-check', '["python","-m","unittest","discover"]');
  assert.equal(await execute('return document.querySelectorAll(".lw-approval input").length'), 1);
  assert.equal(await execute('return document.querySelector(".lw-approval input").checked'), false);
  await click('.lw-submit .lw-primary');
  await wait(() => execute('return !!document.querySelector("[aria-label=Plan]")'), 'second verified model plan');
  const plan = await execute('return document.querySelector("[aria-label=Plan]").textContent');
  for (const value of ['port.py', 'unittest', recovered.active_model, model.model.digest.slice(0, 12), model.profile_sha256]) assert.ok(plan.includes(value));
  assert.equal(await execute('return document.querySelector(".lw-approval input").checked'), false);
  await click('.lw-approval input');
  unchanged(); preserveFirst();
  await screenshot('recovery-03-second-plan');
  await button('Run local goal →', '//div[contains(concat(" ",normalize-space(@class)," ")," lw-plan-actions ")]//');
  const secondId = await wait(async () => {
    const id = await execute('return localStorage.getItem("phonton.local.lastRun")');
    return id && id !== firstId ? id : false;
  }, 'distinct second coding run');
  assert.match(secondId, /^[a-f0-9-]{36}$/);
  const directory = path.join(stateDirectory, 'runs', secondId);
  const receiptPath = path.join(directory, 'end.json');
  const journalPath = path.join(directory, 'apply.json');
  let admitted = false;
  const receipt = await wait(async () => {
    const status = await readRpc('local.run.status');
    if (status.id !== secondId) {
      assert.equal(admitted, false, 'Second admitted run was replaced');
      const ui = await execute('return {id:localStorage.getItem("phonton.local.lastRun"),error:document.querySelector(".lw-error")?.textContent || null}');
      assert.equal(ui.id, secondId); assert.ok(!ui.error, ui.error);
      return false;
    }
    admitted = true;
    if (status.running) return false;
    assert.ok(!status.error, status.error);
    const value = await readRpc('local.run.read', { id: secondId });
    assert.equal(value.state, 'review_ready');
    assert.deepEqual(value, jsonIfPresent(receiptPath));
    return value;
  }, 'second verified receipt after runtime recovery', 12);
  assert.equal(receipt.id, secondId);
  assert.equal(receipt.runtime_origin, 'managed_verified');
  assert.equal(receipt.profile.model, recovered.active_model);
  assert.equal(receipt.profile.digest, model.model.digest);
  for (const field of ['protocol', 'runtime_version', 'context_tokens']) assert.equal(receipt.profile[field], model.profile[field]);
  assert.deepEqual(receipt.request.files, ['port.py']);
  assert.deepEqual(receipt.request.checks, [{ program: 'python', args: ['-m', 'unittest', 'discover'] }]);
  assert.equal(receipt.request.approve_host_execution, true);
  assert.equal(receipt.request.allow_unverified_runtime, false);
  assert.equal(receipt.git_index.status, 'passed');
  assert.equal(receipt.git_index.stage, 'final review');
  assert.equal(receipt.baseline_checks.length, 1);
  assert.equal(receipt.baseline_checks[0].status, 'failed');
  const chosen = receipt.candidates.find(row => row.number === receipt.selected_candidate);
  assert.ok(chosen?.diff && !chosen.rejection);
  assert.equal(chosen.checks.length, 1);
  assert.equal(chosen.checks[0].status, 'passed');
  assert.equal(chosen.checks[0].exit_code, 0);
  assert.deepEqual(chosen.checks[0].check, receipt.request.checks[0]);
  unchanged(); preserveFirst();
  save('recovery-second-receipt', receipt);
  const receiptHash = hash(receiptPath);
  await wait(() => execute('return !!document.querySelector(".lw-apply .lw-primary:not(:disabled)")'), 'second candidate ready for Apply');
  await screenshot('recovery-04-second-verified');
  record('second recovered session verifies without changing original source', { firstId, secondId, receiptHash });
  await button('Apply selected changes →');
  const applied = await wait(() => { const v = jsonIfPresent(journalPath); return v?.state === 'applied' ? v : false; }, 'second Apply journal');
  assert.equal(applied.run_id, secondId); assert.equal(applied.candidate_number, chosen.number);
  unchanged(false); preserveFirst();
  record('second recovered session Apply passes independent checks', python('recovery-after-apply', 0));
  save('recovery-second-applied-journal', applied);
  await screenshot('recovery-05-second-applied');
  await button('Restore original files →');
  const restored = await wait(() => { const v = jsonIfPresent(journalPath); return v?.state === 'rolled_back' ? v : false; }, 'second rollback journal');
  assert.equal(restored.run_id, secondId); assert.equal(restored.candidate_number, chosen.number);
  unchanged(); preserveFirst();
  assert.equal(hash(receiptPath), receiptHash);
  record('second recovered session rollback preserves both receipts and source', python('recovery-after-rollback', 1));
  save('recovery-second-rollback-journal', restored);
  await wait(() => execute('return document.querySelector(".lw-apply h2")?.textContent === "Original files restored"'), 'second restored state');
  await screenshot('recovery-06-second-restored');
}
