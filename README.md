# Phonton Desktop

Tauri control room for the Phonton ADE. Requires a **free** phonton.dev account. Pro and Ultra add optional cloud sync.

**Download:** https://www.phonton.dev/desktop/#download  
**Releases:** https://github.com/phonton-dev/phonton-desktop/releases

## Architecture

- UI: React 19 + Vite (`src/`)
- Shell: Tauri 2 (`src-tauri/`)
- Auth: Clerk sign-in on phonton.dev → `phonton://auth/callback` session token
- Engine: `phonton serve` sidecar on `127.0.0.1:47831` (from `phonton-cli`)
- Updates: Tauri updater via signed `latest.json` on GitHub Releases

## Development

```bash
cd phonton-desktop
npm install
npm run tauri:dev
```

Setup wizard will prompt for sign-in and can auto-install the CLI:

```bash
npm install -g phonton-cli
```

Install guide: [phonton.dev/docs/install/](https://www.phonton.dev/docs/install/)

For Vite-only dev (no Tauri), start the sidecar manually:

```bash
phonton serve   # terminal 1
npm run dev     # terminal 2
```

## Release build (local)

```bash
npm run tauri:build
```

Windows artifacts: `src-tauri/target/release/bundle/nsis/Phonton_0.2.0_x64-setup.exe`

## Clerk setup (phonton.dev)

Desktop auth depends on the website Clerk app and session API.

1. [Clerk Dashboard](https://dashboard.clerk.com) → Phonton application
2. **Domains:** `phonton.dev`, `www.phonton.dev`
3. **Paths:** Sign-in `/sign-in/`, Sign-up `/sign-up/`, After sign-in `/account/`
4. **Vercel env** on `phonton-website`: `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `LICENSE_SIGNING_SECRET` (32+ chars)
5. Test: sign in at `https://www.phonton.dev/sign-in/` → account page loads
6. Desktop: **Sign in with browser** in setup → returns via deep link

## Entitlements

- **Desktop** — free Clerk account required (session JWT from `/api/account/session`)
- **Cloud sync** (Pro/Ultra) — optional token from `/api/account/license` in Settings

## Distribution

Public installers ship from **GitHub Releases** on `phonton-dev/phonton-desktop`.

```bash
git tag v0.2.0
git push origin v0.2.0
```

CI (`.github/workflows/release-desktop.yml`) builds Windows, macOS, and Linux bundles, attaches them to the release, and publishes `SHA256SUMS.txt`.

Signing and updater secrets: [docs/RELEASE_SIGNING.md](docs/RELEASE_SIGNING.md)

| Platform | Primary asset |
|----------|----------------|
| Windows x64 | `Phonton_0.2.0_x64-setup.exe` |
| macOS aarch64 | `Phonton_0.2.0_aarch64.dmg` |
| Linux x64 | `Phonton_0.2.0_amd64.AppImage` |
