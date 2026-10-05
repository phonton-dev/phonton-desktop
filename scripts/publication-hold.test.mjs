import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertCandidateOnly } from './publication-hold.mjs';

const policy = JSON.parse(readFileSync(new URL('../release-policy.json', import.meta.url), 'utf8'));
const context = {
  actions: 'true', repository: 'phonton-dev/phonton-desktop', sha: 'a'.repeat(40),
  ref: 'refs/heads/2ntt/candidate', runId: '123456', eventName: 'workflow_dispatch',
};

test('manual Actions candidates retain the exact source and cannot publish', () => {
  assert.deepEqual(assertCandidateOnly(policy, context), {
    candidateOnly: true, publicRelease: 'blocked', source: context.sha,
  });
});

test('both beta and stable tag publication are held', () => {
  for (const ref of ['refs/tags/v0.4.0-beta.1', 'refs/tags/v0.4.0']) {
    assert.throws(() => assertCandidateOnly(policy, { ...context, ref, eventName: 'push' }),
      /Public release is blocked/);
  }
});

test('unknown events and unbound workflow contexts cannot bypass the hold', () => {
  for (const patch of [
    { eventName: 'pull_request' }, { eventName: 'release' }, { eventName: undefined },
    { actions: undefined }, { repository: 'other/repo' }, { sha: 'main' },
    { ref: 'main' }, { runId: '' },
  ]) assert.throws(() => assertCandidateOnly(policy, { ...context, ...patch }));
});

test('missing policies, ready flags, omitted requirements and bypass fields fail closed', () => {
  for (const value of [
    undefined, null, {}, { ...policy, schema: 2 }, { ...policy, publicRelease: 'ready' },
    { ...policy, requirements: [] }, { ...policy, allowUnsigned: true },
    { ...policy, bypass: true },
  ]) assert.throws(() => assertCandidateOnly(value, context), /Unsupported release policy/);
});

test('workflow checks the hold before creating any draft and immediately before publishing', () => {
  const workflow = readFileSync(new URL('../.github/workflows/release-desktop.yml', import.meta.url), 'utf8');
  const preflight = workflow.slice(workflow.indexOf('  preflight:'), workflow.indexOf('  build:'));
  assert.ok(preflight.indexOf('node scripts/publication-hold.mjs') < preflight.indexOf('Check tag matches'));
  assert.ok(preflight.includes('node scripts/publication-hold.mjs'));
  const publish = workflow.slice(workflow.indexOf('  publish:'));
  assert.match(publish, /node scripts\/publication-hold\.mjs\s+gh release edit/);
});
