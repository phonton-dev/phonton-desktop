import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

/** Wait for both proxy and native driver before any app/session launch. */
export async function waitForNativeDriver({ isAlive, url = 'http://127.0.0.1:4444/status', timeout = 30000, interval = 500 }) {
  const endpoint = new URL(url);
  assert.equal(endpoint.protocol, 'http:'); assert.equal(endpoint.hostname, '127.0.0.1');
  assert.equal(endpoint.pathname, '/status');
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    assert.equal(isAlive(), true, 'WebDriver exited before readiness');
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(Math.min(2000, Math.max(1, end - Date.now()))) });
      assert.equal(response.ok, true, 'WebDriver status returned an HTTP error');
      const value = await response.json();
      assert.equal(typeof value.value?.ready, 'boolean', 'Malformed WebDriver readiness response');
      if (value.value.ready) return;
    } catch (error) {
      const cause = error.cause;
      // tauri-driver may listen before WebKitWebDriver. Its proxy then closes
      // the request without response bytes when the native connection is refused.
      const emptyLoopbackClose = cause?.code === 'UND_ERR_SOCKET' &&
        cause.socket?.remoteAddress === endpoint.hostname && cause.socket?.remotePort === Number(endpoint.port || 80) &&
        cause.socket?.bytesRead === 0;
      if (!(cause?.code === 'ECONNREFUSED' || error.name === 'TimeoutError' || emptyLoopbackClose)) throw error;
    }
    await delay(Math.min(interval, Math.max(0, end - Date.now())));
  }
  throw new Error('Timed out: native WebDriver startup');
}
