import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const leafName = value => {
  const name = value.split('|').at(-1);
  assert.ok(name && !/[\\/:<>"?*\x00-\x1f]/.test(name) && name !== '..' && !/[. ]$/.test(name), 'Unsafe MSI target name');
  return name;
};

// CAB members use File-table IDs, not installed filenames. Resolve the MSI's
// actual target directories so a same-named resource elsewhere cannot pass.
export function msiPayloadEntries(metadata) {
  const directories = new Map(metadata.directories.map(row => [row.id, row]));
  assert.equal(directories.size, metadata.directories.length, 'Duplicate MSI directory');
  assert.ok(directories.has('INSTALLDIR'), 'MSI installation root missing');
  const entries = new Map();
  for (const file of metadata.files) {
    assert.match(file.id, /^[A-Za-z_][A-Za-z0-9_.]*$/, 'Unsafe MSI CAB member');
    const parts = [leafName(file.name)];
    const visited = new Set();
    let directory = file.directory;
    while (directory !== 'INSTALLDIR') {
      assert.ok(!visited.has(directory), 'Cyclic MSI directory');
      visited.add(directory);
      const row = directories.get(directory);
      assert.ok(row?.parent, 'MSI payload outside installation root');
      const target = row.name.split(':')[0];
      if (target !== '.') parts.unshift(leafName(target));
      directory = row.parent;
    }
    const target = parts.join('/');
    const key = target.toLowerCase();
    assert.ok(!entries.has(key), 'Duplicate MSI payload target');
    entries.set(key, { target, member: file.id });
  }
  const required = ['phonton-desktop.exe', 'local-engine/phonton.exe', 'local-engine/manifest.json'];
  return required.map(target => {
    assert.ok(entries.has(target), `Missing MSI payload: ${target}`);
    return entries.get(target);
  });
}

export function extractMsiPayload(installer, destination) {
  const script = fileURLToPath(new URL('./read-msi-metadata.ps1', import.meta.url));
  const metadata = JSON.parse(execFileSync('pwsh', ['-NoProfile', '-File', script, '-InstallerPath', path.resolve(installer)], { encoding: 'utf8' }));
  const entries = msiPayloadEntries(metadata);
  mkdirSync(destination); // Refuse stale extraction from another candidate.
  execFileSync('7z', ['x', path.resolve(installer), `-o${destination}`, '-y'], { stdio: 'pipe' });
  return { metadata, entries, files: Object.fromEntries(entries.map(entry => [entry.target.toLowerCase(), path.join(destination, entry.member)])) };
}
