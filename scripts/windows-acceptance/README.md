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

Primary references:

- [Tauri Windows WebDriver CI](https://v2.tauri.app/develop/tests/webdriver/ci/)
- [Exact driver capability mapping](https://github.com/tauri-apps/tauri/blob/tauri-driver-v2.1.0/crates/tauri-driver/src/server.rs)
- [Edge WebView profile capabilities](https://learn.microsoft.com/en-us/microsoft-edge/webdriver/capabilities-edge-options)
