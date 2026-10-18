import { useEffect, useState, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { LOOP_STAGES, type LoopStage, type StageState } from "@/lib/run-stats";

/** The ANSI Shadow wordmark, shared with the CLI. Do not swap for the compact pixel logo. */
const LOGO = [
  "██████╗ ██╗  ██╗ ██████╗ ███╗   ██╗████████╗ ██████╗ ███╗   ██╗",
  "██╔══██╗██║  ██║██╔═══██╗████╗  ██║╚══██╔══╝██╔═══██╗████╗  ██║",
  "██████╔╝███████║██║   ██║██╔██╗ ██║   ██║   ██║   ██║██╔██╗ ██║",
  "██╔═══╝ ██╔══██║██║   ██║██║╚██╗██║   ██║   ██║   ██║██║╚██╗██║",
  "██║     ██║  ██║╚██████╔╝██║ ╚████║   ██║   ╚██████╔╝██║ ╚████║",
  "╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝   ╚═╝    ╚═════╝ ╚═╝  ╚═══╝",
];

/**
 * Block cells in the foreground, box-drawing shadows muted. A change of
 * `sweep` replays one photon sweep across the letters (skipped under
 * reduced motion), so the mark moves only when state changes.
 */
export function AsciiLogo({ className, sweep }: { className?: string; sweep?: string | number }) {
  const rows = LOGO.map((row, i) => <span key={i}>{row.split(/(█+)/).map((run, j) => run && <span key={j} className={run[0] === "█" ? "b" : "s"}>{run}</span>)}{"\n"}</span>);
  return <div className={cn("ascii-logo", className)} role="img" aria-label="Phonton">
    <pre aria-hidden="true">{rows}</pre>
    {sweep !== undefined && <pre key={sweep} className="ascii-logo-sweep" aria-hidden="true">{LOGO.join("\n")}</pre>}
  </div>;
}

/** A titled panel drawn with a single-line border, like a box-drawing frame. */
export function Frame({ title, meta, tone, className, children, ...rest }: { title: ReactNode; meta?: ReactNode; tone?: "ok" | "warn" | "danger" | "accent"; className?: string; children: ReactNode } & Omit<HTMLAttributes<HTMLElement>, "title">) {
  return <section className={cn("frame", className)} data-tone={tone} {...rest}>
    <header className="frame-head"><span className="frame-title">{title}</span>{meta != null && <span className="frame-meta">{meta}</span>}</header>
    {children}
  </section>;
}

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const REDUCED = "(prefers-reduced-motion: reduce)";

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(REDUCED).matches);
  useEffect(() => {
    const query = window.matchMedia?.(REDUCED);
    if (!query) return;
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** Braille spinner for work in progress. Static under reduced motion. */
export function Spinner({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const timer = setInterval(() => setFrame(f => (f + 1) % SPINNER.length), 90);
    return () => clearInterval(timer);
  }, [reduced]);
  return <span className={cn("glyph spinner", className)} aria-hidden="true">{reduced ? "▶" : SPINNER[frame]}</span>;
}

/**
 * `[██████░░░░] 60%`. Pass `value: null` when the total is unknown: it shows a
 * spinner and no invented percentage.
 */
export function AsciiBar({ value, max = 1, cells = 20, label, text, className }: { value: number | null; max?: number; cells?: number; label: string; text?: ReactNode; className?: string }) {
  if (value == null || !(max > 0)) {
    return <span className={cn("ascii-bar", className)} role="progressbar" aria-label={label}><Spinner /> <span className="ascii-bar-text">measuring…</span></span>;
  }
  const ratio = Math.min(1, Math.max(0, value / max));
  const filled = Math.round(ratio * cells);
  return <span className={cn("ascii-bar", className)} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
    <span aria-hidden="true"><span className="ascii-bar-dim">[</span><span className="ascii-bar-fill">{"█".repeat(filled)}</span><span className="ascii-bar-dim">{"░".repeat(cells - filled)}]</span></span>
    <span className="ascii-bar-text">{text ?? `${Math.round(ratio * 100)}%`}</span>
  </span>;
}

export type GlyphState = "pass" | "fail" | "pending" | "run" | "idle" | "warn" | "busy";
const GLYPHS: Record<Exclude<GlyphState, "busy">, string> = { pass: "✓", fail: "✗", pending: "◇", run: "▶", idle: "·", warn: "◇" };

/**
 * A state mark: ✓ pass, ✗ fail, ◇ pending or unverified, ▶ running, · idle,
 * and `busy` for the spinner, all in the same one-cell box so a state change
 * never shifts the text beside it. Decorative; pair it with text.
 */
export function Glyph({ state, className }: { state: GlyphState; className?: string }) {
  if (state === "busy") return <Spinner className={className} />;
  return <span className={cn("glyph", className)} data-state={state} aria-hidden="true">{GLYPHS[state]}</span>;
}

const STAGE_GLYPH: Record<StageState, GlyphState> = { done: "pass", fail: "fail", warn: "warn", todo: "idle", active: "pending" };

/**
 * goal ─ plan ─ edit ─ verify ─ review ─ remember. While `busy`, active
 * stages spin and a photon runs along the wire into them. A change of `sweep`
 * replays one pass across the track. Both stop under reduced motion.
 */
export function LoopTrack({ stages, busy, sweep, className }: { stages: Record<LoopStage, StageState>; busy?: boolean; sweep?: string; className?: string }) {
  const reduced = useReducedMotion();
  const text = (state: StageState) => state === "active" ? busy ? "in progress" : "waiting for you" : state === "todo" ? "not started" : state === "warn" ? "unverified" : state === "fail" ? "failed" : "done";
  return <div className={cn("loop", className)}>
    <ol aria-label="Goal progress">{LOOP_STAGES.map((name, i) => {
      const state = stages[name];
      return <li key={name} data-state={state}>
        {i > 0 && <span className="loop-wire" aria-hidden="true">{busy && state === "active" && !reduced && <span className="loop-photon">●</span>}</span>}
        <span className="loop-stage"><Glyph state={state === "active" && busy ? "busy" : STAGE_GLYPH[state]} /> {name}<span className="sr-only">: {text(state)}</span></span>
      </li>;
    })}</ol>
    {sweep && !reduced && <span key={sweep} className="loop-sweep" aria-hidden="true" />}
  </div>;
}

const CANDIDATE_LOOP = [
  "edit ─────▶ isolated copy ─────▶ your checks",
  " ▲                                    │     ",
  " │                                    │     ",
  " └──────── repair on failure ◀────────┘     ",
];
const range = (row: number, from: number, to: number) => Array.from({ length: Math.abs(to - from) + 1 }, (_, i) => [row, from + (to > from ? i : -i)] as const);
const FORWARD = [...range(0, 5, 10), ...range(0, 26, 31)];
const REPAIR = [[1, 38], [2, 38], [3, 38], ...range(3, 37, 29), ...range(3, 9, 1), [2, 1], [1, 1]] as const;
const LABELS = [[0, 0, 3], [0, 12, 24], [0, 33, 43]];

/**
 * The candidate loop the engine runs. While `busy`, a photon travels the
 * forward path; it takes the repair path only once a receipt shows a
 * rejected candidate. Static under reduced motion.
 */
export function CandidateLoop({ busy, repairing, className }: { busy: boolean; repairing: boolean; className?: string }) {
  const reduced = useReducedMotion();
  const path = repairing ? [...FORWARD, ...REPAIR] : FORWARD;
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!busy || reduced) return;
    const timer = setInterval(() => setStep(s => s + 1), 70);
    return () => clearInterval(timer);
  }, [busy, reduced]);
  const photon = busy && !reduced ? path[step % path.length] : null;
  const kind = (row: number, col: number) => LABELS.some(([r, a, b]) => r === row && col >= a && col <= b) ? "l" : row === 3 && col >= 10 && col <= 28 ? "t" : row > 0 ? repairing ? "r" : "d" : "w";
  return <pre className={cn("candidate-loop", className)} aria-hidden="true">{CANDIDATE_LOOP.map((line, row) => <span key={row}>{[...line].map((ch, col) =>
    photon && photon[0] === row && photon[1] === col ? <span key={col} className="p">●</span> : <span key={col} className={kind(row, col)}>{ch}</span>)}{"\n"}</span>)}</pre>;
}

/** `label ........ value` inside a `<dl>`, like the CLI receipt. */
export function Leader({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return <div className={cn("leader", className)}><dt>{label}</dt><span className="leader-dots" aria-hidden="true" /><dd>{children}</dd></div>;
}

export type Verdict = "verified" | "unverified" | "failed";
const STAMPS: Record<Verdict, string> = { verified: "✓ VERIFIED", unverified: "○ UNVERIFIED", failed: "✗ FAILED" };

/** The CLI's receipt stamp: dots while the numbers count, then the verdict lands. */
export function Stamp({ verdict, holdMs = 0 }: { verdict: Verdict; holdMs?: number }) {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState(reduced || !holdMs ? 2 : 0);
  useEffect(() => {
    if (reduced || !holdMs) { setPhase(2); return; }
    setPhase(0);
    const land = setTimeout(() => setPhase(1), holdMs);
    const settle = setTimeout(() => setPhase(2), holdMs + 260);
    return () => { clearTimeout(land); clearTimeout(settle); };
  }, [verdict, holdMs, reduced]);
  return <span className="stamp" data-verdict={verdict} data-phase={phase}><span aria-hidden="true">{phase === 0 ? "· · ·" : STAMPS[verdict]}</span><span className="sr-only">{verdict}</span></span>;
}

/** Counts from zero to `target` once per `key`; shows the final value under reduced motion. */
export function useCountUp(target: number, key: unknown, ms = 700) {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced ? target : 0);
  useEffect(() => {
    if (reduced) { setValue(target); return; }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setValue(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, key, ms, reduced]);
  return value;
}

const EIGHTHS = " ▁▂▃▄▅▆▇█";

export type Column = { key: string; value: number | null; state: GlyphState; title: string; onClick?: () => void };

/** One block-character column per item, scaled to the largest value, with a state mark under each. */
export function AsciiColumns({ items, rows = 7, label, className }: { items: Column[]; rows?: number; label: string; className?: string }) {
  const max = Math.max(0, ...items.map(item => item.value ?? 0));
  const column = (value: number | null) => {
    const eighths = value && max ? Math.max(1, Math.round((value / max) * rows * 8)) : 0;
    return Array.from({ length: rows }, (_, row) => EIGHTHS[Math.min(8, Math.max(0, eighths - (rows - 1 - row) * 8))].repeat(3)).join("\n");
  };
  // At least eight slots, so a short history keeps the same bar spacing as a full one.
  return <div className={cn("cols", className)} role="group" aria-label={label} style={{ gridTemplateColumns: `repeat(${Math.max(items.length, 8)}, minmax(28px, 1fr))` }}>
    {items.map(item => <button key={item.key} type="button" className="col" data-state={item.state} title={item.title} aria-label={item.title} onClick={item.onClick} disabled={!item.onClick}>
      <span className="col-bar" aria-hidden="true">{column(item.value)}</span><Glyph state={item.state} />
    </button>)}
  </div>;
}
