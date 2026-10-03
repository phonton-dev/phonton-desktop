// Ink & Photon: the desktop's ASCII art and motion. Surfaces are ink and
// paper; the φ logo's spectrum appears only on the φ and the photon.
import { useEffect, useState, type ReactNode } from "react";
import { PHI_PX } from "./phi-px";
import "./ink.css";

const SPECTRUM = ["#ffa94d", "#ff4f8b", "#9b45d9", "#2f6ff0", "#4fdde6"];
const RAMP = " .:-=+*#%@";

/** Spectrum colour at t in 0..1. */
export function spectrum(t: number): string {
  const x = Math.min(Math.max(t, 0), 1) * (SPECTRUM.length - 1);
  return SPECTRUM[Math.round(x)];
}

/** UI tick (80 ms) while mounted; frozen at 0 under reduced motion. */
function useTick(active = true): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const preference = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
    let timer: ReturnType<typeof setInterval> | undefined;
    const sync = () => {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
      if (preference?.matches) setTick(0);
      else timer = setInterval(() => setTick(t => t + 1), 80);
    };
    sync();
    preference?.addEventListener("change", sync);
    return () => {
      if (timer !== undefined) clearInterval(timer);
      preference?.removeEventListener("change", sync);
    };
  }, [active]);
  return tick;
}

function mixWhite(hex: string, k: number): string {
  const n = parseInt(hex, 16);
  const ch = (v: number) => Math.round(v + (255 - v) * k);
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

/** The φ logo as ASCII from its own pixels; a light wave runs across it. */
export function Phi({ animate = true, className = "" }: { animate?: boolean; className?: string }) {
  const tick = useTick(animate);
  const rows: ReactNode[] = [];
  for (let r = 0; r < 14; r++) {
    const cells: ReactNode[] = [];
    for (let c = 0; c < 26; c++) {
      const top = PHI_PX[r * 2][c], bottom = PHI_PX[r * 2 + 1][c];
      if (!top && !bottom) { cells.push(" "); continue; }
      const wave = animate ? Math.sin(tick * 0.21 - (c * 0.3 + r * 0.6)) : 0;
      const level = (n: number) => Math.min(n - 1, Math.floor(((wave + 1) / 2) * n));
      let ch: string;
      if (top && bottom) ch = RAMP[Math.min(9, Math.max(4, Math.round(7 + wave * 2)))];
      else if (top) ch = "`'\""[level(3)];
      else ch = ".,_"[level(3)];
      const color = mixWhite(top || bottom, Math.max(wave, 0) * 0.38);
      cells.push(<span key={c} style={{ color, fontWeight: top && bottom ? 700 : 400 }}>{ch}</span>);
    }
    rows.push(<div key={r}>{cells}</div>);
  }
  return <pre className={`ink-phi ${className}`} aria-hidden="true">{rows}</pre>;
}

export const STAGES = ["goal", "plan", "edit", "verify", "review", "remember"] as const;
export type Track = { kind: "idle" } | { kind: "active"; stage: number } | { kind: "failed"; stage: number } | { kind: "complete" };

/** goal ── plan ── edit ── verify ── review ── remember, with a photon. */
export function LoopTrack({ track }: { track: Track }) {
  const at = track.kind === "active" || track.kind === "failed" ? track.stage : -1;
  return <div className="ink-track" data-idle={track.kind === "idle" || undefined} role="img"
    aria-label={track.kind === "idle" ? "Loop: goal, plan, edit, verify, review, remember" : track.kind === "complete" ? "Run complete" : `${track.kind === "failed" ? "Stopped at" : "Working on"} ${STAGES[at]}`}>
    {STAGES.map((stage, i) => {
      const state = track.kind === "complete" || i < at ? "done" : i === at ? track.kind === "failed" ? "failed" : "active" : track.kind === "idle" ? "idle" : "todo";
      const mark = state === "done" ? "✓" : state === "active" ? "●" : state === "failed" ? "✗" : "·";
      return <span className="ink-step" key={stage}>
        <span className="ink-stage" data-state={state}><span className="m">{mark}</span>{stage}</span>
        {i < STAGES.length - 1 && <span className="ink-conn" data-done={state === "done" || undefined} data-live={state === "active" || undefined} style={{ ["--c" as string]: spectrum((i + 0.5) / 5), ["--i" as string]: i }}><span className="p" /></span>}
      </span>;
    })}
  </div>;
}

export type Verdict = "verified" | "partial" | "unverified" | "failed";
const STAMP: Record<Verdict, string> = { verified: "✓ VERIFIED", partial: "◐ PARTIAL CHECKS", unverified: "○ UNVERIFIED", failed: "✗ FAILED" };

/** Receipt card: dotted leaders, then a stamp of what the evidence supports. */
export function Receipt({ verdict, headline, rows, stampKey }: { verdict: Verdict; headline: string; rows: [string, ReactNode][]; stampKey: unknown }) {
  return <section className="ink-receipt" aria-label="Receipt">
    <header><span>receipt</span><span className="ink-stamp" data-verdict={verdict} key={String(stampKey)}>{STAMP[verdict]}</span></header>
    <p className="ink-headline">{headline}</p>
    <dl>{rows.map(([label, value]) => <div className="ink-leader" key={label}><dt>{label}</dt><span className="dots" aria-hidden="true" /><dd>{value}</dd></div>)}</dl>
  </section>;
}

/** Evidence stays exact from the first render, including for screen readers. */
export function Count({ value }: { value: number }) {
  return <>{value.toLocaleString()}</>;
}

/** ━━━━──── line gauge. */
export function Gauge({ frac, width = 10 }: { frac: number; width?: number }) {
  const filled = Math.round(Math.min(Math.max(frac, 0), 1) * width);
  return <span className="ink-gauge" aria-hidden="true"><b>{"━".repeat(filled)}</b>{"─".repeat(width - filled)}</span>;
}

/** Photon spinner (one dot orbiting a braille cell). */
export function Spinner() {
  const tick = useTick(true);
  return <span className="ink-spin" aria-hidden="true">{"⠁⠂⠄⡀⢀⠠⠐⠈"[Math.floor(tick / 2) % 8]}</span>;
}
