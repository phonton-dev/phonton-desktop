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

## Download

[phonton.dev/desktop](https://phonton.dev/desktop/#download) or
[GitHub releases](https://github.com/phonton-dev/phonton-desktop/releases).

- **Windows x64:** the installer includes the Phonton engine.
- **macOS and Linux:** install the CLI first (`npm install -g phonton-cli`);
  Desktop starts it.

## Build from source

Requires Node 22 and stable Rust. On Windows, the build compiles the matching
CLI from a sibling `phonton-dev` checkout and bundles it.

```bash
npm ci
npm run build          # type-check and bundle the UI
node --test scripts/   # UI logic tests
npm run tauri:build
```

`npm run dev` serves the UI in a browser at `http://localhost:1420`; start
`phonton serve` separately and the page connects to it.

Implementation notes: [docs/local-workbench-notes.md](docs/local-workbench-notes.md).
Release signing: [docs/RELEASE_SIGNING.md](docs/RELEASE_SIGNING.md).


## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT](LICENSE-MIT), at your option, the same as the
[Phonton CLI](https://github.com/phonton-dev/phonton-cli).
