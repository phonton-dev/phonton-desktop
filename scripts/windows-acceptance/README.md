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

## Forward NSIS upgrade

`Accept Windows NSIS upgrade` is separate from the MSI and fresh-install jobs.
It pins public 0.3.4 and the accepted candidate artifact in
`nsis-upgrade-source.json`, checking the downloaded manifest and installer hashes.
Stable installs silently into a fresh path with spaces. The candidate is invoked
with `/S` only: it must discover the saved directory without an injected `/D`.
Both installers require no running Phonton process before they start.

Read-only observations cover both registry views in HKCU and HKLM. The current-user
Phonton registration must update its version and retain the same install location;
conflicting registrations fail. Identical HKCU records across shared views represent
one registration. The saved manufacturer/product directory must also agree.

The real stable app seeds named non-secret preferences, closes normally, and
reopens to prove persistence before replacement. The candidate must retain those
values in the same default native WebView profile before any reseed, then pass the
existing full model/Apply/reopen/rollback journey. This is same-installer forward
replacement on Windows Server, not automatic updater or cross-installer proof.
No authenticated, provider-secret or existing-model-state migration is covered.
The job reuses accepted application bytes and has no release-write permission.

- [Pinned Tauri NSIS template](https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.11.2/crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi)
- [NSIS command-line rules](https://nsis.sourceforge.io/Docs/Chapter3.html#installerusage)
- [Microsoft shared registry views](https://learn.microsoft.com/en-us/windows/win32/winprog64/shared-registry-keys)

## Native repository picker and runtime labels

`Accept native Windows folder picker` reuses the pinned accepted NSIS installer
from `picker-source.json` on its own disposable Windows Server runner. It does
not rebuild the app or change the accepted fresh-install/upgrade workflows.
The exact app is installed with a fresh WebView profile and engine/model state.

Picker mode replaces project-storage injection with the real workbench button.
A bounded Windows UIAutomation helper observes the dialog's native control tree
and captures only the owned dialog HWND. App path/PID, main window, dialog PID and
root-owner chain must agree. It invokes the observed Cancel button, then fills
the visible Folder edit control and invokes Select Folder. Ambiguous controls
fail with evidence; there is no storage/RPC fallback. A second cancel after plan
review must preserve the plan and unapproved consent. Selected project, source,
Git index and owned engine are checked before the usual full native journey.
The PowerShell helper explicitly registers the framework's managed Win32
client-side providers; otherwise native buttons/edits may appear as patternless
panes. Control types and Invoke/Value requirements remain mandatory.
A non-inlined compiled caller avoids the framework's default-proxy stack walk
crashing on PowerShell dynamic frames. This registration repair is separately
reproducible without enumerating or interacting with any application window.

Passive runtime snapshots after model return, receipt completion and receipt
reopen record elapsed time, visibility, focus and visible labels. One fresh
read-only backend status per stage uses the UI's default context. Two consistent
resolved readings are required within65 seconds. A stopped runtime is distinct
from the historical receipt's model; hidden/unresolved states retain diagnostic
evidence and fail this acceptance instead of being called ready.

This covers the English Windows Server dialog and a disposable repository only,
not arbitrary-folder permissions, UNC/symlink paths, consumer Windows, native
macOS/Linux, trusted signing or automatic updater installation. Native dialog
captures require visual review separately from WebDriver's WebView screenshots.

Run [37357919447](https://github.com/phonton-dev/phonton-desktop/actions/runs/37357919447)
passed at harness `7fd5505afab7786064a293d0caf2d6a089553e07`, using the unchanged
candidate `3c9da06048532875b514c438995841a6e24cc05a`. All 27 check records,
52 digest-verified artifact files and 20 individually reviewed screenshots support
this bounded acceptance. Cancel/select, reviewed-plan cancellation, model setup,
Apply, receipt reopen and rollback passed. The first two passive runtime stages
showed the selected model and managed connection across two readings about a
second apart. Reopen instead showed recovery required, matching the stopped
managed runtime's backend state. This establishes truthful labels; it does not
establish recovery and a second coding session after restarting the app.

## Managed runtime recovery after app restart

`Accept Windows runtime recovery` reuses the same pinned NSIS candidate and
native-picker journey, then extends the reopened app after the first rollback.
It requires the actual stopped-runtime recovery state and invokes the visible
Retry runtime setup control. The recovered process must belong to the current
engine, bind loopback only and preserve the selected model digest, measured
profile and storage paths. No second model download or calibration is requested.

A distinct second goal requires fresh host approval, a verified managed-model
receipt, unchanged source and staging until Apply, independent fixture checks
and exact rollback. The first receipt and rollback journal remain byte-identical
throughout. Recovery artifacts have separate names; accepted first-run evidence
is retained. All runtime changes still occur through visible app controls.
This tests one normal-close recovery on Windows Server, not arbitrary process
crashes, conflicting services, moved storage, automatic updates or consumer OSes.

Run [37360046207](https://github.com/phonton-dev/phonton-desktop/actions/runs/37360046207)
passed at harness `b357570ef6725de72bc5bea499d9a35a7d4afa02`, against unchanged
candidate `3c9da06048532875b514c438995841a6e24cc05a`. Its 33 check records,
68 digest-verified files and 27 individually reviewed screenshots establish the
normal-close recovery and second-session flow above. The saved model digest,
complete measured profile, selection and storage paths were retained. The new
managed daemon belonged to the reopened engine; both coding sessions passed
independent Apply checks and exact rollback. The first receipt and rollback
journal remained byte-identical during the second session. Passive labels
settled to the managed connection by the 1-second reading and stayed resolved
at the 5-second reading after recovery. This remains bounded Windows Server
acceptance, with unsigned installers and no automatic-updater installation proof.

## References

- [Tauri Windows WebDriver CI](https://v2.tauri.app/develop/tests/webdriver/ci/)
- [Exact driver capability mapping](https://github.com/tauri-apps/tauri/blob/tauri-driver-v2.1.0/crates/tauri-driver/src/server.rs)
- [Edge WebView profile capabilities](https://learn.microsoft.com/en-us/microsoft-edge/webdriver/capabilities-edge-options)
- [Tauri 2.11.2 bundle marker patch and restoration](https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.11.2/crates/tauri-bundler/src/bundle.rs)
- [Tauri 2.11.2 MSI resource generation](https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.11.2/crates/tauri-bundler/src/bundle/windows/msi/mod.rs)
- [Windows Installer command-line options](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/msiexec)
