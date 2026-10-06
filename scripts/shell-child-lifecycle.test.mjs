import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, symlinkSync } from "node:fs";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/shell-child-lifecycle.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2021 },
}).outputText;
const { spawnObservedShellChild, unixServeArgs } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

function mockCommand() {
  let close;
  let resolveSpawn;
  const handle = { kill: async () => {} };
  return {
    handle,
    close: () => close(),
    resolve: () => resolveSpawn(handle),
    command: {
      on: (_event, listener) => { close = listener; },
      spawn: () => new Promise(resolve => { resolveSpawn = resolve; }),
    },
  };
}

test("an exited shell child is cleared so Retry can spawn again", async () => {
  const process = mockCommand();
  let current = null;
  const pending = spawnObservedShellChild(process.command, () => current, value => { current = value; });
  process.resolve();
  await pending;
  assert.equal(current, process.handle);
  process.close();
  assert.equal(current, null);
});

test("a child that closes before spawn resolves never becomes current", async () => {
  const process = mockCommand();
  let current = null;
  const pending = spawnObservedShellChild(process.command, () => current, value => { current = value; });
  process.close();
  process.resolve();
  await pending;
  assert.equal(current, null);
});

test("an old child close cannot clear its replacement", async () => {
  const old = mockCommand();
  const newer = mockCommand();
  let current = null;
  const oldPending = spawnObservedShellChild(old.command, () => current, value => { current = value; });
  old.resolve();
  await oldPending;
  const newPending = spawnObservedShellChild(newer.command, () => current, value => { current = value; });
  newer.resolve();
  await newPending;
  old.close();
  assert.equal(current, newer.handle);
});

test("Unix tracked process owns its listener and closing it preserves an independent runtime", {
  skip: process.platform === "win32", timeout: 15000,
}, async () => {
  // A real child/listener regression, not a Phonton/model acceptance substitute.
  const directory = mkdtempSync(path.join(tmpdir(), "phonton ' quoted $(literal) "));
  const executable = path.join(directory, "local engine ' $(literal)");
  symlinkSync(process.execPath, executable);
  const token = randomUUID();
  writeFileSync(path.join(directory, "serve"), `const net=require('node:net');
const server=net.createServer(socket=>socket.once('data',data=>{
 if(data.toString()===process.env.PHONTON_TEST_STOP) { socket.end();server.close(()=>process.exit(0)); }
 else socket.end(JSON.stringify({pid:process.pid}));
}));server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({pid:process.pid,port:server.address().port})));
`);
  const children = [], listeners = [];
  async function launch(command, args) {
    const child = spawn(command, args, { cwd: directory, env: { ...process.env, PHONTON_TEST_STOP: token }, stdio: ['ignore', 'pipe', 'pipe'] });
    const exited = once(child, 'exit'); exited.catch(() => {});
    children.push({ child, exited });
    let stderr = ''; child.stderr.on('data', data => { stderr += data; });
    const ready = await new Promise((resolve, reject) => {
      let stdout = '';
      const timer = setTimeout(() => reject(new Error('Fixture listener did not start: ' + stderr)), 5000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', () => { clearTimeout(timer); reject(new Error('Fixture exited before ready: ' + stderr)); });
      child.stdout.on('data', data => {
        stdout += data;
        if (stdout.includes('\n')) {
          clearTimeout(timer);
          try { resolve(JSON.parse(stdout.trim())); } catch (error) { reject(error); }
        }
      });
    });
    listeners.push(ready); return { child, exited, ...ready };
  }
  function query(port, text = 'identity') {
    return new Promise((resolve, reject) => {
      const socket = createConnection({ host: '127.0.0.1', port }); let response = '';
      socket.setTimeout(2000, () => socket.destroy(new Error('Fixture socket timed out')));
      socket.once('error', reject); socket.once('connect', () => socket.end(text));
      socket.on('data', data => { response += data; }); socket.once('end', () => resolve(response));
    });
  }
  try {
    const independent = await launch(process.execPath, ['serve']);
    const engine = await launch('/bin/sh', unixServeArgs(executable));
    assert.equal(engine.pid, engine.child.pid, 'The tracked shell PID must become the actual engine, without a grandchild');
    assert.equal(JSON.parse(await query(engine.port)).pid, engine.child.pid);
    assert.equal(JSON.parse(await query(independent.port)).pid, independent.child.pid);
    engine.child.kill('SIGTERM'); await engine.exited;
    await assert.rejects(query(engine.port), error => error.code === 'ECONNREFUSED');
    assert.equal(independent.child.exitCode, null);
    assert.equal(JSON.parse(await query(independent.port)).pid, independent.child.pid);
  } finally {
    // Address only fixture-owned listeners/handles, including a failing old wrapper.
    await Promise.all(listeners.map(listener => query(listener.port, token).catch(() => {})));
    for (const { child, exited } of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      await exited;
    }
  }
});
