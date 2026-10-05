import assert from 'node:assert/strict';
import { test } from 'node:test';
import { msiPayloadEntries } from './windows-acceptance/msi-payload.mjs';

const fixture = () => ({
  directories: [{ id: 'INSTALLDIR', parent: 'ProgramFiles64Folder', name: 'Phonton' },
    { id: 'Engine', parent: 'INSTALLDIR', name: 'LOCAL_~1|local-engine:source-folder' }],
  files: [{ id: 'Path', name: 'PHONTO~1.EXE|phonton-desktop.exe', directory: 'INSTALLDIR' },
    { id: 'EngineFile', name: 'phonton.exe', directory: 'Engine' },
    { id: 'ManifestFile', name: 'manifest.json', directory: 'Engine' }],
});

test('MSI CAB members resolve through actual file and target-directory tables', () => {
  assert.deepEqual(msiPayloadEntries(fixture()), [
    { target: 'phonton-desktop.exe', member: 'Path' },
    { target: 'local-engine/phonton.exe', member: 'EngineFile' },
    { target: 'local-engine/manifest.json', member: 'ManifestFile' },
  ]);
});

test('MSI refuses missing, misplaced and ambiguous engine resources', () => {
  for (const mutate of [
    f => { f.files.pop(); },
    f => { f.files[1].directory = 'INSTALLDIR'; },
    f => { f.files[1].name = 'phonton-engine.exe'; f.files[2].name = 'local-engine.json'; },
    f => { f.files.push({ ...f.files[2], id: 'Other', name: 'MANIFEST.JSON' }); },
    f => { f.directories.push({ ...f.directories[1] }); },
  ]) { const f = fixture(); mutate(f); assert.throws(() => msiPayloadEntries(f)); }
});

test('MSI refuses traversal, ambiguous roots, cycles and unsafe CAB identifiers', () => {
  for (const mutate of [
    f => { f.files[0].id = '../Path'; },
    f => { f.files[0].name = 'safe|../phonton-desktop.exe'; },
    f => { f.directories[1].name = '..'; },
    f => { f.directories[1].parent = 'Engine'; },
    f => { f.directories[1].parent = 'Missing'; },
    f => { f.directories.shift(); },
  ]) { const f = fixture(); mutate(f); assert.throws(() => msiPayloadEntries(f)); }
});
