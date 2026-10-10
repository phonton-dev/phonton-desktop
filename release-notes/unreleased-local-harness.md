# Unreleased local harness preview

For JS/TS edits, a passing direct Node TAP test now needs process-reported V8
coverage showing each edited source loaded from the complete candidate,
including inherited repairs and mixed creation. An unrelated passing test
remains visible but cannot make the candidate ready for Apply. Plans warn when
selected checks cannot establish exact source inclusion. Passing receipts save
matched paths; older JS/TS reviews require a current run before Apply.

The run view now totals runtime-reported input and output tokens across saved
strategy and edit replies. Missing counters or an older incomplete call ledger
make those totals lower bounds; the view also counts repairs and baseline
restarts. Reserved output tokens remain a separate budget figure.

The bundled search controller can spend one remaining model call on a direct
baseline retry after an edit fails to produce candidate bytes. It still stops
on duplicate output and reserves enough calls to finish mixed creation.

Saved local goals now show the exact model digest, runtime version and endpoint,
and the CPU, RAM and GPU readings captured at run admission. They remain
point-in-time evidence when a model tag or available memory later changes.

An overlapping background model-status refresh no longer silently cancels a
Run click while its fresh model preflight is pending. The engine still repeats
model admission before starting a goal.

Local goals using Cargo tests now require the bundled verifier to find each
edited file in both the selected test binary's dependencies and an active Rust
module path. This also covers nonstandard Rust source extensions; mixed
non-Rust edits may remain unverified. Passing tests from another module leave
a separate Not run source item when inclusion cannot be established.

Local models now restores up to eight unconfirmed install requests with their
exact tags and endpoints after engine restart, even if admission stopped before
transfer. It checks the current endpoint's inventory and offers an explicit
retry only when the tag is absent. Unavailable or ambiguous inventory and a
changed endpoint do not present the model as installed.

Local models now shows incomplete calibration evidence after an interruption
or engine reconnect. Each completed probe stays inspectable, but the attempt
cannot be selected and does not replace an earlier valid profile.

Reopened and newly completed local goals now recheck the selected candidate's
saved bytes and diff before presenting it as verified. Missing or changed
evidence clears selection and keeps Apply unavailable; the old receipt remains
inspectable with the reason.

Local search now requires a full selected-check allowance before spending
another model call after a failed candidate. A partial remaining check budget
leaves the earlier failed-check evidence instead of a new uncheckable repair.

Interrupted local verification now leaves the candidate's pre-check diff and
hash in the reopened run. Unfinished checks show Unavailable and Apply stays
blocked; separate command journals remain in run evidence. An orderly cancel
also updates elapsed time through the stop.

Windows Local models now receives native physical RAM readings from the shared
engine even if optional CPU/CIM detection fails. Fit remains a point-in-time
estimate and goal admission rechecks memory.

Local models and the goal composer now keep a calibrated selection ready if
Ollama reports an equivalent default-library name for the same installed
model. Duplicate inventory aliases remain blocked by the engine and Desktop.

The local composer refreshes runtime readiness while visible, rechecks on
focus, and expires stale observations. Pressing Run fetches fresh model status
and compares the complete saved calibration profile with the reviewed plan,
so a stopped runtime or same-model recalibration is caught before dispatch.
The engine repeats admission at start.

Local goal receipts now mark omitted middle output in verbose failed checks,
while baseline and repair feedback keep bounded stdout and stderr tails. This
helps a trailing assertion reach the next attempt without implying the full
check log was saved.

The local composer can now find a parsed `parse_port` symbol from a
`parsePort` goal and prioritize its excerpt in a small model context. Exact
names rank first; the proposed file scope remains visible for review.

Catalog Download now recognizes installed Ollama aliases, including default
library and `:latest` spellings, before offering a model again.

Mixed Apply now reports a final creation-path recheck error separately from
an already-published target. It retains the prepared recovery journal and does
not publish the new file when that check fails.

Local goal receipts now keep `cargo run -- test` as diagnostic **Not run**
evidence. A successful binary run with a `test` argument is not a Cargo test
and cannot qualify a candidate for Apply.

Local models can deselect the active model even while Ollama is offline.
Deselecting preserves the downloaded weights and calibration; removing the
model remains a separate explicit action and may leave shared layers in use.

The local goal composer now shows whether the engine is connecting, the model
runtime is unavailable, managed runtime recovery is required, or a managed or
unverified loopback runtime is actually connected. Its footer no longer claims
inference availability before that status is known.

The local goal composer accepts up to four verification commands, one JSON
command array per line. Editing them invalidates the reviewed plan and host
execution approval while keeping the verification panel open. The next review
shows every selected or inferred command before a goal can run.
Plans and receipts show the exact argument arrays used for approval and review.
Model install completion now requires Ollama's terminal success plus an
installed inventory digest and size. Explicit direct Python runner checks
refuse repository-root modules that could shadow `pytest` or `unittest`.
Removal now keeps calibration unless the runtime inventory confirms absence.
Windows Desktop owns the spawned engine's process lifetime, so closing the app
stops that engine while a view reload keeps the existing in-app connection.
Catalog browsing now shows its fit hardware snapshot beside catalog entries,
separate from installed-model status readings. A readings refresh clears the
older catalog.
Before managed runtime setup, Local models compares current free space with a
conservative allowance for each catalog model: runtime setup headroom, registry
model size and the managed pull reserve. The shared engine calculates and
returns that allowance to both CLI and Desktop. It warns when the first-try model may
not fit on the selected drive before that storage choice becomes fixed. Live
setup and download admission still make the final disk checks.
An engine without the catalog snapshot API is now marked upgrade-required
before the local model browser opens.
Review and Apply now describe host-check passes as reported command results;
candidate code can terminate a runner or forge output while checks run without
isolation. The exact diff and logs remain part of the review decision.
An expected-failure-only Python `unittest` run is **Not run** rather than a
passing check; a mixed run needs an ordinary passing test to qualify.

This is a local source note, not a published Desktop release.
