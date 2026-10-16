import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/themes/palette.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2021 },
}).outputText;
const { PRESETS, contrast, inkFor, importTheme, exportTheme, parseThemeSettings, normalizeHex, safeFontFamily, DEFAULT_THEME } =
  await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const HEX = /^#[0-9a-f]{6}$/;
const assertPalette = (palette) => {
  for (const [key, value] of Object.entries(palette)) assert.match(value, HEX, `${key} is ${value}`);
};

test("every preset keeps body and muted text readable (WCAG AA 4.5:1)", () => {
  for (const { id, palette } of PRESETS) {
    assert.ok(contrast(palette.fg, palette.bg) >= 4.5, `${id} fg`);
    assert.ok(contrast(palette.muted, palette.bg) >= 4.5, `${id} muted`);
    assert.ok(contrast(palette.accent, palette.bg) >= 3, `${id} accent`);
    assert.ok(contrast(inkFor(palette.accent), palette.accent) >= 4.5, `${id} button label`);
    for (const key of ["ok", "warn", "danger"]) assert.ok(contrast(palette[key], palette.bg) >= 3, `${id} ${key}`);
  }
});

test("the brand-named preset is gone and stored ids migrate", () => {
  assert.ok(!PRESETS.some(p => p.id === "cursor-dark" || /cursor/i.test(p.label)));
  assert.equal(parseThemeSettings(null, "cursor-dark").preset, "graphite");
  assert.equal(parseThemeSettings(null, "light").preset, "light");
  assert.equal(parseThemeSettings(null, null).preset, "nebula");
});

test("stored settings survive bad input without throwing", () => {
  assert.deepEqual(parseThemeSettings("{not json"), DEFAULT_THEME);
  assert.deepEqual(parseThemeSettings("[1,2]"), DEFAULT_THEME);
  const bad = parseThemeSettings(JSON.stringify({ preset: "nope", custom: { bg: "red" }, density: "huge", font: "custom", fontFamily: "x\"; } body { display:none" }));
  assert.equal(bad.preset, "nebula");
  assert.equal(bad.custom, null);
  assert.equal(bad.density, "comfortable");
  assert.equal(bad.font, "mono", "an unsafe custom font name falls back to mono");
  const good = parseThemeSettings(JSON.stringify({ preset: "light", custom: PRESETS[1].palette, name: "Mine", density: "compact", font: "custom", fontFamily: "Iosevka Term" }));
  assert.equal(good.custom.bg, PRESETS[1].palette.bg);
  assert.equal(good.density, "compact");
  assert.equal(good.fontFamily, "Iosevka Term");
});

test("font family names cannot escape a CSS string", () => {
  assert.equal(safeFontFamily("JetBrains Mono"), "JetBrains Mono");
  assert.equal(safeFontFamily("a\"b"), "");
  assert.equal(safeFontFamily("x;y"), "");
  assert.equal(safeFontFamily("url(evil)"), "");
});

test("hex normalization", () => {
  assert.equal(normalizeHex("#ABC"), "#aabbcc");
  assert.equal(normalizeHex("2ec9b4"), "#2ec9b4");
  assert.equal(normalizeHex("#12345"), null);
  assert.equal(normalizeHex("rgb(0,0,0)"), null);
});

test("imports a base16 YAML scheme", () => {
  const yaml = `scheme: "Tomorrow Night"
author: "Chris Kempson"
base00: "1d1f21"
base01: "282a2e"
base02: "373b41"
base03: "969896"
base04: "b4b7b4"
base05: "c5c8c6"
base06: "e0e0e0"
base07: "ffffff"
base08: "cc6666"
base09: "de935f"
base0A: "f0c674"
base0B: "b5bd68"
base0C: "8abeb7"
base0D: "81a2be"
base0E: "b294bb"
base0F: "a3685a"
`;
  const theme = importTheme(yaml);
  assert.equal(theme.format, "base16");
  assert.equal(theme.name, "Tomorrow Night");
  assert.equal(theme.palette.bg, "#1d1f21");
  assert.equal(theme.palette.fg, "#c5c8c6");
  assert.equal(theme.palette.accent, "#8abeb7");
  assert.equal(theme.palette.danger, "#cc6666");
  assertPalette(theme.palette);
});

test("imports the tinted-theming palette layout with # prefixes", () => {
  const yaml = `system: "base16"
name: "Gruvbox"
palette:
  base00: "#282828"
  base01: "#3c3836"
  base02: "#504945"
  base03: "#665c54"
  base04: "#bdae93"
  base05: "#d5c4a1"
  base08: "#fb4934"
  base0A: "#fabd2f"
  base0B: "#b8bb26"
  base0C: "#8ec07c"
  base0D: "#83a598"
`;
  const theme = importTheme(yaml);
  assert.equal(theme.name, "Gruvbox");
  assert.equal(theme.palette.ok, "#b8bb26");
});

test("imports an iTerm2 .itermcolors plist", () => {
  const entry = (key, r, g, b) => `<key>${key}</key><dict><key>Blue Component</key><real>${b}</real><key>Green Component</key><real>${g}</real><key>Red Component</key><real>${r}</real></dict>`;
  const plist = `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict>
${entry("Ansi 1 Color", 0.8, 0.2, 0.2)}${entry("Ansi 2 Color", 0.2, 0.8, 0.3)}${entry("Ansi 3 Color", 0.9, 0.8, 0.3)}
${entry("Ansi 4 Color", 0.3, 0.5, 0.9)}${entry("Ansi 6 Color", 0.2, 0.8, 0.8)}
${entry("Background Color", 0.05, 0.05, 0.06)}${entry("Foreground Color", 0.9, 0.9, 0.9)}
</dict></plist>`;
  const theme = importTheme(plist);
  assert.equal(theme.format, "iTerm2");
  assert.equal(theme.palette.bg, "#0d0d0f");
  assert.equal(theme.palette.accent, "#33cccc");
  assertPalette(theme.palette);
  assert.ok(contrast(theme.palette.muted, theme.palette.bg) >= 4.5);
});

test("imports a Ghostty config", () => {
  const conf = `# my theme
background = 282c34
foreground = #abb2bf
palette = 1=#e06c75
palette = 2=#98c379
palette = 3=#e5c07b
palette = 4=#61afef
palette = 6=#56b6c2
cursor-color = #528bff
`;
  const theme = importTheme(conf);
  assert.equal(theme.format, "Ghostty");
  assert.equal(theme.palette.bg, "#282c34");
  assert.equal(theme.palette.accent, "#56b6c2");
  assert.equal(theme.palette.accent2, "#61afef");
});

test("imports a Windows Terminal scheme or settings.json", () => {
  const scheme = { name: "Campbell", background: "#0C0C0C", foreground: "#CCCCCC", black: "#0C0C0C", red: "#C50F1F", green: "#13A10E", yellow: "#C19C00", blue: "#0037DA", purple: "#881798", cyan: "#3A96DD", white: "#CCCCCC", brightBlack: "#767676", brightRed: "#E74856", brightGreen: "#16C60C", brightYellow: "#F9F1A5", brightBlue: "#3B78FF", brightPurple: "#B4009E", brightCyan: "#61D6D6", brightWhite: "#F2F2F2" };
  const single = importTheme(JSON.stringify(scheme));
  assert.equal(single.format, "Windows Terminal");
  assert.equal(single.name, "Campbell");
  assert.equal(single.palette.bg, "#0c0c0c");
  // Dark blue fails 3:1 on near-black, so the readable bright blue is used instead.
  assert.equal(single.palette.accent2, "#3b78ff");
  const settings = `{
    // Windows Terminal settings
    "profiles": {},
    "schemes": [${JSON.stringify(scheme)}]
  }`;
  assert.equal(importTheme(settings).palette.fg, "#cccccc");
});

test("a Phonton export imports back unchanged", () => {
  const settings = { ...DEFAULT_THEME, custom: { ...PRESETS[0].palette, accent: "#ff00aa" }, name: "Pink" };
  const exported = exportTheme(settings);
  const theme = importTheme(exported);
  assert.equal(theme.format, "Phonton theme");
  assert.equal(theme.name, "Pink");
  assert.deepEqual(theme.palette, settings.custom);
});

test("rejects unknown and incomplete files with a clear message", () => {
  assert.throws(() => importTheme(""), /empty/);
  assert.throws(() => importTheme("hello world"), /Unrecognized format/);
  assert.throws(() => importTheme("base00: \"000000\""), /missing base01/);
  assert.throws(() => importTheme(JSON.stringify({ phonton_theme: 1, palette: { bg: "#000" } })), /invalid color/);
  assert.throws(() => importTheme("palette = 1=#ff0000"), /background or foreground/);
});
