# Installed macOS acceptance

The manual `Release Desktop` workflow's `macos_installed_probe` mode calls this
journey against the exact candidate in `source.json`. It preserves the DMG and
installed application bytes, uses native controls for mutations, and verifies
the external CLI and Ollama identities independently.

## Runner requirement

Use `macos-26-xlarge`: ARM64, 14 GB RAM. The standard 7 GB ARM64 runner reached
native model download in run `37431494058`, then correctly refused calibration
because the pinned Qwen2.5-Coder 3B model at 4096 context did not fit the observed
available memory and reserves. No inference request was sent. A download or a
successful build does not establish full installed acceptance.

GitHub larger runners require an organization on Team or Enterprise Cloud,
valid billing, a nonzero Actions spending budget, and repository access. They
are billed separately, including for public repositories. Check those settings
before dispatching this mode; changing a workflow label does not enable access.

Keep the model digest, 4096 context, fresh model store, memory admission,
native consent and complete Apply/quit/reopen/rollback journey intact. Do not
preload a model, relax the memory guard or use an Intel runner to bypass the
ARM64 acceptance requirement. Passing on this runner only certifies the
recorded environment and fixture; it does not establish a 7 GB minimum spec.

## Evidence and release boundary

The artifact retains exact source/install/runtime identities, native action and
accessibility observations, original PNGs, fixture checks, raw saved receipt,
Apply/rollback journals, default-profile identity and owned-process cleanup.
Review these independently after the workflow completes. A failed journey can
prove earlier steps but cannot certify the later ones.

Trusted publisher signing, notarization, quarantined consumer delivery and the
public updater remain separate release gates. This workflow does not publish
a release or modify signing credentials.

References checked 6 October 2026:

- [GitHub runner specifications and labels](https://docs.github.com/en/actions/reference/runners/larger-runners)
- [GitHub larger-runner eligibility and billing](https://docs.github.com/en/billing/reference/actions-runner-pricing)
- [GitHub runner access and configuration](https://docs.github.com/en/actions/how-tos/manage-runners/larger-runners/manage-larger-runners)
