import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const bootstrapVersion = '0.4.0-alpha.0';
export const updaterOrigin = 'https://127.0.0.1:39461';
const stableEndpoint = 'https://github.com/phonton-dev/phonton-desktop/releases/latest/download/latest.json';

// An explicitly labelled test build, never a candidate installer for publication.
// The real candidate remains unchanged and keeps its stable endpoint and key.
export function makeUpdaterBootstrapOverride(config) {
  assert.equal(config.productName, 'Phonton');
  assert.equal(config.identifier, 'dev.phonton.desktop');
  assert.equal(config.version, '0.4.0-beta.1');
  assert.equal(config.bundle.createUpdaterArtifacts, true);
  assert.deepEqual(config.plugins.updater.endpoints, [stableEndpoint]);
  assert.ok(config.plugins.updater.pubkey);
  for (const flag of ['dangerousInsecureTransportProtocol', 'dangerousAcceptInvalidCerts', 'dangerousAcceptInvalidHostnames',
    'dangerous-insecure-transport-protocol', 'dangerous-accept-invalid-certs', 'dangerous-accept-invalid-hostnames']) {
    assert.ok(!config.plugins.updater[flag], `Production TLS must not bypass ${flag}`);
  }
  assert.equal(config.app.windows.length, 1);
  assert.equal(config.app.windows[0].label, 'main');
  return {
    version: bootstrapVersion,
    app: { windows: [{ ...structuredClone(config.app.windows[0]), title: 'Phonton updater acceptance bootstrap' }] },
    bundle: { createUpdaterArtifacts: false, targets: ['nsis'] },
    plugins: { updater: { ...structuredClone(config.plugins.updater), endpoints: [`${updaterOrigin}/update.json`] } },
  };
}

export function requireDisposableUpdaterRunner() {
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Disposable Actions runner required');
  assert.equal(process.env.RUNNER_OS, 'Windows');
  assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
  assert.equal(process.env.GITHUB_REPOSITORY, 'phonton-dev/phonton-desktop');
  assert.equal(process.platform, 'win32');
  assert.equal(process.env.GITHUB_EVENT_NAME, 'workflow_dispatch', 'Manual acceptance only');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  requireDisposableUpdaterRunner();
  const output = path.resolve(process.argv[2] ?? '');
  const temporary = path.resolve(process.env.RUNNER_TEMP ?? '');
  const relative = path.relative(temporary, output);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Bootstrap config must be inside runner temp');
  assert.equal(path.basename(output), 'phonton-updater-bootstrap.json');
  const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
  writeFileSync(output, JSON.stringify(makeUpdaterBootstrapOverride(config), null, 2) + '\n', { flag: 'wx' });
  console.log(`Prepared labelled ${bootstrapVersion} bootstrap config; production config unchanged.`);
}
