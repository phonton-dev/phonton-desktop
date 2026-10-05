import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export function runtimeObservationResolved(sample, backend) {
  if (sample.visibility !== 'visible' || !sample.workbenchVisible) return false;
  if (backend.model_store?.goal_run_blocked ?? (backend.endpoint === 'http://127.0.0.1:11434' && backend.model_store?.recovery_required)) return sample.footer.startsWith('Managed runtime recovery required');
  if (backend.runtime_error || !backend.runtime_version) return sample.footer.startsWith('Local model runtime unavailable');
  if (backend.model_store?.status !== 'verified_managed') return sample.footer.startsWith('Loopback runtime connected');
  const selected = backend.models?.find(row => row.model.name === backend.active_model && row.profile?.protocol);
  return sample.footer.startsWith('Managed runtime connected') && (!selected || sample.machine.includes(backend.active_model));
}

export async function observeRuntime(label, { execute, evidence, record, screenshot }) {
  const response = await fetch('http://127.0.0.1:47831/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'models.status', params: { context: null } }), signal: AbortSignal.timeout(30000) });
  const rpc = await response.json();
  assert.ok(response.ok && !rpc.error && rpc.result, 'Runtime observation needs backend status');
  const trace = { schema: 1, label, backend: rpc.result, samples: [], status: 'observing' };
  const save = () => writeFileSync(path.join(evidence, `runtime-${label}.json`), JSON.stringify(trace, null, 2) + '\n');
  const started = Date.now();
  let consecutive = 0;
  for (const at of [0, 1000, 5000, 20000, 45000, 65000]) {
    await delay(Math.max(0, at - (Date.now() - started)));
    const sample = await execute(`const root=document.querySelector('.local-workbench');const bounds=root?.getBoundingClientRect();return {
      visibility:document.visibilityState, focused:document.hasFocus(), workbenchVisible:!!(root && bounds.width && bounds.height && !root.closest('[hidden]') && getComputedStyle(root).display !== 'none'),
      footer:document.querySelector('.lw-footer')?.textContent ?? '', machine:document.querySelector('.lw-sidebar-machine summary')?.textContent ?? '',
      context:document.querySelector('.lw-context')?.textContent ?? '', composer:document.querySelector('.lw-compose-footer button')?.textContent ?? null,
      errors:[...document.querySelectorAll('.lw-error,[role=alert]')].map(node=>node.textContent)
    }`);
    sample.elapsedMs = Date.now() - started;
    sample.resolved = runtimeObservationResolved(sample, trace.backend);
    trace.samples.push(sample); save();
    consecutive = sample.resolved ? consecutive + 1 : 0;
    if (consecutive >= 2) break;
  }
  trace.status = consecutive >= 2 ? 'settled' : trace.samples.every(sample => sample.visibility === 'hidden') ? 'hidden-inconclusive' : 'unresolved';
  save();
  await screenshot(`runtime-${label}`);
  assert.equal(trace.status, 'settled', `Runtime labels did not settle at ${label}; retain visibility and timing evidence before diagnosing`);
  record(`runtime presentation settles after ${label}`, { elapsedMs: trace.samples.at(-1).elapsedMs, initial: trace.samples[0], final: trace.samples.at(-1) });
}
