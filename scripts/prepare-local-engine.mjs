import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('Bundled local engine packaging currently supports Windows x64 builds.');
}
const args = process.argv.slice(2);
if (args.some(arg => !['--debug', '--tauri'].includes(arg)) ||
    (args.includes('--debug') && args.includes('--tauri'))) {
  throw new Error('Usage: node scripts/prepare-local-engine.mjs [--debug|--tauri]');
}
const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspace = path.resolve(process.env.PHONTON_ENGINE_SOURCE_DIR || path.resolve(desktop, '../phonton-dev'));
const fromTauri = args.includes('--tauri');
if (fromTauri && !['true', 'false'].includes(process.env.TAURI_ENV_DEBUG)) {
  throw new Error('Tauri did not provide TAURI_ENV_DEBUG; engine build profile is unknown.');
}
if (!existsSync(path.join(workspace, 'Cargo.toml'))) {
  throw new Error('Windows Desktop packaging requires the matching phonton-dev source beside phonton-desktop.');
}
const debug = fromTauri ? process.env.TAURI_ENV_DEBUG === 'true' : args.includes('--debug');
const profile = debug ? 'debug' : 'release';
const cargo = process.env.CARGO || 'cargo';
const engineTarget = process.env.PHONTON_ENGINE_TARGET_DIR || process.env.CARGO_TARGET_DIR;
const buildEnv = { ...process.env };
if (engineTarget) buildEnv.CARGO_TARGET_DIR = engineTarget;
const result = spawnSync(cargo, ['build', '--locked', ...(fromTauri ? [] : ['--offline']), '-j1', '-p', 'phonton-cli', ...(debug ? [] : ['--release'])], {
  cwd: workspace, stdio: 'inherit', windowsHide: true, env: buildEnv,
});
if (result.error || result.status !== 0) throw result.error || new Error(`Engine build failed (${result.status})`);
const target = engineTarget
  ? path.resolve(workspace, engineTarget)
  : path.join(workspace, 'target');
const executable = path.join(target, profile, 'phonton.exe');
const versionResult = spawnSync(executable, ['version'], { encoding: 'utf8', windowsHide: true });
const version = versionResult.stdout?.trim().match(/^phonton (\d+\.\d+\.\d+(?:[-+][\w.-]+)?)$/)?.[1];
if (versionResult.error || versionResult.status !== 0 || !version) throw new Error('Built engine did not report its version.');
if (process.env.PHONTON_ENGINE_EXPECTED_VERSION &&
    version !== process.env.PHONTON_ENGINE_EXPECTED_VERSION) {
  throw new Error(`Built engine version ${version} does not match the pinned version ${process.env.PHONTON_ENGINE_EXPECTED_VERSION}.`);
}
const statusResult = spawnSync(executable, ['models', 'status', '--json'], {
  encoding: 'utf8', timeout: 20000, windowsHide: true,
});
let status;
try { status = JSON.parse(statusResult.stdout || ''); } catch { /* invalid status is rejected below */ }
if (statusResult.error || statusResult.status !== 0 ||
    status?.loopback_only !== true || typeof status?.local_only !== 'boolean' ||
    !Array.isArray(status?.models) ||
    !Number.isInteger(status?.schema) || status.schema < 2) {
  throw new Error('Built engine did not provide the local-model status contract.');
}
const bytes = readFileSync(executable);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const destination = path.join(desktop, 'src-tauri', 'binaries');
mkdirSync(destination, { recursive: true });
copyFileSync(executable, path.join(destination, 'phonton-engine.exe'));
writeFileSync(path.join(destination, 'local-engine.json'), JSON.stringify({
  schema: 1, version, sha256, target: 'x86_64-pc-windows-msvc', profile,
}, null, 2) + '\n');
console.log(`Prepared ${profile} local engine ${version}; SHA-256 ${sha256}`);
