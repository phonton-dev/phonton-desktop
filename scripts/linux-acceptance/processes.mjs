import assert from 'node:assert/strict';
import { readFileSync, readlinkSync, readdirSync, realpathSync } from 'node:fs';
import { sameLinuxProcess } from './contract.mjs';

/** Reject a PID that exited, was recycled or changed executable during the scan. */
export function stableProcessObservation(pid, readIdentity, readSockets) {
  const before = readIdentity(pid);
  const inodes = readSockets(pid);
  const after = readIdentity(pid);
  assert.equal(before.pid, pid);
  assert.equal(after.pid, pid);
  return sameLinuxProcess(before, after) ? { process: after, inodes } : null;
}

/** The executable name in proc stat may contain spaces and closing parentheses. */
export function parseProcessStat(text, exe) {
  const separator = text.lastIndexOf(') ');
  assert.ok(separator > 0, 'Malformed proc stat');
  const pid = Number(text.slice(0, text.indexOf(' ')));
  const fields = text.slice(separator + 2).trim().split(/\s+/);
  const ppid = Number(fields[1]);
  assert.ok(Number.isSafeInteger(pid) && pid > 0 && Number.isSafeInteger(ppid) && ppid >= 0);
  assert.match(fields[19], /^\d+$/);
  assert.ok(exe.startsWith('/'));
  return { pid, ppid, exe, startTime: fields[19], state: fields[0] };
}

/** Preserve non-loopback and IPv6 listeners too; they cannot disappear from evidence. */
export function parseListeners(text, family, ports = [47831, 11434]) {
  assert.ok(['ipv4', 'ipv6'].includes(family));
  const rows = [];
  for (const line of text.trim().split('\n').slice(1)) {
    const fields = line.trim().split(/\s+/);
    if (fields[3] !== '0A') continue;
    const [address, encodedPort] = fields[1].split(':');
    const port = Number.parseInt(encodedPort, 16);
    if (!ports.includes(port)) continue;
    assert.match(address, family === 'ipv4' ? /^[A-Fa-f0-9]{8}$/ : /^[A-Fa-f0-9]{32}$/);
    assert.match(fields[9], /^\d+$/);
    rows.push({ family, address: address.toUpperCase(), port, inode: fields[9],
      loopback: family === 'ipv4' ? address.toUpperCase() === '0100007F' : address.toUpperCase() === '00000000000000000000000001000000' });
  }
  return rows;
}

export function isDescendant(pid, parentPid, processes) {
  const seen = new Set();
  let current = pid;
  while (current > 0 && !seen.has(current)) {
    seen.add(current);
    const process = processes.find(row => row.pid === current);
    if (!process) return false;
    if (process.ppid === parentPid) return true;
    current = process.ppid;
  }
  return false;
}

/** Read actual executable paths, kernel start times and socket ownership on the cloud runner. */
export function linuxSnapshot({ app, engine, runtime }) {
  assert.equal(process.platform, 'linux');
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
  const expected = Object.fromEntries(Object.entries({ app, engine, runtime }).map(([key, value]) => [key, realpathSync(value)]));
  const processes = [], inaccessible = [], unstable = [], sockets = new Map();
  for (const name of readdirSync('/proc').filter(value => /^\d+$/.test(value))) {
    const root = `/proc/${name}`;
    try {
      const observed = stableProcessObservation(Number(name),
        () => parseProcessStat(readFileSync(`${root}/stat`, 'utf8'), readlinkSync(`${root}/exe`)),
        () => {
          const inodes = [];
          for (const fd of readdirSync(`${root}/fd`)) {
            let target;
            try { target = readlinkSync(`${root}/fd/${fd}`); }
            catch (error) { if (error.code === 'ENOENT') continue; throw error; }
            const inode = /^socket:\[(\d+)\]$/.exec(target)?.[1];
            if (inode) inodes.push(inode);
          }
          return inodes;
        });
      if (!observed) { unstable.push(Number(name)); continue; }
      processes.push(observed.process);
      for (const inode of observed.inodes) {
        const owners = sockets.get(inode) ?? new Set(); owners.add(observed.process.pid); sockets.set(inode, owners);
      }
    } catch (error) {
      if (['ENOENT', 'ESRCH'].includes(error.code)) continue;
      if (['EACCES', 'EPERM'].includes(error.code)) { inaccessible.push(Number(name)); continue; }
      throw error;
    }
  }
  const listeners = [['tcp', 'ipv4'], ['tcp6', 'ipv6']].flatMap(([file, family]) => parseListeners(readFileSync(`/proc/net/${file}`, 'utf8'), family))
    .map(listener => ({ ...listener, pids: [...(sockets.get(listener.inode) ?? [])] }));
  return { schema: 1, at: new Date().toISOString(), expected, processes, inaccessible, unstable, listeners,
    apps: processes.filter(row => row.exe === expected.app), engines: processes.filter(row => row.exe === expected.engine),
    runtimes: processes.filter(row => row.exe === expected.runtime) };
}
