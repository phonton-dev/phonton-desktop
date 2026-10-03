import { readFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function validateReleaseVersions(tag, versions) {
  if (!/^v\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(tag)) {
    throw new Error('Unsupported release tag.');
  }
  const version = tag.slice(1);
  for (const [source, actual] of Object.entries(versions)) {
    if (actual !== version) throw new Error(`${source} is ${actual}; tag requires ${version}.`);
  }
  return { version, prerelease: version.includes('-') };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const read = file => readFileSync(file, 'utf8');
  const cargo = read('src-tauri/Cargo.toml');
  const lock = read('src-tauri/Cargo.lock');
  const npmLock = JSON.parse(read('package-lock.json'));
  const result = validateReleaseVersions(process.argv[2] || '', {
    'package.json': JSON.parse(read('package.json')).version,
    'package-lock.json': npmLock.version,
    'package-lock root': npmLock.packages[''].version,
    'Tauri config': JSON.parse(read('src-tauri/tauri.conf.json')).version,
    'Cargo package': cargo.match(/\[package\][\s\S]*?^version\s*=\s*"([^"\n]+)"/m)?.[1],
    'Cargo lock': lock.match(/name = "phonton-desktop"\r?\nversion = "([^"\n]+)"/)?.[1],
  });
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `prerelease=${result.prerelease}\n`);
  console.log(JSON.stringify(result));
}
