# Release signing and beta publication

Public beta requires trusted Windows Authenticode and macOS Developer ID signing
with notarization. Signing setup is currently deferred; do not publish these
unsigned candidates as the public beta.

`release-policy.json` and `scripts/publication-hold.mjs` enforce a publication hold
for the current source. The Release Desktop workflow permits manual candidate
builds but rejects tag publication. Changing a policy value does not enable a
release: the signing, signed-byte provenance and installed platform/update gates
need a reviewed implementation and passing evidence. Older commits are outside
this source-level hold.

## Updater signatures

The candidate workflow uses `TAURI_SIGNING_PRIVATE_KEY` and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` to create updater artifact signatures. The
matching public key lives in `src-tauri/tauri.conf.json`. Preserve this keypair;
rotation is a separate operational change and is not part of beta UI work.

Updater signatures authenticate update payloads to the app. They do not establish
Windows publisher trust, macOS notarization, successful updater installation, or
that every signed artifact has passed installed acceptance.

## OS signing remains unconfigured

The current workflow does not wire Windows certificate or Apple Developer ID /
notarization credentials into a trusted signing pipeline. Adding secret names
alone would not implement or verify that pipeline. Do not infer signing from a
successful build or updater signature.

When signing setup is authorized, implementation must verify the actual shipped
Windows signature and macOS signing/notarization results, bind them to exact
artifact hashes, then rerun installed platform and update acceptance on those
signed bytes. Existing unsigned installer results are useful candidate evidence,
not acceptance of a later rebuilt or signed payload.

Enter credentials through the account's secure secret-management flow. Never
place private keys, passwords or certificates in source, command arguments,
conversation, logs, screenshots, or release artifacts.

## Candidate evidence

Windows fresh-install and forward-upgrade journeys are described in
[`scripts/windows-acceptance/README.md`](../scripts/windows-acceptance/README.md)
and [`docs/WINDOWS_UPGRADE_ACCEPTANCE.md`](WINDOWS_UPGRADE_ACCEPTANCE.md). Their
Windows Server, silent-install and fixture limitations remain in force. Native
macOS/Linux, consumer Windows, automatic updater and other unverified journeys
must be assessed separately before widening release claims.
