/** Resolve the engine profile using Tauri's before-build environment contract. */
export function engineBuildProfile(args, env = process.env) {
  if (args.some(arg => !['--debug', '--tauri'].includes(arg)) ||
      (args.includes('--debug') && args.includes('--tauri'))) {
    throw new Error('Usage: node scripts/prepare-local-engine.mjs [--debug|--tauri]');
  }
  if (!args.includes('--tauri')) return args.includes('--debug') ? 'debug' : 'release';
  // Tauri sets true for debug hooks; release hooks can omit the variable.
  // https://v2.tauri.app/reference/config/#buildconfig
  if (![undefined, 'true', 'false'].includes(env.TAURI_ENV_DEBUG)) {
    throw new Error('Unsupported TAURI_ENV_DEBUG value; engine build profile is unknown.');
  }
  return env.TAURI_ENV_DEBUG === 'true' ? 'debug' : 'release';
}
