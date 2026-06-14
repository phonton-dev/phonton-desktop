# Changelog

All notable changes to Phonton Desktop are documented here.

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
