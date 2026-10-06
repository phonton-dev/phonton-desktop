import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { waitForNativeDriver } from './linux-acceptance/driver-ready.mjs';

async function withServer(handler, action) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await action(`http://127.0.0.1:${server.address().port}/status`); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test('native driver startup tolerates zero-byte proxy close before actual ready response', async () => {
  let calls = 0;
  await withServer((request, response) => {
    calls += 1;
    if (calls === 1) { request.socket.destroy(); return; }
    response.setHeader('Connection', 'close');
    response.end(JSON.stringify({ value: { ready: calls >= 3 } }));
  }, url => waitForNativeDriver({ url, isAlive: () => true, timeout: 2000, interval: 5 }));
  assert.equal(calls, 3);
});

test('native driver startup fails on HTTP errors and malformed status instead of retrying', async () => {
  for (const [status, body] of [[500, '{}'], [200, 'invalid json'], [200, '{"value":{"ready":"yes"}}']]) {
    let calls = 0;
    await withServer((request, response) => { calls += 1; response.writeHead(status); response.end(body); }, async url => {
      await assert.rejects(waitForNativeDriver({ url, isAlive: () => true, timeout: 2000, interval: 5 }));
    });
    assert.equal(calls, 1);
  }
});

test('native driver startup remains bounded and refuses an exited driver', async () => {
  await withServer((request, response) => response.end('{"value":{"ready":false}}'), async url => {
    await assert.rejects(waitForNativeDriver({ url, isAlive: () => true, timeout: 50, interval: 5 }), /Timed out/);
    await assert.rejects(waitForNativeDriver({ url, isAlive: () => false }), /exited/);
  });
});
test('native driver startup rejects a truncated response after headers or body bytes', async () => {
  let calls = 0;
  await withServer((request, response) => {
    calls += 1; response.writeHead(200, { 'Content-Type': 'application/json' });
    response.flushHeaders(); response.write('{"value":');
    setTimeout(() => response.destroy(), 10);
  }, async url => {
    await assert.rejects(waitForNativeDriver({ url, isAlive: () => true, timeout: 2000, interval: 5 }));
  });
  assert.equal(calls, 1);
});

test('a permanently closed proxy reaches its startup deadline and foreign endpoints are refused', async () => {
  await withServer(request => request.socket.destroy(), async url => {
    await assert.rejects(waitForNativeDriver({ url, isAlive: () => true, timeout: 75, interval: 5 }), /Timed out/);
  });
  await assert.rejects(waitForNativeDriver({ url: 'http://192.0.2.1:4444/status', isAlive: () => true }), /AssertionError/);
});
