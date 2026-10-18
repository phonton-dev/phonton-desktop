# Phonton Desktop

A local workbench for coding with local models. Install and calibrate a model,
describe a change to a repository, and review the candidates your own tests
let through. Free, no account. Inference stays on `127.0.0.1`.

Desktop runs the same engine as the [Phonton CLI](https://github.com/phonton-dev/phonton-cli):

1. **Local models.** Phonton installs a pinned, hash-checked Ollama runtime,
   downloads a model, and calibrates which edit formats it gets right on this
   machine. The page shows each probe as pass or fail.
2. **Plan.** Open a repository and describe the change. Before any model call
   you see the files, the exact check commands, the model and the budget.
3. **Attempts.** Each candidate is applied to an isolated copy and your checks
   run. A failing candidate goes back to the model with the failing output.
4. **Apply.** A candidate that passed can be applied with original-byte
   backups, and restored later.
5. **Record.** Every finished run ends with a receipt: changed files, checks,
   tokens in and out, time, API cost, known gaps and the rollback point. The
   Runs page adds your all-time record (the same one `phonton record` prints),
   per-repository and per-model totals, personal bests and achievements. All
   of it comes from saved receipts and the engine record; a streak only grows
   when a candidate passes your checks.

## Download

[phonton.dev/desktop](https://phonton.dev/desktop/#download) or
[GitHub releases](https://github.com/phonton-dev/phonton-desktop/releases).

- **Windows x64:** the installer includes the Phonton engine.
- **macOS and Linux:** install the CLI first (`npm install -g phonton-cli`);
  Desktop starts it.

### First launch of an unsigned build

Installers are not yet code-signed, so Windows and macOS warn on first
launch. Check the download against `SHA256SUMS.txt` from the same release
before you bypass the warning.

**Windows (SmartScreen)**

1. Check the hash in PowerShell and compare it with the matching line in
   `SHA256SUMS.txt`:
   `Get-FileHash .\Phonton_<version>_x64-setup.exe -Algorithm SHA256`
2. If Edge says the file "isn't commonly downloaded", open the download's
   **…** menu, choose **Keep**, then **Show more** → **Keep anyway**.
3. Run the installer. On **Windows protected your PC**, click
   **More info**, confirm the app name is the file you downloaded, then click
   **Run anyway**.

**macOS (Gatekeeper)**

1. Check the hash and compare it with `SHA256SUMS.txt`:
   `shasum -a 256 Phonton_<version>_aarch64.dmg`
2. Open the disk image and drag **Phonton** to **Applications**.
3. Open Phonton once. When macOS says it can't verify the app, click
   **Done** (not **Move to Trash**).
4. Open **System Settings** → **Privacy & Security**, scroll to
   **Security**, and click **Open Anyway** next to the Phonton message.
   Confirm with your password, then click **Open**. On macOS 14 and earlier
   you can instead Control-click Phonton in Applications and choose
   **Open** → **Open**.
5. If macOS says Phonton "is damaged and can't be opened", the download
   quarantine flag is blocking an unsigned app. Clear it, then open Phonton
   again:
   `xattr -dr com.apple.quarantine /Applications/Phonton.app`

## Build from source

Requires Node 22 and stable Rust. On Windows, the build compiles the matching
CLI from a sibling `phonton-dev` checkout and bundles it.

```bash
npm ci
npm run build          # type-check and bundle the UI
npm test               # UI logic tests (node --test scripts/)
npm run tauri:build
```

`npm run dev` serves the UI in a browser at `http://localhost:1420`; start
`phonton serve` separately and the page connects to it.

End-to-end tests run the production build against a mocked engine:

```bash
npx playwright install chromium
npm run test:e2e
```

Screenshot baselines in `e2e/themes.spec.ts-snapshots/` are Windows renders;
after an intended visual change, refresh them with
`npx playwright test e2e/themes.spec.ts --update-snapshots` and review the
diff. `SHOTS_DIR=<folder> TOUR_THEME=<preset> npx playwright test e2e/tour.spec.ts`
captures every main screen for manual review.

Implementation notes: [docs/local-workbench-notes.md](docs/local-workbench-notes.md).
Release signing: [docs/RELEASE_SIGNING.md](docs/RELEASE_SIGNING.md).


## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT](LICENSE-MIT), at your option, the same as the
[Phonton CLI](https://github.com/phonton-dev/phonton-cli).
