# Installed Windows Preview smoke

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
- Normal window-close via `CloseMainWindow` ends the app, engine and listener while
  both WebDrivers remain alive. Driver teardown cannot make that assertion pass.
- A new app process restores the selected repository; closing it again cleans up.

Screenshots, candidate/driver identities, process ownership and assertion results
are uploaded as `windows-preview-native-evidence`, including partial failure data.
The scripts refuse to run on a non-Actions machine. Syntax checks do not establish
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

Primary references:

- [Tauri Windows WebDriver CI](https://v2.tauri.app/develop/tests/webdriver/ci/)
- [Exact driver capability mapping](https://github.com/tauri-apps/tauri/blob/tauri-driver-v2.1.0/crates/tauri-driver/src/server.rs)
- [Edge WebView profile capabilities](https://learn.microsoft.com/en-us/microsoft-edge/webdriver/capabilities-edge-options)
- [Tauri 2.11.2 bundle marker patch and restoration](https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.11.2/crates/tauri-bundler/src/bundle.rs)
