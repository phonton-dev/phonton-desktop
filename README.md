# Phonton Desktop

Private desktop shell for Phonton.

Settings buttons use contrasting accent foregrounds in Graphite, Cursor Dark,
Light and High contrast, including their hover states.
Settings fields have associated labels, theme and configuration-scope choices
expose their selection, and local run, file-change and Doctor outcomes have concise
screen-reader announcements. Model actions identify the model they affect.

The unreleased local workspace now opens without an account. Its dark monospace
composer shows repository, selected local model, explicit file scope and execution
permissions. Model management and candidate execution use the same core as CLI
`models` and `goal --local`; use a CLI built from this branch for these methods.
The shared runner keeps bounded, marked start/end excerpts of failed check logs
in receipts. Baseline and repair feedback retain trailing stdout and stderr
failures within a smaller budget; omitted middle output is not searchable.
The composer and footer distinguish a connecting engine, unavailable runtime,
managed recovery, and a connected managed or unverified loopback runtime. A
status that has not loaded yet does not claim that inference is available.
The shared runner refreshes runtime/model identity and current memory fit
before each local strategy/edit request; a new low-memory condition requires
the exact resident model and host headroom before inference is reserved.
The local workbench checks that the connected engine advertises both local model
and coding-run APIs, including a separate creation capability for explicit new
files and the context-aware model status schema. On native startup it waits for
its tracked engine process and loopback RPC to answer before showing an offline
state. On packaged Windows builds, the proxy also checks that the tracked child
owns the exact loopback listener before and after requests. This point-in-time
PID check is not authenticated transport. Model inventory failures are shown
separately from an empty model list.
Incomplete Ollama inventory rows appear as diagnostics while valid installed
models and catalog downloads remain available. Selection still uses current
digest-bound calibration evidence.
A model download is reported complete only after Ollama's terminal success
event, a matching installed inventory row with digest and size, and a metadata
read. Progress alone does not make a model selectable.
On Windows x64, normal Tauri builds and `npm run tauri:build:local` both build
the matching CLI from the adjacent `phonton-dev` source and bundle it with a
SHA-256 manifest. Build preparation checks that the CLI exposes the local-model
status contract. A packaged Windows build refuses a missing or changed engine
and only starts that verified bundle through its native engine command;
the proxy also checks that the tracked child owns the exact IPv4 loopback
listener before forwarding requests and after replies. This is a point-in-time
owner check, not an authenticated or race-free channel. The hash detects
mismatched resources, not publisher authenticity. The separate
**Phonton Preview** NSIS package has no updater artifacts or publishing step.
On Windows the spawned engine is assigned to a Desktop-owned kill-on-close Job
Object before it starts. Closing or crashing Desktop ends that engine instead
of leaving an orphan on the local port; reloading the view within the same app
keeps its tracked engine and operations. A hard stop can interrupt active work,
which must be reviewed from saved run evidence after reopening.
On Unix, the launch shell replaces itself with the CLI so Desktop tracks the
engine directly. Normal close stops that owned CLI; a separately started Ollama
runtime remains independent. Installed Linux lifecycle acceptance is still pending.
For an iterative unsigned debug preview, run
`.\node_modules\.bin\tauri.cmd build --debug --config src-tauri/tauri.local.conf.json --no-sign`;
the build hook prepares the debug engine automatically. A standalone Desktop
checkout without matching sibling CLI source cannot produce a Windows local
bundle. macOS and Linux builds still require a separately installed compatible
CLI; their local first-use path is not yet packaged.
When the connected engine does not advertise managed runtime support, Local
models links to the official Ollama installer and explains how to start it and
refresh the local endpoint. The managed runtime action follows the engine's
reported capability, currently Windows x64, rather than browser platform text.
Local models shows the exact managed runtime, model, and new coding-run evidence
folders, free space on their drive, and a native picker for an existing empty
dedicated folder while that choice is still available, even when a separate
Ollama is connected. CLI and Desktop share the saved choice. Choosing a folder does not
move an existing runtime or old saved runs, or attest to an external Ollama
service's store.
Before a new or unfinished managed setup, Local models compares the drive's
measured free space with the runtime's install and extraction reserve. If it is
too low and the location is still changeable, setup is disabled until you free
space or choose an empty folder on another drive. A used location keeps Retry
available after an interruption: setup retires only Phonton-owned incomplete
stages, rechecks space, and stops if the reserve is still short. Downloaded
model weights need additional space.
Before fresh managed setup, Local models warns that the storage choice becomes
fixed once used and invites a catalog browse. For each manifest-backed entry,
it shows the shared engine's conservative drive allowance that adds the runtime setup reserve,
reported model size, and managed pull reserve. If the first-try model exceeds
current free space, the setup area recommends a roomier folder or a smaller
model. This is planning guidance, not a guarantee: registry sizes and free
space can change, and the engine rechecks each download at admission.
If a saved managed runtime or storage identity cannot be verified, Local models
shows recovery steps even while Ollama is offline. A blocked folder identity
withholds setup until the warning clears: reconnect the original folder if it
moved, then refresh. If the folder is valid and a missing or stale regular
launch receipt is eligible for replacement, Desktop offers **Start runtime**
for an installed runtime, or **Retry runtime setup** for incomplete setup, once
the managed port is free. The recovery panel leads with the next action and
keeps the exact diagnostic under **Technical details**. Phonton does not stop an unverified process;
setup rechecks the saved root and path safety, plus model-store identity when
a valid receipt still records it. Managed
downloads remain unavailable during recovery. An
interrupted owned download stage can also retry setup. External coding-run
evidence alone does not make a chosen folder a past managed launch.
Public tag releases from this source are blocked by `scripts/publication-hold.mjs`
before any draft is created, with a second check immediately before publication.
`release-policy.json` records outstanding trusted Windows/macOS signing,
signed-binary provenance and installed platform/update acceptance requirements.
This is a publication hold, not a signing verifier. A policy toggle or bypass
field cannot unlock it; a reviewed native verification implementation must replace
the hold before public beta. Tags targeting older commits are not protected by
this source-level check; repository-wide tag protection is a separate control.

The release workflow requires a published CLI commit and matching version in
`engine-source.json`. CI checks out that exact source for Windows. The retained
publication path requires all builds, checksums and both full installed Windows
NSIS and MSI journeys. Each draft installer must match the candidate accepted by
its own journey. Each tag needs a fresh
release; retries cannot reuse a draft
with old assets. Preflight rejects a missing or malformed commit pin.
Manual dispatch of `Release Desktop` builds the same standard configuration for
all three platforms, retaining temporary Actions artifacts and running Windows
acceptance without creating or publishing a GitHub release. This is distinct
from isolated Preview acceptance. Neither workflow certifies an upgrade from
an existing stable installation, native platform signing, consumer Windows,
macOS/Linux installed behavior or updater installation; retain those release
gates until their own evidence exists. NSIS and MSI have separate manifests and
fresh runners; one installer's result cannot certify the other. MSI checks its
registered product identity as well as the installed app and engine bytes.
The manual `macos_installed_probe` mode exercises the exact pinned ARM64 DMG
with a separately verified external Ollama runtime. Native controls drive model
download, calibration, repository selection, consent, review, Apply and rollback
across a normal Quit and reopen. It retains original screenshots, native process
identities, the original receipt bytes and default WebKit directory identity.
This workflow is a verification harness: only a reviewed passing run proves its
bounded journey, and trusted signing remains a separate public-beta gate.
Engine resources are staged with their actual installed filenames because WiX
preserves source basenames. This keeps MSI and NSIS runtime layouts consistent.
For this beta, Windows MSI metadata uses `0.4.0.1`; the app and release assets
retain `0.4.0-beta.1`. Release preflight checks that mapping before compiling.
Windows Installer ignores the fourth version field when comparing upgrades,
so this numeric mapping does not establish beta-to-stable upgrade behavior.
Managed Windows runtime setup stages and verifies the downloaded archive and
extracted Ollama file tree before publishing either. Retrying after an
interrupted Phonton-owned stage recovers automatically; an unknown stage or
older incomplete final install is preserved for manual inspection.
It measures free space on its runtime-installation volume and verifies that its
spawned child owns the loopback listener around the version check. If a service
already responds there, setup says its origin is unverified; it does not claim
Phonton installed or started it. The model page shows verified free space only
while the original Phonton-started process still owns its listener and blob
store. Managed downloads check a fresh manifest and reserve before pulling;
external services show an unverified store.
The local workbench asks separately before sending repository context to an
external or unmatched loopback service; that service may relay inference
elsewhere. The receipt labels the observed runtime origin. The engine checks a
Phonton-started process and exact listener before and after each model chat,
but those observations do not authenticate every HTTP connection.
When a managed process or storage identity needs recovery, the workbench labels
that state, withholds unverified-runtime consent, and keeps Run disabled until
setup is repaired. A missing prior launch receipt can still use an answering
service for a goal after explicit unverified-runtime consent; managed downloads
remain unavailable until recovery.
If setup was cancelled during archive verification, retry waits for the earlier
hash worker to release its file handle before cleaning its owned download stage.

Browse/download/calibrate/select a model under **Local models**, open a Git
repository, enter a goal, then review its proposed source scope and checks.
The shared planner recognizes camelCase and snake_case variants of parsed
symbols when proposing source and excerpts, with exact names ranked first.
The **Installed models** section can deselect the active model even while Ollama is
offline. Deselecting keeps its weights and calibration; **Remove** remains a
separate explicit operation after deselection, and shared layers may remain.
Catalog Download treats Ollama's default host, library namespace, and `:latest`
spellings as the same installed model, so it does not offer a duplicate pull.
The advanced custom Download field also accepts a name without a tag; the shared
engine resolves it to the installed `:latest` identity for calibration and
selection. Calibration details show the thinking request that the bundled engine will reuse
for local coding edits and strategy calls. A compatibility probe does not
establish general coding quality or that the runtime honored the request. The
workbench clears a reviewed plan when Local models opens; review again after
checking or changing models before running the goal. The
catalog marks at most one first model to try from registry sizes and current
memory estimates; it withholds that hint when evidence is missing or memory is
insufficient. This is a resource starting point, not a coding-quality or speed
result. Browse shows the RAM and GPU snapshot used for its catalog fits beside
those entries; installed-model fits keep the separate machine status reading.
On Windows, the shared engine reads physical RAM through the OS API, so a
failed optional CPU/CIM probe does not erase its fit reading.
Refresh readings clears the catalog until it is browsed again. Download and
calibration remain explicit. Browse also refreshes the storage reading before
pairing it with new registry sizes for pre-setup disk guidance.
Model actions bind to the displayed endpoint and managed folder. If another
Phonton CLI changes either setting while this page is open, the engine rejects
the stale action before it begins; Desktop refreshes status and clears the
catalog until Browse is used again.
The local workbench requires an engine that advertises catalog snapshots as
well as the model-operation binding, storage and coding-run APIs; the current catalog capability
includes the shared pre-setup storage plan. An older responding engine is
shown as upgrade-required before Browse. File scope and check commands can be
overridden. An exact **New file to create** path
enables one-file creation. Leave **Existing source context** blank to search for
matching read-only source; the plan warns when nothing matches. Existing files
remain read-only in creation goals unless listed under **Existing files to edit too**.
For ordinary edit goals, every scoped source path is editable. The plan marks
CREATE, EDIT and READ paths. Inferred files and checks stay in the plan,
without becoming typed overrides on the next review. Editing a goal or its
scope clears approval for host checks.
For several editable paths with a SearchReplace-calibrated model, the reviewed
plan increases its implicit call, check and output reserves within engine caps
and shows the resulting budget and warnings. This covers only a straight
one-edit-per-path sequence; repairs and restarts can use the same calls.
Mixed goals stage creation before an existing edit, then check and review their
combined diff. A staged creation alone cannot be applied. Enter up to four
optional verification commands as one JSON array per line, for example
`["node", "test_sum.js"]`; a blank field asks the engine to infer checks. The
reviewed plan lists every command before separate host-execution approval.
Plan and receipt display each exact argument array, including arguments with
spaces. Checks with paths outside the candidate copy, including rooted arguments
and file URLs, are refused during review; use candidate-relative test paths.
Catalog and status requests can take longer on a slow machine or registry, with
a bounded wait in the packaged app. The five catalog manifest lookups run
together; Browse still waits for the batch and shows per-model lookup errors.
For model setup, download, calibration and selection, the page tracks the ID
returned by the engine. If another client replaces the operation before Phonton
reads its result, the page reports that the original result needs confirmation,
shows the other operation as external activity and keeps conflicting actions
disabled while it runs. Only setup, download and calibration started in this
window can be cancelled here. Selection, deselection and removal finish before the engine
reports their result. An accepted operation stays visible while its first status
read retries; operation failures remain visible in their status card.
Removal keeps saved calibration unless the refreshed runtime inventory confirms
that the model disappeared.
Up to eight unconfirmed model-install requests keep their exact tags and
endpoints in local state after an engine exit. A request may have failed before
transfer. Local models checks current inventory on reopen and offers **Retry
install** only when that same endpoint reports a tag absent. Unavailable
inventory, a changed endpoint, or an ambiguous alias needs review; partial
layers are never presented as installed. A model reported installed still
needs calibration before selection.
Reloading the Desktop view reconnects to the same bundled engine when it still
owns its local listener. The view restores the exact ID of a model operation it
started in that window, so a running download can still be cancelled. The
older project switcher checks for active model work, local coding runs and
engine-side goal sessions before restarting the engine; if it cannot confirm a
live engine is idle, it leaves the process running and asks for a reconnect.
The page checks for another client's new operation while idle and immediately
rechecks after a rejected start, then blocks conflicting actions while it runs.
An already-completed operation observed on reopen or after a failed start
refreshes model status before the page presents calibration or selection state.
When calibration completes without a passing existing-file edit format, its
operation card says editing is not ready. The saved probe outputs remain under
the installed model as diagnostic evidence, while Select stays disabled. A
changed digest, runtime or context also keeps old probe output diagnostic only.
An interrupted calibration has its own incomplete-attempt panel, including each
finished probe even after the engine exits. It cannot be selected; Calibrate
starts fresh while any earlier passing profile remains separate. Its starting
digest is diagnostic and does not verify the identity of each later probe.
Local models shows a separate measured new-file format result. Older or failed
creation probes produce a clear warning in the composer; existing-file edit
readiness remains separate. A profile from changed model weights or runtime
version must be recalibrated before the composer treats it as ready.
The composer can inspect a repository goal and show its read-only source scope
and proposed checks before a model is selected. Running still requires a fresh
plan bound to the selected calibrated model. Plan review now checks the installed
digest, runtime version, and context metadata live. If the selection is stale or
the runtime is unavailable, the plan shows a warning and keeps Run disabled;
start repeats the check before saving an attempt. The composer refreshes status
periodically and on focus, expires old readiness, and performs a fresh check
when Run is pressed. It compares the complete calibration profile fingerprint
with the reviewed plan, including when the same model has been recalibrated.
An overlapping background status refresh does not cancel that Run check.
Equivalent default-library names remain the same selected model when the
installed digest and calibration agree; duplicate aliases are not treated as
a ready model.
The model page now starts with automatic calibration context based on current
memory and the installed model's reported limit. Each row labels the context
behind its cold-load fit and shows when automatic choice is unavailable. The
Advanced selector previews explicit context overrides without changing an
existing measured profile until calibration runs.
If cold loading does not fit, Calibrate can retry when Ollama already holds the
exact installed model with enough context, at least 30 seconds before unload,
and at least 1.5 GiB free host RAM. The engine rechecks memory and residency
before every probe and stops if they change. The cold-load estimate remains
labeled separately; a loaded model is not reserved through calibration.
Advanced settings can also save a loopback Ollama origin for an existing runtime,
even while that runtime is stopped. Changing origins clears the selected model;
the new origin must report its own installed model and pass calibration before a
goal can run. Managed runtime setup appears only at Phonton's default origin.
For the older provider-backed goal runner, opening a project does not grant
workspace trust. Select **Trust project** before Run goal; this permits source
access and checks in that project. MCP operations remain denied by default.
Host execution requires its own explicit checkbox. Without it, checks remain
unavailable and any returned candidate is clearly marked unverified.
Reviewing a plan clears host approval; approve its concrete command afterward.
Source changes since preview require a fresh plan before execution.
If **Cancel run** is pressed while a goal is still starting, the request waits
for the engine to accept that exact run ID before it is sent.
Read-only discovery includes JavaScript/TypeScript module files. For selected
Go source in a root Go module, the plan proposes a separate
`go test -json -count=1` check for each edited package (up to four) while
keeping host execution unapproved. Broader module or dependent-package checks
can be added explicitly. Build-constrained files, files Go ignores by name,
and cgo sources need explicit checks; Go test files and manifests cannot be
model edits.
For nested Go/Node packages or mixed-language edits, enter an explicit check.
Rust member edits use their owning manifest; Node test files stay outside edit
scope even when they only contain top-level assertions.

Candidates and evidence are saved outside the source tree. After reviewing a
selected candidate with passing checks, **Apply selected changes** can replace
all changed existing scoped files. It rechecks source, candidate and Git index
identity, backs up every original, and records a recoverable batch journal
without staging or committing. A multi-file apply is sequential and can need
explicit recovery after interruption. Broad retrieval and native packaged
acceptance remain in progress.
The shared engine requests file and directory sync for backups, creation
anchors and the prepared Apply journal before project mutation; a sync failure
stops Apply. It requests sync of changed project directories before recording
`applied` or `rolled_back`; a later sync failure retains a nonterminal journal.
Candidate evidence and the full operation are not proven crash-durable, so
power-loss recovery still needs manual inspection.
On Windows, the shared Apply engine holds each changed source parent against
directory relocation during replacement; it still checks source and index
identity and does not provide multi-file atomicity.
For a creation goal, the same action publishes the reviewed new file without
replacing an occupied path. Its separate journal retains a same-volume file
identity anchor in run evidence or local Git metadata; interrupted recovery refuses a new
file at the same path even when its bytes are identical. Older byte-only
journals and a missing anchor need manual inspection.
Git metadata anchors remain while their run evidence may need recovery.
A mixed creation uses its own journal to publish the new file and replace the
reviewed existing source. It verifies exact partial states before roll-forward;
the sequential project writes are not atomic across files.
If its final creation-path recheck fails before publication, the prepared
journal remains for recovery and the engine reports the validation error.
On Windows, **Remove created file** is available for an applied single-file
creation with a retained identity witness. It rechecks the exact file, existing
source and Git index, records a deletion attempt, and refuses replacements
with a different file identity. A still-present target after that attempt
needs manual review.
On Windows, an applied combined create-and-edit change can restore its
original existing-file bytes and then remove the witnessed created file.
Interrupted restoration resumes only from exact saved states. An unfinished
Apply must be completed before rollback. Old byte-only creation journals
still need manual recovery.
Older saved reviews without final Git index integrity proof remain review-only
until a fresh verified run provides that evidence.
Passing checks briefly show `finalizing` while the engine rechecks model, source,
candidate and Git-index identity. A stop before those checks and the end record
is saved appears as interrupted on reopen, with no Apply action. While the
engine saves that end record, the run remains finalizing; Apply appears only
after the completed receipt is saved.
If a check is interrupted after an edit was materialized, the reopened run
retains its pre-check diff and hash. Its unfinished checks remain Unavailable,
with command journals in run evidence; that candidate cannot be applied.
The shared engine defaults to 16 check launches. The plan warns when a smaller
explicit cap cannot verify both baseline and candidate; approving host checks
with that cap is refused before execution.
After a failed candidate, the shared runner also requires enough remaining
approved-host check slots for all selected commands and preparation before
another model call. A partial check allowance ends search with the earlier
evidence instead of an uncheckable repair.
On completion and when reopening a saved run, the engine rechecks the selected
candidate's saved bytes and diff before Desktop presents it as verified. If
the saved evidence changed or is unavailable, the run keeps its history but
clears selection and disables Apply.
The reviewed plan displays its actual model-attempt, check/setup, output-token
and wall-time limits. Inferred Rust checks target the edited Cargo package;
add a broader check explicitly when dependent packages matter.
The saved receipt retains that package-only coverage limit. Apply readiness
means the selected commands reported a pass on the exact candidate. Project
code can terminate a runner or forge its output because host checks are not
isolated; inspect the diff and logs before applying. Dependent packages may
remain untested.
Reopening the workspace restores its last receipt before offering a new composer.
**Recent runs** keeps up to 12 saved goals reachable after **New goal** or a
Desktop reload. It reads the engine's durable run index and bounded older
evidence, including receipt-only runs. **Open by run ID** remains available for
older or omitted evidence; applied state is restored from the run's separate
journal.
Each run shows a short model digest near its progress and a disclosure with the
full digest, runtime version and endpoint, measured profile, and RAM/VRAM
readings captured at admission. These readings are not live telemetry or a
reservation of machine resources.
The run overview sums runtime-reported input and output tokens from saved edit
and strategy replies, and counts repairs and baseline restarts. It shows a
lower bound when a runtime counter or older attempt ledger is missing; reserved
output tokens are a separate budget, not measured generation.
The run view shows its full target repository. If another project is active,
select **Switch to run repository** before Apply or Rollback. The shared engine
also checks canonical repository identity before changing files.
An unavailable saved receipt shows recovery details, retry and a new-goal action.
Candidate disclosures show the exact source excerpts sent to the model and why
they were selected. Context byte bounds are separate from measured input tokens.
For JS/TS edits, a passing direct Node TAP check also needs process-reported
V8 coverage showing each edited source loaded from the complete candidate,
including earlier repair or mixed-creation edits. Missing
inclusion adds Not run evidence and keeps Apply unavailable. Loading source is
not proof that a test asserted the changed behavior; inspect the diff and logs.
The plan warns when the selected checks cannot establish exact source inclusion.
Passing checks retain their matched edited paths in the receipt. Older JS/TS
reviews are unavailable for Apply until rerun with the current engine.
For Python edits, a direct `unittest`, pytest, or candidate-local script check
also needs a process-reported trace showing every edited `.py` file executed
from the complete candidate. A passing unrelated check keeps its pass row but
adds **Not run** source-inclusion evidence, leaving Apply unavailable. Isolated
interpreter flags or missing trace output can leave inclusion unproven; the
plan warns before host approval. Execution alone does not prove an assertion
covered the edit. Older Python reviews require a fresh run with this engine.
Baseline restart proposals have their own disclosure with the source anchor,
claimed mechanism, raw reply and usage; only an actual checked candidate can
become review ready.
Supported root npm scripts produce a reviewed direct Node TAP check. Plans show
the exact offline dependency setup and direct test commands before
host approval. Their separate receipt rows distinguish setup from verification;
a missing cache cannot turn into a passing check.
For direct Node test runs, an exit-0 result without explicit TAP evidence of a
completed named test appears as **Not run** in the receipt. Explicit `npm test`
is diagnostic-only on success because npm may change its shell or executable.
Python `unittest` runs with zero collected, only skipped or expected-failure
cases, or a successful exit without a runner summary do the same. At least one
ordinary passing test is needed for a reported pass.
An explicit direct Python `pytest` or `unittest` check is refused when a
repository-root module could shadow that runner; the plan must use a check
whose runner identity can be trusted.
Direct pytest accepts ordinary colored passing summaries. A `-m pytest` token
after a Python script is a script argument and cannot certify a pytest run.
Direct pytest checks also refuse captured `testpaths`, `pythonpath`, or
`addopts` configuration that points outside the candidate. A passing check
against the original repository cannot make a candidate Apply-ready.
Root or explicit `-c` config is inspected; unrelated nested
config files do not block a root check. Command-line `-o` overrides are checked.
Configured or overridden `addopts --pyargs` is refused because it can select an installed
package.
Successful version, status and build-only commands remain diagnostic **Not run**
rows in a local receipt; they cannot make a candidate ready for Apply. Supported
test runners and explicitly selected candidate-local scripts can report a pass.
`cargo run -- test` also remains **Not run**: `test` is a binary argument, not
the Cargo test subcommand.
A script's exit code is still its own claim; inspect the script, diff and logs.
Approved Windows checks join a process cleanup job before running, and their
descendants stop when the direct check exits or is cancelled. Host approval
still permits project code access to the host filesystem and network.
Git staging integrity has its own disclosure with before/after hashes and the
observation stage. A changed or unreadable original index stops candidate selection.
See [the CLI workflow](../phonton-dev/docs/local-harness.md) for exact limits.

Local startup does not download updates, initialize account handoff or fetch web
fonts. Online account setup and explicit CLI upgrade remain available in Settings.

This package lives outside `phonton-dev/` so it does not ship in the public
CLI subtree. Desktop is the workspace over the local ADE: goals, cheap-first
routing, verification, and receipts.

Current local beta candidate: 0.4.0-beta.1 (not yet published). Windows x64 packages carry their matching local
engine; macOS and Linux currently require phonton-cli 0.22.0 or newer for live
serve. Cost receipts appear when the engine publishes `cost_receipt` on
GlobalState.

The Tauri app can spawn `phonton serve` on port 47831. Vite in a browser cannot spawn the sidecar; start `phonton serve` yourself if you preview the UI in a browser.

### Beta workbench

The goal composer stays near the top of the workspace. Hardware details and older
runs expand on demand. Model selection shows the measured fit and calibration;
the plan names files, exact checks, model and budget before Run. A verified
receipt is still a review, and Apply remains a separate explicit action.

This candidate pins public CLI commit
`157c2893136266f3a29473b89aa10355fa251e54` (0.22.0) in `engine-source.json`.
Local Preview packaging uses an explicitly chosen local CLI source and embeds
its version and SHA-256. That package does not enable updater downloads or
replace the stable app identity. Installed-app and signing/platform acceptance
remain separate from the source pin.

The separate [Windows Preview acceptance workflow](scripts/windows-acceptance/README.md)
builds and installs an unsigned Preview on a fresh cloud Windows runner. It
checks native plan review, bundled-engine ownership, reconnect, normal close,
workspace persistence, settings navigation and draft recovery. Explicit full mode
also tests one calibrated model through inference, Apply, reopen and rollback.
Native folder selection, signing and consumer Windows remain separate gates.

### Focused workspace candidate

The workbench keeps goal drafts while Settings or optional account setup is open.
Navigation keeps both local and online views mounted; project changes synchronize
across those views and invalidate local plans and execution consent. Recent runs
remain accessible below the workbench on narrow windows. Graphite is the default
appearance, with the existing Light and High contrast options preserved.
Automatic online update prompts stop when that workspace is hidden. Setup's
welcome screen checks for updates only when requested. Settings → Updates also
offers an explicit **Update to v…** action after a successful check, with download
progress and a restart notice. A failed installation can be retried; if the feed
withdraws an update before installation, the controls return to an idle state.
Update progress persists when navigating away and back. Installation waits until
the owned engine reports no model or coding work; pending Desktop file changes
and unknown state also block it. During installation, Desktop refuses new engine
mutations, restarts and CLI installation. A lost mutation reply requires reopening
Phonton and reviewing its saved state before updating. These guards coordinate
this Desktop process; they are not isolation from other local clients.
Phonton Preview remains outside the public update channel.
