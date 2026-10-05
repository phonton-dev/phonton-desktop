import assert from 'node:assert/strict';
import { createHash, createPrivateKey, X509Certificate } from 'node:crypto';
import { createServer } from 'node:https';
import { requireDisposableUpdaterRunner, updaterOrigin } from './updater-bootstrap.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const phases = ['current', 'advertised', 'withdrawn', 'tampered', 'candidate'];

// These digest pins are supplied only after exact-run artifact collection. This
// fixture transports bytes; the installed Tauri updater must verify signatures.
export function createUpdaterFixture({ manifestBytes, installerBytes, signatureBytes, pin }) {
  for (const field of ['manifestSha256', 'installerSha256', 'signatureSha256']) assert.match(pin[field], /^[a-f0-9]{64}$/);
  assert.match(pin.commit, /^[a-f0-9]{40}$/);
  assert.equal(hash(manifestBytes), pin.manifestSha256);
  assert.equal(hash(installerBytes), pin.installerSha256);
  assert.equal(hash(signatureBytes), pin.signatureSha256);
  const candidate = JSON.parse(Buffer.from(manifestBytes).toString('utf8').replace(/^\uFEFF/, ''));
  assert.equal(candidate.desktopCommit, pin.commit);
  assert.equal(candidate.profile, 'release');
  assert.equal(candidate.identifier, 'dev.phonton.desktop');
  assert.equal(candidate.productName, 'Phonton');
  assert.equal(candidate.version, '0.4.0-beta.1');
  assert.equal(candidate.installer.kind, 'nsis');
  assert.equal(candidate.installer.sha256, pin.installerSha256);
  const signature = Buffer.from(signatureBytes).toString('utf8').trim();
  const signatureSha256 = hash(signatureBytes);
  assert.match(signature, /^[A-Za-z0-9+/]+={0,2}$/);
  assert.equal(Buffer.from(signature, 'base64').toString('base64'), signature, 'Signature file must be canonical base64');
  const exact = Buffer.from(installerBytes);
  assert.ok(exact.length > 0);
  const tampered = Buffer.from(exact);
  tampered[tampered.length - 1] ^= 1;
  assert.notEqual(hash(tampered), pin.installerSha256);
  let phase = 'current';
  const events = [];
  const history = [{ phase, at: new Date().toISOString() }];

  function advance(next) {
    assert.equal(phases.indexOf(next), phases.indexOf(phase) + 1, 'Fixture phases advance once and cannot roll back');
    phase = next;
    history.push({ phase, at: new Date().toISOString() });
  }

  function handler(request, response) {
    const requestPhase = phase;
    const noUpdate = requestPhase === 'current' || requestPhase === 'withdrawn';
    let status = 404, body = Buffer.alloc(0), type = 'text/plain';
    const allowed = request.socket.remoteAddress === '127.0.0.1' || request.socket.remoteAddress === '::ffff:127.0.0.1';
    if (!allowed || request.headers.host !== '127.0.0.1:39461') status = 403;
    else if (request.method !== 'GET') status = 405;
    else if (request.url === '/update.json') {
      status = noUpdate ? 204 : 200;
      type = 'application/json';
      if (status === 200) body = Buffer.from(JSON.stringify({
        version: candidate.version,
        notes: 'Controlled updater acceptance fixture. Not a public update feed.',
        platforms: { 'windows-x86_64-nsis': { signature, url: `${updaterOrigin}/payload/${requestPhase}.exe` } },
      }));
    } else if (!noUpdate && request.url === `/payload/${requestPhase}.exe`) {
      status = 200;
      type = 'application/octet-stream';
      body = requestPhase === 'tampered' ? tampered : exact;
    }
    const entry = { at: new Date().toISOString(), phase: requestPhase, method: request.method,
      path: request.url, status, bodyBytes: body.length, bodySha256: hash(body) };
    response.once('close', () => events.push({ ...entry, responseFinished: response.writableFinished }));
    response.writeHead(status, { 'Content-Type': type, 'Content-Length': body.length, 'Cache-Control': 'no-store', Connection: 'close' });
    response.end(body);
  }
  return { handler, advance, snapshot: () => structuredClone({ phase, history, events,
    candidateCommit: candidate.desktopCommit, installerSha256: hash(exact), tamperedSha256: hash(tampered),
    signatureSha256, limitation: 'Transport observations alone do not prove native updater signature rejection or installation.' }) };
}

// TLS verification stays enabled. The runner must separately trust its short-lived
// loopback certificate; no updater or OS publisher signing credentials are used.
export async function startControlledUpdaterServer(fixture, { key, cert }) {
  requireDisposableUpdaterRunner();
  const identity = new X509Certificate(cert);
  assert.equal(identity.checkIP('127.0.0.1'), '127.0.0.1');
  assert.equal(identity.checkHost('localhost'), 'localhost');
  assert.ok(identity.checkPrivateKey(createPrivateKey(key)));
  assert.ok(Date.parse(identity.validFrom) <= Date.now() && Date.parse(identity.validTo) > Date.now());
  const server = createServer({ key, cert, minVersion: 'TLSv1.2' }, fixture.handler);
  server.headersTimeout = 10000;
  server.requestTimeout = 60000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(39461, '127.0.0.1', resolve);
  });
  assert.equal(server.address().address, '127.0.0.1');
  return { close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}
