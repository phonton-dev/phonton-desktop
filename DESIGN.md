# Phonton local workspace direction

The attached screenshot and revival brief are visual authority. This direction
records that request; it does not certify the unfinished full workspace.

The interface is for operating on repositories. Use near-black surfaces,
monospace type, quiet separators and compact textual state. Preserve substantial
empty space around the central goal composer. Reveal detailed evidence on demand.

Every surface reads the theme tokens that `src/themes/presets.ts` sets on the
root element; no component hardcodes a color. Nebula is the default preset:

| Token | Nebula | Purpose |
|---|---|---|
| `--ph-bg` | `#0a0b0d` | Main surface |
| `--ph-surface` | `#121418` | Controls and code output |
| `--ph-line` | `#2a2e35` | Frames and group boundaries |
| `--ph-fg` | `#e4e6e9` | Primary text |
| `--ph-muted` | `#9aa1ab` | Secondary text (4.5:1 or better) |
| `--ph-accent` | `#2ec9b4` | Selection, focus and primary action |
| `--ph-ok` / `--ph-warn` / `--ph-danger` | `#6ee09a` / `#e8c06a` / `#ff8a82` | ✓ ◇ ✗ states |

The ASCII kit (`src/components/ascii/ascii.tsx`) is the only source of the
ANSI Shadow logo, frames, state glyphs, spinner and text progress bars. Never
swap in the compact pixel-block logo. Motion runs once on a state change and
stops under reduced motion.

Use local monospace fonts with Cascadia Code/Consolas fallbacks; avoid automatic
font network requests. Numerals are tabular. Controls have visible focus, hover,
disabled, pending and failure states. A download progress bar uses runtime bytes
only; absent totals remain indeterminate. Compatibility results expose raw probe
output and distinguish unavailable from failed. No invented quality scores.

The default local entry now uses the sparse composer and evolves into candidate
diffs and check evidence. Its browser preview includes an inline repository path
field; native builds use the folder picker. The previous online shell is retained
behind an explicit choice. Composer browser inspection at normal and 390px widths
has passed; native acceptance and final visual review remain open. This file is
not whole-app visual approval.
