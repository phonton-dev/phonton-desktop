import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { bootstrapVersion, makeUpdaterBootstrapOverride, requireDisposableUpdaterRunner, updaterOrigin } from './windows-acceptance/updater-bootstrap.mjs';

const source = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
test('controlled bootstrap retains identity, key and TLS while remaining visibly separate from the candidate', () => {
  const before = structuredClone(source);
  const override = makeUpdaterBootstrapOverride(source);
  assert.equal(override.version, bootstrapVersion);
  assert.equal(override.plugins.updater.pubkey, source.plugins.updater.pubkey);
  assert.deepEqual(override.plugins.updater.endpoints, [`${updaterOrigin}/update.json`]);
  assert.equal(override.app.windows[0].title, 'Phonton updater acceptance bootstrap');
  assert.deepEqual(override.bundle, { createUpdaterArtifacts: false, targets: ['nsis'] });
  assert.equal(override.productName, undefined);
  assert.equal(override.identifier, undefined);
  override.app.windows[0].label = 'mutation-control';
  assert.deepEqual(source, before, 'Build override must not mutate the candidate configuration');
});
test('bootstrap refuses wrong identity, version, updater feed or disabled TLS checks', () => {
  for (const mutate of [
    value => { value.productName = 'Phonton Preview'; },
    value => { value.identifier = 'dev.phonton.preview'; },
    value => { value.version = '0.3.4'; },
    value => { value.plugins.updater.endpoints = ['https://example.org']; },
    ...['dangerousInsecureTransportProtocol', 'dangerousAcceptInvalidCerts', 'dangerousAcceptInvalidHostnames',
      'dangerous-insecure-transport-protocol', 'dangerous-accept-invalid-certs', 'dangerous-accept-invalid-hostnames']
      .map(flag => value => { value.plugins.updater[flag] = true; }),
  ]) {
    const config = structuredClone(source); mutate(config);
    assert.throws(() => makeUpdaterBootstrapOverride(config));
  }
});
test('bootstrap execution guard requires the disposable manual Windows environment', () => {
  const previous = process.env.GITHUB_ACTIONS;
  try { delete process.env.GITHUB_ACTIONS; assert.throws(requireDisposableUpdaterRunner, /Disposable Actions runner required/); }
  finally { if (previous !== undefined) process.env.GITHUB_ACTIONS = previous; }
});
