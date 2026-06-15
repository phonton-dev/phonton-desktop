# Changelog

All notable changes to Phonton Desktop are documented here.

## [0.2.7] - 2026-06-07

### Fixed

- Windows Scoop: probe executables with `--version` instead of broken `if exist` from GUI shell
- Accept node+phonton.js launcher when npm layout is known but file checks fail
- Vendor binary bootstrap uses verify probes, not existence checks

## [0.2.6] - 2026-06-07

### Fixed

- Bootstrap `vendor/phonton.exe` after npm install when postinstall was skipped
- Scoop: find `node.exe` under `scoop/apps/nodejs/current` (not persist bin)
- Accept node+phonton.js launcher when wrapper exists but native exe is missing

## [0.2.5] - 2026-06-07

### Fixed

- Windows: exe-first CLI launch via `npm root -g` vendor `phonton.exe` (PATH-independent)
- Sidecar startup race on CLI setup step — defer until `ensurePhontonCli` succeeds
- Post-install resolve surfaces actionable errors instead of silent failure
- Offline CLI version fallback set to `0.19.7` (last published npm)

### Added

- Launch spec priority: `exe` → `node`+`phonton.js` → `phonton.cmd`
- Shell permissions for `npm root`, `npm view`, and `win-phonton-run`

## [0.2.4] - 2026-06-07

### Fixed

- Windows Scoop/GUI PATH: PATH-independent `node.exe` + `phonton.js` launcher for verify and `phonton serve`
- CLI setup installs/upgrades to npm latest `phonton-cli` automatically
- Browser auth callback reuses existing window via single-instance deep-link forwarding
- CLI setup step shows explicit error state when install fails

### Added

- `tauri-plugin-single-instance` with deep-link feature; window focus after sign-in

## [0.2.3] - 2026-06-14

### Fixed

- Windows Scoop/npm shim path: use `phonton.cmd`, quoted spawn, sidecar restart on retry
- Setup detects existing CLI before npm install; clearer CLI step phases
- Taskbar/window/NSIS installer icons regenerated from canonical logo
- Setup wizard logo header on all steps; welcome update banner

## [0.2.2] - 2026-06-14

### Added

- Auto-update: signed `latest.json` on GitHub Releases, startup check, Settings manual check
- `createUpdaterArtifacts` in release builds for updater bundles and signatures

## [0.2.1] - 2026-06-14

### Fixed

- CLI install pins `phonton-cli@0.19.7` (npm latest)
- Sidecar uses resolved `phonton` path; delayed until setup CLI step
- Auth `state` validation and improved browser handoff
- OS icons regenerated from canonical Phonton logo

## [0.2.0] - 2026-06-07

### Added

- Tauri 2 control room with setup wizard (theme, Clerk browser sign-in, CLI install)
- Deep-link auth handoff via `phonton://auth/callback`
- Goal runner shell over `phonton serve` sidecar
- GitHub Releases CI for Windows, macOS, and Linux installers
- Tauri auto-updater with signed update manifests

### Fixed

- Production builds now register the deep-link plugin (auth callback works in release builds)

[0.2.3]: https://github.com/phonton-dev/phonton-desktop/releases/tag/v0.2.3
[0.2.2]: https://github.com/phonton-dev/phonton-desktop/releases/tag/v0.2.2
[0.2.1]: https://github.com/phonton-dev/phonton-desktop/releases/tag/v0.2.1
[0.2.0]: https://github.com/phonton-dev/phonton-desktop/releases/tag/v0.2.0
