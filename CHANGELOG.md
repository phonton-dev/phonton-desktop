# Changelog

All notable changes to Phonton Desktop are documented here.

## [0.2.0] - 2026-06-07

### Added

- Tauri 2 control room with setup wizard (theme, Clerk browser sign-in, CLI install)
- Deep-link auth handoff via `phonton://auth/callback`
- Goal runner shell over `phonton serve` sidecar
- GitHub Releases CI for Windows, macOS, and Linux installers
- Tauri auto-updater with signed update manifests

### Fixed

- Production builds now register the deep-link plugin (auth callback works in release builds)

[0.2.0]: https://github.com/phonton-dev/phonton-desktop/releases/tag/v0.2.0
