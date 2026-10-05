# Changelog

All notable changes to Phonton Desktop are documented here.

## 0.4.0-beta.1 — candidate

- [fixed] Query supported AT-SPI interfaces for the native GTK location entry,
  record its identity, and check API availability before cloud compilation.
  Retain compiler caches when later native acceptance fails.

- [fixed] Bind native AppImage mount type and source to the actual packaged
  runtime basename, preserving read-only mount, executable hash and daemon checks.

- [fixed] Wait through an empty loopback proxy connection during Linux native
  driver startup while retaining strict HTTP/JSON checks and a bounded deadline.

- [fixed] Require both chooser PID and title during Linux native acceptance;
  record and recheck window ownership and focus before keyboard input.

- [added] Separate full native acceptance through the exact AppImage, with its
  own packaged executable hash, read-only FUSE mount and daemon identity, normal
  unmount on close, and retained default profile after a fresh launch.

- [added] Cloud acceptance for the exact installed Debian candidate with an
  external local runtime: native repository selection, explicit context consent,
  calibration, verified changes, Apply, retained receipt and exact rollback.
  Keep AppImage and other platforms as separate acceptance gates.
  Read candidate build evidence through GitHub CLI's sanitized log command.
  Select GCC12 for the pinned CLI's native dependency on Ubuntu22.04 and retain
  compiler identity plus a compile-only FP16 capability probe in cloud evidence.

- [fixed] Check rendered diagnostic visibility during native recovery acceptance;
  closed disclosures may retain nonzero layout dimensions. Keep separate checks
  for expanded text, compact viewport clipping and closing the disclosure again.

- [fixed] Offer installation from Settings when an update is available, with
  progress and retry. Setup and Settings now release their controls if a checked
  update is withdrawn or unavailable before installation starts.
  Keep progress across navigation and exclude installation from active or unknown
  engine work, pending changes and new Desktop mutations.

- [changed] Lead local-runtime recovery with a clear action and readable guidance.
  Keep the exact diagnostic in expandable Technical details; blocked storage and
  unverified-service checks keep their existing gates.

- [added] Separate cloud acceptance for restarting a saved managed runtime through
  the native recovery control and completing a second verified coding session.

- [fixed] Load Win32 UIAutomation providers explicitly in native picker acceptance
  so real button/edit controls expose their required Invoke/Value patterns.

- [added] Separate cloud acceptance for real Windows repository-dialog cancel and
  selection, plus timed runtime-label observations through the full native journey.

- [added] Separate cloud NSIS forward-upgrade acceptance, checking discovery of
  the existing install folder, current-user registration and retained preferences
  before the full native model, Apply, reopen and rollback journey.

- [added] Separate cloud MSI upgrade acceptance from public 0.3.4 to the exact
  tested beta installer, with default-profile preference retention checked before
  model setup and the full native Apply/reopen/rollback journey.

- [fixed] Hold public tag releases from this source until trusted publisher signing
  and release acceptance are implemented and verified. Manual cloud candidates
  remain available; the hold is not a native-signature verifier.

- [fixed] Stage local-engine resources with their installed filenames so MSI
  includes `phonton.exe` and `manifest.json`, matching NSIS and the runtime loader.
- [added] Separate exact-byte MSI packaging checks and a full installed Windows
  journey on its own cloud runner, including installer logs and product registration.

- [fixed] Give Settings an explicit theme foreground so Light appearance keeps
  titles, navigation and theme labels readable. Installed acceptance now checks
  these text colors as well as navigation and draft preservation.

- [fixed] Keep the Local models return bar outside the scrolling content so
  scrolling to model actions cannot place them underneath the navigation.

- [fixed] Keep workspace navigation and runtime status visible while long plans
  and receipts scroll. Keep the Local models return control reachable, support
  keyboard scrolling, and start new goals and saved runs at the top of the review.

- [fixed] Installed full-journey acceptance waits for Run to become enabled
  before clicking once; readiness delays cannot silently discard the action.

- [fixed] Installed navigation acceptance waits for the asynchronous machine
  evidence directory before each full-plan snapshot; strict draft, plan
  and consent comparisons remain unchanged.

- [changed] Add a focused workbench, persistent workspace navigation, and a
  shared Graphite appearance across local models and settings.
- [fixed] Preserve drafts and sessions across navigation, synchronize selected
  repositories, and refuse hosted or workspace-configuration actions when the
  engine directory does not match the selection.
- [fixed] Make offline settings recoverable, keep history reachable in narrow
  windows, and distinguish a saved cloud token from an active sync connection.
- [fixed] Use explicit navigation labels in installed acceptance; cover all settings
  sections, theme propagation and draft/plan recovery across optional online setup.
- [fixed] Stop automatic update checks and discard late prompts when the online
  workspace is hidden; welcome-screen update checks are now explicitly requested.

- [fixed] Give the Windows MSI its required numeric version `0.4.0.1` while
  retaining `0.4.0-beta.1` in the app and release assets; preflight rejects stale
  MSI metadata and out-of-range versions before platform compilation.

- [added] Manual release-candidate builds for all platforms without creating a
  tag or release; the standard Windows NSIS package runs the full installed journey.
- [fixed] Release publication requires installed Windows NSIS acceptance and
  checks that the draft NSIS installer is byte-identical to the tested candidate.

- [fixed] Refresh compatible Rust dependencies for published advisories in
  Rustls, Quinn, Anyhow and Event Listener; update plist to use patched Quick XML.
- [fixed] Windows acceptance compares installed Desktop bytes with the NSIS
  payload and verifies Tauri's exact bundle-marker change from the raw build.
- [added] Explicit extended Windows acceptance for managed model setup,
  calibration, verified edits, Apply, receipt reopen and original-byte rollback.

- [fixed] Refresh vulnerable build-tool dependencies in the npm lockfile:
  Browserslist, baseline-browser-mapping, PostCSS and Nano ID.

- [added] Separate Windows Preview CI smoke for installed bytes, native plan
  review, owned-engine reconnect, normal close and workspace persistence.

- [fixed] Release packaging accepts Tauri's omitted debug flag and bundles the
  release engine; invalid flag values still fail closed.

- [changed] Larger interface text, a compact workbench header and a goal composer
  visible at laptop height. Recent runs and machine details expand on demand.
- [changed] Model setup puts installed models ahead of optional machine details.
- [fixed] Receipt counters show recorded values immediately and label missing
  evidence as a lower bound or not reported. Live changes to
  the reduced-motion preference stop decorative timers.
- [fixed] Partial check evidence has its own label instead of saying no tests ran.
- [fixed] Receipts name API cost and runtime provenance without claiming zero
  total operating cost or assuming any loopback service performs local inference.
- [fixed] Release tags must match all package versions; prereleases stay out of
  the stable update manifest.


- [changed] Ink & Photon redesign of the local workbench and Local models:
  an ASCII φ drawn from the logo's own pixels, a loop track
  (goal → plan → edit → verify → review → remember) with a moving photon,
  a receipt card that displays exact counts and stamps what the evidence supports, plan
  rows (EDIT / CHECK / MODEL / BUDGET), colored diffs, model cards with
  measured stats, and VRAM/RAM gauges. Long evidence is folded, not removed.
- [added] The header shows the run record (verified runs and streak) read
  from `phonton serve` (`record.read`).
- [changed] Check commands display as command lines; arguments with spaces
  stay quoted exactly. Run repositories no longer show the `\\?\` prefix.
- [fixed] The bundled verifier accepts a colored direct pytest pass and no
  longer treats `-m pytest` after a Python script as a direct runner command.
- [fixed] The bundled worker keeps edited Python source unverified when a
  passing direct check never executes every edited `.py` file. Missing trace
  evidence adds Not run, and older Python reviews must be rerun before Apply.
- [fixed] Local model actions use the endpoint and managed folder shown at the
  time of the click. If a separate CLI changed either setting, the engine
  rejects the action before starting it and Desktop refreshes its status.
- [fixed] The bundled worker keeps JS/TS edits unverified when a passing direct
  Node test did not load each edited source file from the candidate. Passing
  checks now save matched paths; older JS/TS reviews must be rerun before Apply.
- [added] Saved local runs sum runtime-reported input and output tokens across
  strategy and edit replies, label missing counters as lower bounds, and show
  repair and baseline-restart counts beside the existing resource ledger.
- [fixed] A malformed local edit can use the last allowed model call for a
  direct baseline retry when a separate strategy restart would exceed budget.
- [added] Saved local goals show the exact model digest, runtime version and
  endpoint, plus the machine's point-in-time RAM/VRAM admission snapshot.
- [fixed] A background model-status refresh no longer silently cancels an
  in-progress Run preflight; Run uses its own fresh status result.
- [fixed] The bundled local verifier keeps a Rust candidate unverified when
  Cargo passes tests but compiler and active-module evidence cannot include an
  edited file.
- [fixed] The bundled local search recognizes JSON-escaped Windows candidate
  paths in failed checks, so an unchanged repair failure restarts from baseline.
- [fixed] Local models refreshes installed and selected-model status after an
  already-completed operation is recovered on page load, idle polling, or a
  failed start response, so Select reflects newly saved calibration.
- [fixed] Local models restores up to eight exact tags and endpoints of
  unconfirmed install requests after engine restart. It checks installed
  inventory and offers a same-endpoint retry only when a model is absent.
- [fixed] Local models shows an incomplete calibration attempt and completed
  probe outputs after interruption or engine reconnect, separate from any
  selectable profile.
- [fixed] The bundled local runner refuses direct pytest checks whose captured
  relevant config can run original-repository tests or imports, and stops
  strategy or edit inference when preparation consumes the shared wall time.
- [fixed] Completed local goals recheck saved candidate bytes and diff on
  reopen or terminal status. Changed evidence removes the verified selection
  and keeps Apply unavailable.
- [fixed] Local search stops before a repair model call when the remaining
  approved-host check budget cannot verify every selected command and any
  preparation for its candidate.
- [fixed] Reopened local runs retain a candidate's pre-check diff and hash when
  verification is interrupted, label unfinished checks Unavailable, and keep
  Apply blocked.
- [fixed] Windows Local models hardware status reads physical RAM through the
  shared engine's native OS probe even when optional CIM CPU detection fails.
- [fixed] Local models and the goal composer recognize equivalent Ollama
  default-library names for a selected calibrated model, while duplicate
  inventory aliases keep Run unavailable.
- [fixed] The local composer refreshes and expires model readiness, rechecks
  status on focus and before Run, and compares the complete calibration profile
  fingerprint with the reviewed plan. A stopped runtime or same-model
  recalibration cannot pass its preflight.
- [fixed] The shared local runner keeps trailing baseline and candidate check
  failures in bounded feedback, splitting the budget across stdout and stderr.
- [fixed] Catalog Download recognizes installed Ollama aliases, so an existing
  model is not offered again under a different library, host, or `:latest` spelling.
- [fixed] Local goal planning and source retrieval recognize camelCase and
  snake_case variants of parsed symbols, preferring exact matches.
- [fixed] Mixed Apply reports a creation-path recheck error separately from an
  already-published target while retaining its prepared recovery journal.
- [fixed] A successful `cargo run -- test` now appears as diagnostic Not run
  evidence instead of making a local candidate eligible for Apply.
- [changed] Local models can deselect the active model while its runtime is
  offline, retaining downloaded weights and calibration. Removal remains a
  separate explicit action.
- [fixed] Local models shows managed-storage recovery even while Ollama is
  offline and withholds setup when the saved folder identity or a redirected
  path is blocked. The engine marks safe missing or stale regular launch
  receipts as retryable once the port is free; interrupted owned download
  stages remain retryable.
- [fixed] The bundled local search controller keeps a repaired candidate when
  a selected check gains a pass or a generic failure moves to another check,
  and restarts if a pass is lost without either signal.
- [fixed] The local goal composer and footer no longer imply loopback inference
  is connected while engine status is loading or the model runtime is offline.
- [fixed] Successful commands that do not run a supported candidate test or
  candidate-local script show as diagnostic Not run evidence, so version and
  status checks cannot qualify a local change for Apply.
- [changed] Local models allows calibration retry when cold loading does not
  fit but the exact model is already loaded. The engine checks RAM, context and
  residency before every probe; the page keeps the cold-load estimate labeled.
- [fixed] Local goal review refuses checks with paths outside the candidate
  copy, including parent-relative paths, rooted arguments and file URLs, so
  direct paths to untouched files cannot claim candidate verification.
- [fixed] Local goal review now warns and disables Run when the selected model's
  installed digest, runtime version or context no longer matches calibration.
  Start rechecks before saving attempt evidence.
- [fixed] Expected-failure-only Python `unittest` checks now show **Not run**
  in local goal receipts and cannot qualify a candidate for Apply. A mixed
  suite with an ordinary passing test remains eligible.
- [changed] CLI and Desktop now share model-specific disk planning before
  managed runtime setup, including the catalog first-try model, so a drive
  that fits setup but may not fit the model is visible before storage becomes
  fixed.
- Windows Desktop now attaches its suspended bundled engine to a kill-on-close
  Job Object before it can serve requests, so closing or crashing the app
  cannot leave that child owning the local engine port.
- The shared engine now confirms a model disappeared from installed inventory
  before reporting removal or discarding its calibration.
- Shared model downloads now require a terminal Ollama success event and a
  matching installed inventory digest and size before Local models reports
  completion.
- Explicit direct Python `pytest` and `unittest` checks now refuse
  repository-root runner shadows, including attached module flags and common
  Windows launcher forms.
- The local workbench accepts up to four separately reviewed verification
  commands, one JSON array per line. Editing them keeps the verification panel
  open and clears the prior plan and host-execution approval. Plan and receipt
  show exact argument boundaries before and after execution.
- Reviewed multi-file SearchReplace goals now show a scaled implicit call,
  check and output budget from the shared engine, with warnings when caps
  cannot cover the full straight sequence.
- Advanced custom model downloads now use the same explicit `:latest` identity
  as the CLI and installed inventory when a tag is omitted, so the downloaded
  model can be calibrated and selected after refresh.
- The shared model engine now refuses ambiguous removal aliases and keeps an
  active model protected when its name is entered in another equivalent form.
- An interrupted managed-runtime download can be retried from Local models even
  when its Phonton-owned partial stage temporarily puts the drive below the
  setup reserve. The engine retires only owned stages and rechecks free space.
- A stale managed-runtime identity now shows a recovery action in the local
  workbench and blocks Run instead of offering consent that the engine cannot
  honor. Missing-receipt and external runtimes retain their explicit consent
  path where the engine permits it.
- Ordinary existing-file goal plans now label scoped source as EDIT,
  matching the worker's edit authority; creation plans keep context-only source
  labeled READ.
- Local models now shows the thinking request used during calibration.
  The bundled engine reuses that measured request setting for coding goals;
  a runtime that rejects `think:false` can still pass the default-mode probes.
- The local composer now lists recent saved runs with one-click reopening after
  **New goal**. A run ID still opens older evidence when the bounded list omits it.
- Reconnecting after a Desktop view reload now reuses a running bundled engine
  when it still owns the loopback listener, preserving in-flight model
  operations. A child still binding its listener is also retained; an
  unrelated listener cannot cause Phonton to replace its tracked child. The
  same view can recover its exact model-operation cancellation ID. Project
  switching checks active model steps, local runs and engine-side goal
  sessions before restarting; an uncertain live engine is left running. Opening
  online setup also reconnects without automatically stopping the local engine.
  Shell-started engines clear their stale process handle on exit, allowing a
  later Retry connection to start a replacement.
- Local goal plan previews now have a 180-second Desktop transport deadline,
  matching other read-only discovery calls. Apply and Rollback have a bounded
  600-second deadline for large verified snapshots. If a mutation reply is
  lost, the workbench checks its saved journal and requires an explicit status
  recheck before a guarded retry of an unconfirmed result.
- The bundled local engine now rejects Rust candidates that leave inline test
  text unchanged but disable or shadow those tests before verification.
- New or unfinished managed runtime setup now shows the exact measured storage
  shortfall before download. It points to the empty-folder picker while the
  current folder remains changeable; otherwise it explains that space must be
  freed on that drive. Setup stays disabled until a refreshed reading meets
  the installation reserve.
- Opening Local models clears a reviewed goal plan and its permissions, so a
  changed model requires a fresh plan before Run appears again.
- A slow metadata read during status refresh now leaves a selected model's
  digest/version-valid calibration visible with a warning in Local models and
  the workbench; execution still checks current model metadata before inference.
- Local models now shows a recovery alert when a responding Ollama service
  cannot be bound to its saved managed launch, with stop, reconnect and refresh
  steps. Setup no longer appears successful in this state, and model downloads
  are disabled until recovery. An unused folder with changed identity offers a
  new storage choice; external-run evidence alone does not trigger launch recovery.
- Local goals now ask separately before sending source context to an unverified
  loopback service. Receipts show runtime origin, and Desktop requires the
  updated engine run capability before enabling this flow.
- Packaged Windows Desktop now refuses local health/RPC replies unless its live
  bundled engine owns the exact loopback listener before and after the request.
- The Desktop composer can review a goal's source and proposed checks before a
  model is selected; a fresh calibrated-model plan is still required to run.
- Local storage now shows the coding-run evidence path alongside runtime and
  models. New snapshots and checks use the chosen folder; older saved runs
  remain accessible. A Windows space check refuses insufficient run storage
  before inference without claiming to bound build outputs.
- The local storage chooser remains available while an external Ollama is
  connected, when Phonton's managed folder has not yet been used.
- Local models now shows the planned managed runtime and model folder with
  free space and lets users choose an empty local-drive folder before setup.
  Existing managed files keep their current location. A claimed folder must
  match its saved drive and directory identity before setup or download.
- Saved local runs now show their target repository. Apply and Rollback stay
  unavailable while another project is selected; users can switch explicitly
  to the run's repository. The engine checks canonical paths for the UI and
  again before mutation, so equivalent path aliases remain usable.
- Local models now distinguishes a verified Phonton-managed model store from an
  external or stale service and shows measured free space only for the former.
  Managed downloads check the requested manifest and reserve before pulling.
- The shared local runner now refreshes runtime version, model digest, installed
  size and current memory fit before each strategy/edit call. A call is refused
  before inference reservation if identity changed or neither cold fit nor exact
  resident evidence admits it.
- Local models now uses the shared engine's managed-setup capability. When that
  capability is absent, it shows official Ollama installation and local endpoint
  guidance instead of a setup action that the engine would reject.
- Managed setup distinguishes an already responding, unverified Ollama service
  from one Phonton started after checking the listener owner. Runtime setup
  measures free space on its own installation volume.
- The model page now describes its loopback connection without claiming a
  separately running service's process settings. Managed setup refuses a
  nonresponding occupied port before download and linked store/log paths.
- Shared Apply now requests file and directory sync for recovery backups,
  creation anchors and journals before touching project source, then syncs
  changed project directories before acknowledging Apply or rollback. A later
  sync failure retains a nonterminal journal; full power-loss recovery remains
  unproven. Mixed Apply also syncs the new name before existing-file edits;
  mixed rollback syncs restored names before its deletion marker.

### Added

- Shared calibration now prefers a transport that can both edit and create
  files when the installed local model passes both format fixtures.
- Local models now shows unusable Ollama inventory entries as diagnostics
  while retaining valid models and download actions.
- Cost and frontier-savings surfaces now label table-priced dollar figures as
  estimates, including when a model rate is registered.
- Local models Browse now uses concurrent live manifest lookups through the
  shared engine, preserving row order and per-model lookup errors.
- A blank existing-source field in a new-file plan now searches for matching
  read-only context and reports when the creation prompt has none.
- Plan suggestions no longer fill blank source/check inputs as explicit
  overrides; changing the goal or scope clears prior host-check approval and
  releases a superseded plan-preview spinner.
- Guarded Windows **Remove created file** action for witnessed, applied
  single-file creations, with explicit resume after a recorded deletion attempt.
- Applied combined create-and-edit changes can now restore original existing
  source and remove the witnessed new file on Windows, with guarded recovery
  from exact partial restore states.
- Saved failed or stale calibration probes remain inspectable in Local models,
  separate from a selectable profile. Completed calibrations with no passing
  edit format now say editing is not ready rather than operation finished.
- A first model to try in the Local models catalog when live manifest size and
  observed memory support a 4K cold-load fit, with the resource-only basis
  shown beside the entry. No hint appears when those observations are missing.
- Browsing models now displays the hardware snapshot used for its fit estimates
  beside the catalog, separate from installed-model status readings. Refreshing
  machine readings clears the previous catalog.
- Local workbench connection now requires catalog snapshot support up front, so
  an older responding engine prompts for upgrade before Browse.
- The local composer now reviews separate CREATE, EDIT and READ paths for a
  goal that adds a file and updates existing callers. Staged creation is shown
  as incomplete; a combined verified diff uses guarded recoverable Apply.
- Local plans show the exact offline npm setup and test commands when a root
  lockfile supports dependency preparation; review distinguishes setup from checks.
- Local run review shows source-anchored baseline restart proposals,
  including the claimed difference, raw reply and exact source context.
- Local plan preview now discovers module-style JS/TS files and proposes a
  separately approved Go check for scoped source in a root Go module.
- Inferred checks now follow the editable language and avoid unrelated root
  suites for nested Go/Node packages or mixed scopes. Rust member checks use
  their manifest, and conventional Node test files are protected from edits.
- Recoverable managed Ollama setup through the shared CLI engine. Interrupted
  Phonton-owned downloads and extraction can be retried without replacing
  unknown content.
- Advanced local Ollama origin control with loopback validation, an honest
  disconnected state, and selected-model reset when the origin changes.
- Automatic per-model calibration context and context-labeled cold-load fit,
  with an explicit Advanced override and a missing-evidence state.
- Separate new-file format calibration evidence and a composer warning when it
  is failed, unavailable, or absent from an older profile.
- Local composer can name one absent, untracked file to create. The plan shows
  its absence, existing files remain read-only context, and guarded apply uses
  a recoverable no-replace creation journal.
- Windows x64 local preview packaging with a matching bundled CLI, checked engine
  hash, application-owned proxy, separate application/deep-link identity and no
  production update endpoint.
- Separate Git staging integrity evidence, including observation stage and hashes.
- Local model setup, real downloads, hardware fit and measured calibration shared
  with the CLI engine.
- Sparse local goal composer with a visible plan, explicit execution permissions,
  live candidate diffs, check evidence, tokens and interrupted-run recovery.
- Expandable exact source context for each candidate, with line ranges, selection
  reasons, omitted-source counts and conservative context admission bounds.
- Search decision reasons, repair parents and the exact bounded feedback sent to
  the model. Complete rejected outputs remain inspectable when feedback is shortened.
- Repository scope and check proposals from the goal, with source-bound plan
  review. File/check overrides remain available and host approval stays separate.
- Explicit apply of the complete selected verified changed-file set, with
  source/index rechecks, per-file original-byte backups and a versioned recovery
  journal. Saved runs can also be reopened by ID.

### Changed

- Model status validates the selected profile against the current digest,
  endpoint and runtime version before offering it as ready.
- Native startup waits for the tracked engine process and loopback RPC before declaring it
  offline. The local workbench requires advertised model and coding-run APIs;
  an older engine is shown as incompatible instead of failing later in the flow.
- Model inventory errors remain visible when Ollama answers version requests but
  cannot list models. The composer waits for a confirmed calibrated selection.
- Local composer and model manager replace raw browser fetch failures with a
  clear engine connection message and an explicit reconnect action.
- Opening a project no longer grants workspace trust automatically. The older
  provider-backed goal runner shows an explicit Trust project action; MCP actions
  remain denied by default, and Run goal waits for stored trust.
- A goal that stops before its first receipt restores its saved goal, model and
  exact failure after an engine restart. Abrupt stops remain distinct from
  preflight refusals. A lost start response retains the client-selected run ID;
  unreadable records offer retry instead of being labeled as an early ending.
  A start refused before any evidence exists keeps the reviewed plan editable.
- Missing saved receipts show an explicit recovery state with retry and new-goal
  actions instead of an indefinite restoring indicator.
- Local startup is available without account setup or automatic online downloads.
- Removed external font requests from startup.
- Keep the saved-run loading state visible during recovery so a late receipt
  cannot replace a newly opened composer.
- Clarify first-attempt descriptions and singular candidate/check counts in receipts.

### Fixed

- Standard Windows x64 Desktop builds now prepare and bundle the matching local
  engine and manifest, as the separate preview build already did. The packaged
  app refuses missing or changed engine resources instead of silently falling
  back to an independently installed CLI on first use.
- Standard Windows packages now restrict native engine launch and RPC to the
  tracked bundled engine. Release CI requires a pinned public CLI source,
  collects assets as drafts, and publishes only after all platforms and
  checksums succeed.

- The plan approval text now shows the actual submitted model, check/setup,
  output-token and time limits instead of a stale fixed check count.
- Apply now names passing selected checks rather than suggesting a change is
  broadly verified; receipts retain a Cargo package-only coverage limit.
- A completed local goal remains reviewable after reopening because the shared
  engine saves a success end receipt before offering Apply.
- Shared local plans warn when an explicit check budget cannot complete baseline
  and candidate verification; host approval refuses it before running checks.
- Local goal review readiness now follows final identity checks; a stopped
  finalization or legacy prematurely ready receipt reopens as Interrupted.
- The shared engine accepts Rust production edits before a protected inline-test
  tail while refusing edits to that tail before running checks.
- Local model selection and removal no longer offer Cancel after dispatch;
  the shared engine waits for the result. Setup, install and calibration keep
  cancellation with an explicit refresh warning. Installed-model status reads
  now prioritize the selected model within one bounded metadata budget.
- Local models discovers operations started by another client while the page is
  idle and refreshes operation state after a rejected start. Managed setup retry
  waits for a prior archive hash handle before cleaning its download stage.
- Created-file Apply recovery in the shared engine now requires the retained
  published file identity. An identical later replacement is refused, and a
  cross-volume repository can retain its anchor in ordinary local Git metadata.
- Windows guarded Apply now holds existing changed-file parents through the
  shared engine's replacement step, including mixed new-file goals.
- Windows approved project checks now join their process cleanup job before
  starting and stop descendants when the direct check exits or is cancelled.
- The shared local runner can now repair a checked new file after a failed
  creation or combined create/edit attempt, then rerun the complete check
  within the original search budget.
- Older saved local reviews without final Git index integrity proof now show
  why Apply is unavailable. Starting a new goal clears the previous goal's
  existing-edit scope.
- The Local models page now follows the ID returned by a model operation. When
  another client replaces it, the page shows that activity without treating it
  as the original result or offering its Cancel action. Running external work
  keeps conflicting controls disabled. A newly accepted operation remains
  cancellable through a transient status-read failure, and errors stay visible.
- All-skipped Python `unittest` checks and successful exits without a runner
  summary now show **Not run** instead of passing verification on exit 0.
- Direct Node test checks and simple root npm scripts invoking `node --test`
  show **Not run** when no named test completed, even if Node exits 0.
- Inferred root npm scripts with no supported test runner are withheld. An
  explicitly selected opaque script keeps its output but cannot verify a
  candidate through exit 0 or printed test-like text alone.
- Packaged Desktop model catalog and status requests now have a bounded longer
  deadline for slow hardware and registry probes; other RPC calls keep their
  short deadline.
- Cargo compile-only, list-only and zero-test checks now show **Not run**
  evidence instead of a passing verification result.
- Go checks now need uncached JSON evidence of a completed named leaf test;
  plain summaries, skipped-only or cached suites, and non-executing modes show
  **Not run** after exit 0.
- Cancel during local-goal startup now stays attached to the new run ID and is
  sent after the engine accepts that run. The button shows the pending request
  instead of accidentally cancelling an older saved run.

## [0.3.4] - 2026-08-29

### Changed

- App icon, window icon, and NSIS installer art use the pixel phi mark.

## [0.3.3] - 2026-08-29

### Added

- Economics strip: task, models, cost, verification, saved vs frontier
- Provider-key setup step (local BYOK, doctor probe)
- Idle strip copy: "Run a goal to fill cost and checks."

### Changed

- Side panel is files and checks only; cost stays on the strip and Receipt tab
- Browser preview documents that it cannot spawn `phonton serve`

## [0.2.9] - 2026-06-07

### Fixed

- Windows: native Rust spawn of vendor `phonton.exe serve` (bypasses cmd/phonton.js chain)
- Shell serve fallback always uses enriched PATH
- Setup CLI step sidecar bootstrap race (stale `refreshSidecar` closure)
- Sidecar errors distinguish spawn failure from ping timeout

### Added

- `spawn_phonton_serve` / `stop_phonton_serve` Tauri commands
- `checkServeHealth()` and longer bootstrap ping window (60s)

## [0.2.8] - 2026-06-07

### Fixed

- Scoop: run CLI probes with enriched PATH (`where node`, `phonton.cmd --version`)
- phonton.cmd fallback when direct node.exe resolution fails
- Sidecar serve applies PATH prefix for cmd launcher

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
