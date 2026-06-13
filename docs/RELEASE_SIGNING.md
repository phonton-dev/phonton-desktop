# Release signing and updater secrets

Configure these GitHub Actions secrets on `phonton-dev/phonton-desktop` before tagging a release.

## Required for auto-updater manifests

| Secret | Value |
|--------|--------|
| `TAURI_SIGNING_PRIVATE_KEY` | Contents of `src-tauri/.tauri-signing.key` (generate locally; never commit) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password used with `tauri signer generate` |

Generate a new keypair (only if rotating keys):

```bash
cd phonton-desktop
npx tauri signer generate --ci -w src-tauri/.tauri-signing.key -f -p "your-password"
```

The public key in `src-tauri/tauri.conf.json` must match the private key.

## Optional — OS code signing (recommended before broad launch)

| Secret | Purpose |
|--------|---------|
| `WINDOWS_CERTIFICATE` | Base64 `.pfx` for Authenticode |
| `WINDOWS_CERTIFICATE_PASSWORD` | PFX password |
| `APPLE_CERTIFICATE` | Base64 `.p12` for Developer ID |
| `APPLE_CERTIFICATE_PASSWORD` | P12 password |
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: Your Name (TEAMID)` |
| `APPLE_ID` | Apple ID email for notarization |
| `APPLE_PASSWORD` | App-specific password |
| `APPLE_TEAM_ID` | Apple Developer team ID |

Without OS signing secrets, CI still produces unsigned installers and signed updater JSON.

## Set secrets via GitHub CLI

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY --repo phonton-dev/phonton-desktop < src-tauri/.tauri-signing.key
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --repo phonton-dev/phonton-desktop --body "your-password"
```
