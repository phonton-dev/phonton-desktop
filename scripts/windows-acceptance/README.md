# Installed Windows Preview smoke

The same harness also supports the explicitly selected `release` profile used
by `Release Desktop`. Profile assertions are strict: standard `Phonton` /
`dev.phonton.desktop` cannot stand in for isolated `Phonton Preview` /
`dev.phonton.desktop.preview`, or vice versa. The installed native app reports
its own name, identifier and version, which must match the candidate manifest.

The separate `Windows Preview acceptance` workflow builds an unsigned, isolated
Preview and tests the installed executable on a fresh Windows Server 2022 runner.
It never creates tags, GitHub releases, updater assets, or website deployments.
Pushing a `2ntt/windows-preview-acceptance-*` branch starts the workflow. Publishing
that branch makes its source and Actions artifacts available under this repository's
access rules. A manual dispatch is also available once GitHub registers the workflow.

The package job builds the exact public commit in `engine-source.json`. Its manifest
records the Desktop commit, engine commit/version, and installer/Desktop/engine
SHA-256 hashes. The second job downloads that exact artifact, checks the hashes,
silently installs it into a fresh path containing spaces, and checks installed bytes.
Desktop identity is taken from the extracted NSIS payload. It must equal the build
output with only Tauri's expected NSIS bundle-type marker applied; the unbundled
hash is retained separately. Embedded engine bytes and manifest must also match.
Artifacts expire after seven days; keep any approved release evidence separately.

The native test uses external `tauri-driver 2.1.0` and a Microsoft-signed EdgeDriver
matching the installed WebView2 build. No test plugin is added to the application.
A dedicated fresh WebView profile is retained across sessions to test persistence.

Checks:

- Actual installed application starts its bundled engine as an owned child; that
  child owns the loopback listener and responds to health checks.
- The native WebView workbench reads the expected engine version.
- Reloading the WebView reconnects to the same owned engine.
- Real native plan review reads disposable source and shows the requested check;
  source/test bytes and Git index stay unchanged, host permission stays off, and
  inference stays disabled without a calibrated model.
- Local models reads the runner's actual hardware state.
- All eleven Settings sections render and identify the selected section. Light
  reaches the actual workbench surface; Graphite is restored. Settings and optional
  online-setup round trips preserve the goal, scope, checks, reviewed plan and
  unapproved execution consent, without restarting the engine or changing files.
- Normal window-close via `CloseMainWindow` ends the app, engine and listener while
  both WebDrivers remain alive. Driver teardown cannot make that assertion pass.
- A new app process restores the selected repository; closing it again cleans up.

Screenshots, candidate/driver identities, process ownership and assertion results
are uploaded as `windows-preview-native-evidence`, including partial failure data.
Four `ui-*` captures show theme and navigation results. These are still images,
not a recorded video or pointer-motion trace.
The installation and native-journey scripts refuse to run on a non-Actions machine;
metadata readers support read-only local package inspection. Syntax checks do not establish
runtime acceptance; only a completed workflow at the recorded source commit does.

Deliberate limits: workspace selection is seeded through localStorage because
WebDriver does not cover the native folder dialog. Silent install does not exercise
prompts, SmartScreen or standard-user elevation. This smoke does not download a
model, calibrate it, perform inference, Apply, reopen a receipt, or roll back. Those
remain separate end-to-end gates, as do consumer Windows, signing, updater and
macOS/Linux acceptance. Screenshots still require visual review.

## Extended model journey

An explicit manual dispatch with `full_journey=true` extends the installed test.
Ordinary pushes keep the quick smoke. Once the workflow has run, dispatch the
reviewed branch through the GitHub CLI or API; check its recorded commit and
`result.json` mode before interpreting the result.

Full mode requires fresh isolated state outside the fixture, free runtime ports,
at least 6 GiB available RAM and 12 GiB available disk. Through the native UI it
sets up the hash-checked managed runtime, downloads `qwen2.5-coder:3b`, requires
digest `f72c60cabf6237b07f6e632b2c48d533cef25eda2efbd34bed21c5e9c01e6225`,
calibrates at 4096 context tokens, and selects a passing edit profile. It never
substitutes a different model or approves an unverified external runtime.

The fixture checks valid, non-digit and out-of-range ports. Full mode observes
the initially failing checks, reviews a fresh model-bound plan, approves host
checks, and runs one bounded goal. It requires authoritative completed evidence,
verified managed provenance, exact model/check identity and unchanged source,
test and Git-index bytes before clicking Apply. Independent checks must then
pass. After normal close and a new native process, the same receipt and applied
journal must reopen. UI rollback must restore original bytes and failing checks.
The managed runtime and its subprocesses must exit with Desktop while both
WebDrivers remain alive.

Full mode allows 20 minutes for setup, 20 for model pull, 30 for calibration and
12 for the goal, within a 100-minute installed-test job. These are acceptance
timeouts, not performance claims. Terminal errors fail the test without retrying
inference until it passes. Evidence includes phase results, source and receipt
identities, independent check output and six additional native screenshots.
Only disposable fixture and runner data are uploaded; model weights are not.
This establishes one model/fixture journey on Windows Server, not general model
quality, native folder-picker coverage, consumer Windows or signed updates.

## Standard release candidate

Manual dispatch of `Release Desktop` builds the standard configurations on
Windows, macOS and Linux, uses the configured updater signing keys, and retains
the bundles as temporary Actions artifacts without creating a release. Windows
uses the pinned engine and its platform configuration, with the standard identity,
deep-link scheme and stable updater endpoint. It is not built with the Preview
override. The full installed journey is mandatory for this profile.

A tag-triggered release runs separate full NSIS and MSI journeys on fresh Windows
Server runners. The publish job depends on both matrix results, all platform builds
and checksums. Before publishing, both downloaded draft installers must match
their own candidate SHA-256. A rebuilt or substituted installer cannot inherit
the earlier test result. Preview remains NSIS-only.

MSI has its own `windows-release-candidate-msi` manifest/payload and
`windows-release-native-evidence-msi` evidence artifact. Its app must match the
raw build with only Tauri's exact MSI marker applied; NSIS bytes are rejected.
Read-only Windows Installer File/Component/Directory metadata maps CAB member IDs
to the actual target paths. Missing, misplaced or ambiguous engine resources fail
before installing. Stage resources using their final basenames: WiX preserves
the source filename even when the resource map specifies a different target name.

The MSI job uses a real quiet installation with `INSTALLDIR` pointing to a fresh
path containing spaces. It disables restarts, requires exit 0, retains verbose
`msi-install.log`, and checks the registered ProductCode, name and version before
the same installed-byte, native app, model, Apply, reopen and rollback checks.
An extraction or administrative install cannot substitute for this journey.

This gate covers a fresh installation on Windows Server and the existing full
model journey. It does not prove stable-to-beta data migration, the native folder
picker, Authenticode/notarization, macOS/Linux installed journeys or actual signed
update installation. Updater signatures and native OS publisher signatures are
different. The new MSI journey must pass in a completed cloud run before claiming
MSI installed acceptance. Stable-to-beta, beta-to-stable and cross-installer
migration are separate from these fresh installs. Beta builds still stay out of
the stable update feed.

Primary references:

- [Tauri Windows WebDriver CI](https://v2.tauri.app/develop/tests/webdriver/ci/)
- [Exact driver capability mapping](https://github.com/tauri-apps/tauri/blob/tauri-driver-v2.1.0/crates/tauri-driver/src/server.rs)
- [Edge WebView profile capabilities](https://learn.microsoft.com/en-us/microsoft-edge/webdriver/capabilities-edge-options)
- [Tauri 2.11.2 bundle marker patch and restoration](https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.11.2/crates/tauri-bundler/src/bundle.rs)
- [Tauri 2.11.2 MSI resource generation](https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.11.2/crates/tauri-bundler/src/bundle/windows/msi/mod.rs)
- [Windows Installer command-line options](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/msiexec)
