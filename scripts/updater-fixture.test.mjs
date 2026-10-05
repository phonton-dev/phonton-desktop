import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer, request } from 'node:http';
import test from 'node:test';
import { createUpdaterFixture } from './windows-acceptance/updater-fixture.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
function inputs() {
  // Deliberately synthetic transport bytes: these tests make no signature or
  // installer acceptance claim. The native cloud journey uses real signed bytes.
  const installerBytes = Buffer.from('synthetic installer payload');
  const signatureBytes = Buffer.from(Buffer.from('synthetic transport signature').toString('base64') + '\n');
  const commit = 'a'.repeat(40);
  const manifestBytes = Buffer.from(JSON.stringify({ desktopCommit: commit, profile: 'release',
    identifier: 'dev.phonton.desktop', productName: 'Phonton', version: '0.4.0-beta.1',
    installer: { kind: 'nsis', sha256: hash(installerBytes) } }));
  return { installerBytes, signatureBytes, manifestBytes, pin: {
    commit, manifestSha256: hash(manifestBytes), installerSha256: hash(installerBytes), signatureSha256: hash(signatureBytes),
  } };
}
test('fixture rejects mismatched candidate source, manifest, installer and signature bytes', () => {
  for (const field of ['manifestBytes', 'installerBytes', 'signatureBytes']) {
    const data = inputs(); data[field] = Buffer.concat([data[field], Buffer.from('changed')]);
    assert.throws(() => createUpdaterFixture(data));
  }
  const wrong = inputs(); wrong.pin.commit = 'b'.repeat(40);
  assert.throws(() => createUpdaterFixture(wrong));
  const msi = inputs(); const manifest = JSON.parse(msi.manifestBytes); manifest.installer.kind = 'msi';
  msi.manifestBytes = Buffer.from(JSON.stringify(manifest)); msi.pin.manifestSha256 = hash(msi.manifestBytes);
  assert.throws(() => createUpdaterFixture(msi));
});
test('transport serves withdrawn, tampered and valid updates with exact pinned bytes and no redirects', async t => {
  const data = inputs();
  const fixture = createUpdaterFixture(data);
  const server = createServer(fixture.handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const get = (url, method = 'GET', host = '127.0.0.1:39461') => new Promise((resolve, reject) => {
    const call = request({ hostname: '127.0.0.1', port: server.address().port, path: url, method, headers: { Host: host } }, response => {
      const chunks = []; response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    call.on('error', reject); call.end();
  });
  assert.equal((await get('/update.json')).status, 204);
  assert.equal((await get('/update.json', 'POST')).status, 405);
  assert.equal((await get('/update.json', 'GET', 'example.org')).status, 403);
  assert.equal((await get('/payload/candidate.exe')).status, 404);
  assert.throws(() => fixture.advance('candidate'), /advance once/);
  fixture.advance('advertised');
  const advertised = JSON.parse((await get('/update.json')).body);
  assert.equal(advertised.version, '0.4.0-beta.1');
  fixture.advance('withdrawn');
  assert.equal((await get('/update.json')).status, 204);
  assert.equal((await get('/payload/advertised.exe')).status, 404);
  fixture.advance('tampered');
  const negative = await get('/update.json');
  const altered = JSON.parse(negative.body).platforms['windows-x86_64-nsis'];
  assert.equal(altered.signature, data.signatureBytes.toString().trim());
  assert.equal(altered.url, 'https://127.0.0.1:39461/payload/tampered.exe');
  const badBytes = await get('/payload/tampered.exe');
  assert.equal(badBytes.status, 200);
  assert.equal(badBytes.body.length, data.installerBytes.length);
  assert.notEqual(hash(badBytes.body), data.pin.installerSha256);
  assert.equal(badBytes.headers.location, undefined);
  fixture.advance('candidate');
  const positive = JSON.parse((await get('/update.json')).body).platforms['windows-x86_64-nsis'];
  assert.equal(positive.signature, altered.signature);
  assert.equal(positive.url, 'https://127.0.0.1:39461/payload/candidate.exe');
  assert.deepEqual((await get('/payload/candidate.exe')).body, data.installerBytes);
  assert.equal((await get('/payload/tampered.exe')).status, 404);
  assert.equal((await get('/../candidate.json')).status, 404);
  assert.throws(() => fixture.advance('tampered'), /advance once/);
  const observed = fixture.snapshot();
  assert.deepEqual(observed.history.map(row => row.phase), ['current', 'advertised', 'withdrawn', 'tampered', 'candidate']);
  const payloads = observed.events.filter(row => row.status === 200 && row.path.startsWith('/payload/'));
  assert.equal(payloads.length, 2);
  assert.equal(payloads[0].bodySha256, observed.tamperedSha256);
  assert.equal(payloads[1].bodySha256, data.pin.installerSha256);
  assert.ok(payloads.every(row => row.responseFinished));
});
