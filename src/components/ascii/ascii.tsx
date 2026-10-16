import { useEffect, useState, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

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
export function AsciiBar({ value, max = 1, cells = 20, label, className }: { value: number | null; max?: number; cells?: number; label: string; className?: string }) {
  if (value == null || !(max > 0)) {
    return <span className={cn("ascii-bar", className)} role="progressbar" aria-label={label}><Spinner /> <span className="ascii-bar-text">measuring…</span></span>;
  }
  const ratio = Math.min(1, Math.max(0, value / max));
  const filled = Math.round(ratio * cells);
  return <span className={cn("ascii-bar", className)} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
    <span aria-hidden="true"><span className="ascii-bar-dim">[</span><span className="ascii-bar-fill">{"█".repeat(filled)}</span><span className="ascii-bar-dim">{"░".repeat(cells - filled)}]</span></span>
    <span className="ascii-bar-text">{Math.round(ratio * 100)}%</span>
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
