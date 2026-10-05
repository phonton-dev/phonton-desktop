# Windows MSI upgrade acceptance

`Accept Windows MSI upgrade` is a separate disposable Windows Server job. It does
not rebuild the app, replace fresh-install checks, sign or publish a release.
The workflow has read-only repository permissions and reuses the exact accepted
MSI candidate recorded in `scripts/windows-acceptance/upgrade-source.json`.
Expired or mismatched artifacts fail before either installer executes.

The job verifies the public 0.3.4 MSI digest, installs it, checks its registration
and real native app identity, then seeds named non-secret fixture preferences in
its default WebView storage. The theme is rendered in the real stable app; project
preferences are test fixture state, not evidence of an authenticated stable session.
The app closes normally before the candidate MSI installs in place. There is no
uninstall, profile clearing or preference reseed between the two installations.
An unchanged stable app must first retain those preferences across a new process.
The harness launches each app directly and attaches EdgeDriver through a
cloud-only, loopback debug port; letting EdgeDriver launch the app was observed to
create a different temporary profile for each session. No data-directory override
is supplied. Owned WebView process paths must lie under the app's normal LocalAppData
directory and match across stable restart and upgrade; page origins must match too.

Acceptance requires the same UpgradeCode, distinct ProductCodes, a forward MSI
version, removal of old registration and exact candidate app/engine bytes. The
upgraded native app must retain and render the Light theme and selected fixture
repository, retain the recent-project list and preserve a unique storage sentinel.
These checks run before the full native model/calibration/Apply/reopen/rollback
journey and before any fixture preference write. Repository source and Git index
must remain unchanged by the upgrade. New engine/model state starts empty.

Evidence includes both MSI metadata tables and install logs, source/artifact
identities, stable seed record, upgraded registration and hashes, native results,
screenshots, receipts and independent Python verification. A passed workflow is
functional evidence; screenshots still require human or agent visual inspection.

This covers MSI 0.3.4 to the pinned beta on Windows Server, with explicit fixture
preferences only. It does not cover consumer Windows, authenticated account or
provider-secret migration, existing model-state migration, native folder picker,
NSIS or cross-installer upgrades, beta-to-stable ordering, automatic updater
installation, macOS/Linux runtime or trusted publisher signing. Public-release
policy remains blocked. No credentials are entered or migrated by this test.
