import { useEffect, useRef, useState } from "react";
import { Glyph } from "@/components/ascii/ascii";
import { contrast, exportTheme, importTheme, inkFor, normalizeHex, paletteOf, safeFontFamily } from "@/themes/palette";
import { presetLabel, setTheme, useTheme, type Palette, type ThemeSettings } from "@/themes/presets";
import { ThemePicker } from "./ThemePicker";

const MAIN: [keyof Palette, string][] = [["accent", "Accent"], ["bg", "Background"], ["fg", "Foreground"]];
const MORE: [keyof Palette, string][] = [["surface", "Surface"], ["line", "Lines"], ["muted", "Muted text"], ["accent2", "Accent 2"], ["ok", "Pass"], ["warn", "Warning"], ["danger", "Fail"]];

function ColorField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (hex: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <div className="theme-color">
    <label htmlFor={`${id}-hex`}>{label}</label>
    <input type="color" aria-label={`${label} picker`} value={value} onChange={e => onChange(e.target.value)} />
    <input id={`${id}-hex`} className="theme-hex" value={draft} spellCheck={false} maxLength={7}
      aria-invalid={!normalizeHex(draft)}
      onChange={e => { setDraft(e.target.value); const hex = normalizeHex(e.target.value); if (hex) onChange(hex); }}
      onBlur={() => setDraft(value)} />
  </div>;
}

function Ratio({ label, fg, bg, min = 4.5 }: { label: string; fg: string; bg: string; min?: number }) {
  const ratio = contrast(fg, bg);
  return <li><Glyph state={ratio >= min ? "pass" : ratio >= 3 ? "warn" : "fail"} /> {label} <span className="theme-ratio">{ratio.toFixed(1)}:1</span></li>;
}

/** Presets, color editing, density, font, and terminal palette import/export. Every change applies and persists at once. */
export function ThemeEditor() {
  const theme = useTheme();
  const palette = paletteOf(theme);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [paste, setPaste] = useState("");
  const [fontDraft, setFontDraft] = useState(theme.fontFamily);
  const fileInput = useRef<HTMLInputElement>(null);
  const update = (patch: Partial<ThemeSettings>) => setTheme({ ...theme, ...patch });
  const setColor = (key: keyof Palette, hex: string) => update({ custom: { ...palette, [key]: hex }, name: theme.name ?? "Custom" });

  const load = (text: string) => {
    try {
      const imported = importTheme(text);
      update({ custom: imported.palette, name: imported.name ?? "Imported" });
      setStatus({ tone: "ok", text: `Imported ${imported.name ?? "theme"} (${imported.format}).` });
      setPaste("");
    } catch (e) {
      setStatus({ tone: "error", text: e instanceof Error ? e.message : String(e) });
    }
  };
  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 512 * 1024) { setStatus({ tone: "error", text: "The file is larger than 512 KB." }); return; }
    load(await file.text());
    if (fileInput.current) fileInput.current.value = "";
  };
  const fileName = `${(theme.name ?? presetLabel(theme.preset)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "theme"}.phonton-theme.json`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportTheme(theme));
      setStatus({ tone: "ok", text: "Theme JSON copied." });
    } catch {
      setStatus({ tone: "error", text: "The clipboard is unavailable. Use Download instead." });
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([exportTheme(theme)], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: fileName });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus({ tone: "ok", text: `Saved ${fileName}.` });
  };

  return <div className="theme-editor">
    <ThemePicker />

    <fieldset className="theme-block">
      <legend>Colors {theme.custom ? <span className="theme-note">· {theme.name ?? "Custom"}, edited from {presetLabel(theme.preset)}</span> : <span className="theme-note">· {presetLabel(theme.preset)}</span>}</legend>
      <div className="theme-colors">{MAIN.map(([key, label]) => <ColorField key={key} id={`theme-${key}`} label={label} value={palette[key]} onChange={hex => setColor(key, hex)} />)}</div>
      <details className="theme-more"><summary>More colors</summary>
        <div className="theme-colors">{MORE.map(([key, label]) => <ColorField key={key} id={`theme-${key}`} label={label} value={palette[key]} onChange={hex => setColor(key, hex)} />)}</div>
      </details>
      <ul className="theme-contrast" aria-label="Contrast">
        <Ratio label="text on background" fg={palette.fg} bg={palette.bg} />
        <Ratio label="muted text" fg={palette.muted} bg={palette.bg} />
        <Ratio label="accent on background" fg={palette.accent} bg={palette.bg} min={3} />
        <Ratio label="button label" fg={inkFor(palette.accent)} bg={palette.accent} />
      </ul>
      {theme.custom && <button type="button" className="theme-link" onClick={() => update({ custom: null, name: null })}>Reset to {presetLabel(theme.preset)}</button>}
    </fieldset>

    <fieldset className="theme-block">
      <legend>Density</legend>
      {(["comfortable", "compact"] as const).map(density => <label key={density} className="theme-option">
        <input type="radio" name="theme-density" checked={theme.density === density} onChange={() => update({ density })} /> {density}
      </label>)}
    </fieldset>

    <fieldset className="theme-block">
      <legend>Font</legend>
      {([["mono", "Monospace (system)"], ["sans", "Sans for prose, mono for code"], ["custom", "Installed font"]] as const).map(([font, label]) => <label key={font} className="theme-option">
        <input type="radio" name="theme-font" checked={theme.font === font} disabled={font === "custom" && !safeFontFamily(fontDraft)}
          onChange={() => update(font === "custom" ? { font, fontFamily: safeFontFamily(fontDraft) } : { font })} /> {label}
      </label>)}
      <label className="theme-font-name" htmlFor="theme-font-family">Font family name <span className="theme-note">must be installed; nothing is downloaded</span></label>
      <input id="theme-font-family" className="theme-hex theme-font-input" value={fontDraft} placeholder="Berkeley Mono" maxLength={48}
        onChange={e => { setFontDraft(e.target.value); const family = safeFontFamily(e.target.value); if (theme.font === "custom" && family) update({ fontFamily: family }); }} />
    </fieldset>

    <fieldset className="theme-block">
      <legend>Import and export</legend>
      <p className="theme-note">base16/base24 YAML, iTerm2 .itermcolors, Ghostty config, Windows Terminal scheme JSON, or a Phonton theme file.</p>
      <div className="theme-actions">
        <input ref={fileInput} id="theme-file" type="file" className="sr-only" accept=".yaml,.yml,.json,.itermcolors,.conf,.txt,text/*,application/json" onChange={e => void loadFile(e.target.files?.[0])} />
        <button type="button" onClick={() => fileInput.current?.click()}>Import file…</button>
        <button type="button" onClick={() => void copy()}>Copy theme JSON</button>
        <button type="button" onClick={download}>Download {fileName}</button>
      </div>
      <details className="theme-more"><summary>Paste a palette</summary>
        <label className="sr-only" htmlFor="theme-paste">Palette text</label>
        <textarea id="theme-paste" rows={6} value={paste} onChange={e => setPaste(e.target.value)} placeholder={"background = #1d1f21\nforeground = #c5c8c6\npalette = 6=#8abeb7"} spellCheck={false} />
        <button type="button" disabled={!paste.trim()} onClick={() => load(paste)}>Import pasted text</button>
      </details>
      {status && <p className="theme-status" data-tone={status.tone} role={status.tone === "error" ? "alert" : "status"}><Glyph state={status.tone === "ok" ? "pass" : "fail"} /> {status.text}</p>}
    </fieldset>
  </div>;
}
