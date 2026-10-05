import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

function powershell(script) {
  return JSON.parse(execFileSync('pwsh', ['-NoProfile', '-File', `scripts/windows-acceptance/${script}.ps1`], {
    encoding: 'utf8', windowsHide: true, timeout: 30000,
  }));
}

export function validateDefaultProfile(observation, localAppData) {
  const root = path.win32.resolve(localAppData, 'dev.phonton.desktop').toLowerCase();
  assert.equal(observation.userDataDirectories.length, 1, 'Exactly one owned WebView profile expected');
  const current = path.win32.resolve(observation.userDataDirectories[0]).toLowerCase();
  assert.ok(current === root || current.startsWith(root + '\\'), 'Native app must use its normal application data directory');
  assert.ok(observation.debugListeners.length > 0, 'Owned native debugging listener missing');
  for (const listener of observation.debugListeners) {
    assert.ok(['127.0.0.1', '::1'].includes(listener.LocalAddress), 'Cloud test debug listener must be loopback-only');
    assert.ok(observation.ownedWebViewProcessIds.includes(listener.OwningProcess), 'Debug endpoint must belong to the installed app WebView');
  }
}

export function observeDefaultProfile() {
  const observed = powershell('observe-webview-profile');
  validateDefaultProfile(observed, process.env.LOCALAPPDATA);
  return observed;
}

// Microsoft documents attaching WebDriver to an independently launched WebView2:
// https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/webdriver#step-4b-attaching-microsoft-edge-webdriver-to-a-running-webview2-app
export async function launchAndAttachDefaultProfile(request) {
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.platform, 'win32');
  const launchRecord = path.resolve('acceptance-evidence', `native-launch-${randomUUID()}.json`);
  // A long-lived native child must not inherit captured execFileSync output
  // pipes. Return its PID through an evidence file; inherited stdio is NUL.
  execFileSync('pwsh', ['-NoProfile', '-File', 'scripts/windows-acceptance/launch-default-profile.ps1', '-RecordPath', launchRecord], {
    stdio: 'ignore', windowsHide: true, timeout: 30000,
  });
  const launched = JSON.parse(readFileSync(launchRecord, 'utf8').replace(/^\uFEFF/, ''));
  return attachDefaultProfile(request, launched.processId);
}

/** Attach to an independently observed app; this helper never launches it. */
export async function attachDefaultProfile(request, expectedProcessId) {
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.platform, 'win32');
  assert.equal(process.env.PHONTON_ACCEPTANCE_PROFILE, undefined);
  assert.equal(process.env.WEBVIEW2_USER_DATA_FOLDER, undefined);
  assert.ok(Number.isSafeInteger(expectedProcessId) && expectedProcessId > 0);
  const deadline = Date.now() + 60000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://127.0.0.1:9222/json/version', { signal: AbortSignal.timeout(3000) });
      if (response.ok) { ready = true; break; }
    } catch { /* Wait only for the newly launched app's debugging endpoint. */ }
    await delay(500);
  }
  assert.ok(ready, 'Native debugging endpoint did not start');
  const profile = observeDefaultProfile();
  assert.equal(profile.appProcessId, expectedProcessId);
  const session = await request('POST', '/session', { capabilities: { alwaysMatch: {
    browserName: 'webview2', 'ms:edgeChromium': true,
    'ms:edgeOptions': { debuggerAddress: '127.0.0.1:9222' },
  } } });
  return { ...session, nativeProfile: profile };
}
