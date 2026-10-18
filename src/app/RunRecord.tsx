import { useEffect, useMemo, useState, type ReactNode } from "react";
import { localRunApplyStatus, localRunRead, type LocalApplyReceipt, type LocalReceipt, type LocalRunAttempt, type LocalRunList, type RunRecord } from "@/lib/local-run";
import { summarizeLocalRunUsage, tokenReading } from "@/lib/local-run-usage";
import { achievements, apiCostLabel, diffFiles, formatDuration, personalRecords, repositoryName, runFacts, summarizeRuns, type Breakdown, type EarnedLog, type PersonalRecord, type RunFacts, type RunOutcome } from "@/lib/run-stats";
import { AsciiBar, AsciiColumns, AsciiLogo, Frame, Glyph, Leader, Stamp, useCountUp, type GlyphState, type Verdict } from "@/components/ascii/ascii";
import "./run-record.css";

const n = (value: number) => value.toLocaleString();
const OUTCOME_GLYPH: Record<RunOutcome, GlyphState> = { verified: "pass", unverified: "warn", failed: "fail", stopped: "idle", running: "run" };
const OUTCOME_TEXT: Record<RunOutcome, string> = { verified: "verified", unverified: "unverified", failed: "failed", stopped: "stopped before a model attempt", running: "running" };

/** One labelled reading on a dashboard strip. */
export function Tile({ label, children, detail }: { label: string; children: ReactNode; detail?: ReactNode }) {
  return <div className="lw-tile"><span className="lw-tile-label">{label}</span><span className="lw-tile-value">{children}</span>{detail && <span className="lw-tile-detail">{detail}</span>}</div>;
}

// Finished receipts never change, so a read is kept for the session.
const savedRuns = new Map<string, LocalReceipt | LocalRunAttempt>();

function useRunFacts(runs: LocalRunList | null) {
  const [state, setState] = useState<{ facts: RunFacts[]; loading: boolean; unreadable: number }>({ facts: [], loading: false, unreadable: 0 });
  useEffect(() => {
    if (!runs) { setState({ facts: [], loading: false, unreadable: 0 }); return; }
    let live = true;
    setState(current => ({ ...current, loading: true }));
    void Promise.all(runs.runs.map(async summary => {
      try {
        let saved = savedRuns.get(summary.id);
        if (!saved) {
          saved = await localRunRead(summary.id);
          if ("request" in saved || saved.state !== "started") savedRuns.set(summary.id, saved);
        }
        const apply = "request" in saved && saved.state === "review_ready" ? await localRunApplyStatus(summary.id).catch(() => null) : null;
        return runFacts(summary, saved, apply);
      } catch { return null; }
    })).then(results => {
      if (live) setState({ facts: results.filter((fact): fact is RunFacts => !!fact), loading: false, unreadable: results.filter(fact => !fact).length });
    });
    return () => { live = false; };
  }, [runs]);
  return state;
}

const AWARDS_KEY = "phonton.achievements.v1";
function readEarned(): EarnedLog {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(AWARDS_KEY) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry && typeof entry === "object"
      && (entry.runId === null || typeof entry.runId === "string") && (entry.at === null || typeof entry.at === "number")));
  } catch { return {}; }
}

const recordValue = (record: RunRecord | null, pick: (record: RunRecord) => ReactNode) => record ? pick(record) : "—";

/** The engine's all-time record, as the CLI's `phonton record` reports it. */
function RecordStrip({ record, recordError, connected }: { record: RunRecord | null; recordError: string | null; connected: boolean }) {
  const missing = !connected ? "engine offline" : recordError ? "unavailable" : "reading…";
  return <section className="rr-record" aria-label="Record">
    <div className="lw-tiles">
      <Tile label="verified runs" detail={record ? <AsciiBar label="Verified share of finished runs" cells={10} value={record.verified_runs} max={record.runs || 1} text={`of ${n(record.runs)}`} /> : missing}>{recordValue(record, r => n(r.verified_runs))}</Tile>
      <Tile label="streak" detail={record ? `best ${n(record.best_streak)}` : missing}>{recordValue(record, r => r.streak ? <><Glyph state="pass" /> {n(r.streak)} in a row</> : "0")}</Tile>
      <Tile label="tokens kept local" detail="Phonton-managed runtime">{recordValue(record, r => n(r.local_tokens))}</Tile>
      <Tile label="tokens to providers" detail="hosted provider runs">{recordValue(record, r => n(r.cloud_tokens))}</Tile>
      <Tile label="tokens, origin unknown" detail="external or older runtimes">{recordValue(record, r => n(r.unknown_tokens))}</Tile>
    </div>
    <p className="rr-note">{recordError ? `This engine did not return its record: ${recordError}` : "All-time record from the engine, shared with the CLI. Runs that reach a model attempt count; an unverified or failed run ends the streak."}</p>
  </section>;
}

function costSummary(facts: RunFacts[]) {
  const counted = facts.filter(fact => fact.counted);
  const managed = counted.filter(fact => fact.origin === "managed_verified").length;
  if (!counted.length) return "none recorded";
  if (managed === counted.length) return apiCostLabel("managed_verified");
  if (!managed) return apiCostLabel("unknown");
  return `$0.00 for ${managed} managed · ${counted.length - managed} unpriced`;
}

function History({ facts, onOpen }: { facts: RunFacts[]; onOpen?: (id: string) => void }) {
  const [metric, setMetric] = useState<"time" | "tokens">("time");
  const ordered = [...facts].filter(fact => fact.outcome !== "running").sort((a, b) => (a.recordedAt ?? 0) - (b.recordedAt ?? 0));
  const value = (fact: RunFacts) => metric === "time" ? fact.wallMs : fact.inputTokens == null && fact.outputTokens == null ? null : (fact.inputTokens ?? 0) + (fact.outputTokens ?? 0);
  const max = Math.max(0, ...ordered.map(fact => value(fact) ?? 0));
  const show = (amount: number | null) => amount == null ? "not reported" : metric === "time" ? formatDuration(amount) : `${n(amount)} tokens`;
  const date = (at: number | null) => at ? new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
  if (!ordered.length) return null;
  return <div className="rr-history">
    <div className="rr-history-head"><span>{metric === "time" ? "wall time" : "tokens"} per run · max {show(max)}</span>
      <span className="rr-toggle" role="group" aria-label="History measure">{(["time", "tokens"] as const).map(option => <button key={option} type="button" aria-pressed={metric === option} onClick={() => setMetric(option)}>{option}</button>)}</span></div>
    <AsciiColumns label="Saved runs, oldest first" items={ordered.map(fact => ({ key: fact.id, value: value(fact), state: OUTCOME_GLYPH[fact.outcome],
      title: `${fact.goal} · ${OUTCOME_TEXT[fact.outcome]} · ${show(value(fact))}${fact.recordedAt ? ` · ${new Date(fact.recordedAt).toLocaleString()}` : ""}`, onClick: onOpen && (() => onOpen(fact.id)) }))} />
    <div className="rr-history-axis"><span>{date(ordered[0].recordedAt)}</span><span>{date(ordered[ordered.length - 1].recordedAt)}</span></div>
  </div>;
}

function Breakdowns({ title, rows }: { title: string; rows: Breakdown[] }) {
  return <Frame className="rr-breakdown" title={title} meta={rows.length ? `${rows.length} ${rows.length === 1 ? "entry" : "entries"}` : undefined}>
    {rows.length ? <table><thead><tr><th scope="col">name</th><th scope="col">verified</th><th scope="col">tokens</th><th scope="col">time</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.key}><th scope="row" title={row.key}>{row.label}</th>
        <td><AsciiBar label={`${row.label} verified runs`} cells={8} value={row.verified} max={row.runs} text={`${row.verified}/${row.runs}`} /></td>
        <td>{n(row.inputTokens + row.outputTokens)}</td><td>{formatDuration(row.wallMs)}</td></tr>)}</tbody></table>
      : <p className="rr-empty">No counted runs in the saved receipts.</p>}
  </Frame>;
}

const bestValue = (best: PersonalRecord) => best.unit === "ms" ? formatDuration(best.value) : best.unit === "tokens" ? `${n(best.value)} tokens` : best.id === "best-streak" ? `${n(best.value)} verified in a row` : `${n(best.value)} candidates`;

export function RunsDashboard({ connected, runs, runsError, record, recordError, onOpen, onNewGoal }: { connected: boolean; runs: LocalRunList | null; runsError: string | null; record: RunRecord | null; recordError: string | null; onOpen?: (id: string) => void; onNewGoal: () => void }) {
  const { facts, loading, unreadable } = useRunFacts(connected ? runs : null);
  const summary = useMemo(() => summarizeRuns(facts), [facts]);
  const bests = useMemo(() => personalRecords(facts, record), [facts, record]);
  const awards = useMemo(() => achievements(record, facts, readEarned()), [facts, record]);
  useEffect(() => {
    if (loading) return;
    try { localStorage.setItem(AWARDS_KEY, JSON.stringify(awards.log)); } catch { /* Achievements are recomputed from receipts next time. */ }
  }, [awards, loading]);
  const byId = new Map(facts.map(fact => [fact.id, fact]));
  const earned = awards.list.filter(award => award.earned).length;
  const nothingYet = connected && runs && !runs.runs.length && (!record || !record.runs);

  return <>
    <RecordStrip record={record} recordError={recordError} connected={connected} />
    {nothingYet ? <section className="rr-start" aria-label="No runs yet">
      <AsciiLogo className="rr-logo" />
      <p>No runs yet. Your record starts with the first goal whose candidate passes your checks.</p>
      <button className="lw-primary" onClick={onNewGoal}>Start a goal</button>
    </section> : <div className="rr-grid">
      <Frame className="rr-recent" title={<><Glyph state={loading ? "busy" : "pending"} /> saved receipts</>} meta={runs ? `${summary.saved} read${runs.limited ? " · bounded list" : ""}${unreadable ? ` · ${unreadable} unreadable` : ""}` : undefined}>
        {!connected ? <p className="rr-empty">Connect the engine to read saved receipts.</p>
          : runsError ? <p className="rr-empty">Saved runs unavailable: {runsError}</p>
          : !runs || (loading && !facts.length) ? <p className="rr-empty">Reading saved receipts…</p>
          : !facts.length ? <p className="rr-empty">No saved receipts on this machine yet.</p>
          : <>
            <p className="rr-outcomes"><span><Glyph state="pass" /> {summary.verified} verified</span><span><Glyph state="warn" /> {summary.unverified} unverified</span><span><Glyph state="fail" /> {summary.failed} failed</span>{summary.stopped > 0 && <span><Glyph state="idle" /> {summary.stopped} stopped</span>}</p>
            <History facts={facts} onOpen={onOpen} />
            <dl className="rr-leaders">
              <Leader label="candidates tried">{n(summary.candidates)}{summary.counted ? ` · ${(summary.candidates / summary.counted).toFixed(1)} per run` : ""}</Leader>
              <Leader label="false dones caught">{n(summary.falseDones)}</Leader>
              <Leader label="check runs">{n(summary.checksPassed)} passed of {n(summary.checksRun)}</Leader>
              <Leader label="tokens in">{summary.tokensPartial ? "at least " : ""}{n(summary.inputTokens)}</Leader>
              <Leader label="tokens out">{summary.tokensPartial ? "at least " : ""}{n(summary.outputTokens)}</Leader>
              <Leader label="wall time">{formatDuration(summary.wallMs)}</Leader>
              <Leader label="API cost">{costSummary(facts)}</Leader>
            </dl>
          </>}
      </Frame>
      <Frame className="rr-awards" title="achievements" meta={`${earned} of ${awards.list.length}`}>
        <ul>{awards.list.map(award => <li key={award.id} data-earned={award.earned || undefined}>
          <span className="rr-award-title"><Glyph state={award.earned ? "pass" : "idle"} /> {award.title}</span>
          <span className="rr-award-detail">{award.detail}</span>
          {award.earned ? award.runId ? <button className="lw-tile-link" disabled={!onOpen} onClick={() => onOpen?.(award.runId!)}>{award.earnedAt ? `Earned ${new Date(award.earnedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}` : "Open the run"}</button> : <span className="rr-award-meta">From your engine record</span>
            : award.progress ? <AsciiBar label={`${award.title} progress`} cells={10} value={award.progress.value} max={award.progress.target} text={`${award.progress.value}/${award.progress.target}`} />
            : <span className="rr-award-meta">{award.id.startsWith("verified") || award.id.startsWith("streak") || award.id === "first-verified" ? "Needs the engine record" : "Not in your saved receipts yet"}</span>}
        </li>)}</ul>
      </Frame>
      <Frame className="rr-bests" title="personal records" meta="saved receipts">
        {bests.length ? <dl className="rr-leaders">{bests.map(best => <Leader key={best.id} label={best.label}>{best.runId ? <button className="lw-tile-link" disabled={!onOpen} onClick={() => onOpen?.(best.runId!)}>{bestValue(best)}</button> : bestValue(best)}</Leader>)}</dl>
          : <p className="rr-empty">Personal records appear after your first verified run.</p>}
      </Frame>
      <Breakdowns title="by repository" rows={summary.byRepo} />
      <Breakdowns title="by model" rows={summary.byModel} />
    </div>}
    {!!runs?.runs.length && <section className="rr-runs" aria-label="Saved runs">
      <h2>Saved runs</h2>
      <ul>{runs.runs.map(run => {
        const fact = byId.get(run.id);
        return <li key={run.id}><button disabled={!connected || !onOpen} onClick={() => onOpen?.(run.id)} title={run.goal}>
          <span className="rr-run-goal"><Glyph state={fact ? OUTCOME_GLYPH[fact.outcome] : "idle"} /> {fact?.goal ?? run.goal}</span>
          <span>{fact?.repository ? repositoryName(fact.repository) : "—"}</span>
          <span>{fact?.model ?? run.model}</span>
          <span>{fact ? `${fact.candidates} ${fact.candidates === 1 ? "candidate" : "candidates"}` : "—"}</span>
          <span>{fact ? `${fact.checksPassed}/${fact.checksRun} checks` : "—"}</span>
          <span>{fact && (fact.inputTokens != null || fact.outputTokens != null) ? `${n((fact.inputTokens ?? 0) + (fact.outputTokens ?? 0))} tok` : "—"}</span>
          <span>{fact?.wallMs != null ? formatDuration(fact.wallMs) : "—"}</span>
          <span>{run.recorded_at_unix_ms ? new Date(run.recorded_at_unix_ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : run.id.slice(0, 8)}</span>
        </button></li>;
      })}</ul>
    </section>}
  </>;
}

const VERDICT: Record<RunOutcome, Verdict> = { verified: "verified", unverified: "unverified", failed: "failed", stopped: "failed", running: "failed" };

/** The CLI receipt card for one finished run: numbers count up, then the verdict stamps. */
export function ReceiptCard({ receipt, applyStatus, streak }: { receipt: LocalReceipt; applyStatus: LocalApplyReceipt | null; streak: number | null }) {
  const fact = runFacts({ id: receipt.id, goal: receipt.request.goal, model: receipt.profile.model, recorded_at_unix_ms: 0 }, receipt, applyStatus);
  const usage = summarizeLocalRunUsage(receipt);
  const selected = receipt.candidates.find(candidate => candidate.number === receipt.selected_candidate);
  const files = selected ? diffFiles(selected.diff) : [];
  const key = receipt.id;
  const fileCount = useCountUp(files.length, key);
  const added = useCountUp(files.reduce((total, file) => total + file.added, 0), key);
  const removed = useCountUp(files.reduce((total, file) => total + file.removed, 0), key);
  const passed = useCountUp(fact.checksPassed, key);
  const tokensIn = useCountUp(usage.inputTokens, key);
  const tokensOut = useCountUp(usage.outputTokens, key);
  const wall = useCountUp(fact.wallMs ?? 0, key);
  const verified = fact.outcome === "verified";
  const showStreak = streak != null && (verified ? streak > 0 : streak === 0);
  const rollback = applyStatus?.state === "applied" ? `Applied. The original bytes of ${applyStatus.files?.length ?? 1} ${applyStatus.files?.length === 1 ? "file are" : "files are"} backed up in this run; restore them below.`
    : applyStatus?.state === "rolled_back" ? "Rolled back. The original files are restored."
    : applyStatus?.state === "prepared" || applyStatus?.state === "rollback_prepared" ? "An earlier apply or rollback stopped before confirmation. Recover it below."
    : verified ? "Not applied. Your repository has not changed." : "Nothing was applied. Your repository has not changed.";
  return <Frame className="rr-receipt" aria-label="Receipt" tone={verified ? "ok" : fact.outcome === "unverified" ? "warn" : "danger"} title="receipt" meta={<Stamp verdict={VERDICT[fact.outcome]} holdMs={700} />}>
    <div className="rr-receipt-body">
      <dl className="rr-leaders">
        <Leader label="files">{n(fileCount)} <span className="rr-add">+{n(added)}</span> <span className="rr-del">−{n(removed)}</span></Leader>
        <Leader label="checks">{n(passed)} passed of {n(fact.checksRun)} run</Leader>
        <Leader label="candidates">{n(fact.candidates)} tried{usage.repairs ? ` · ${usage.repairs} ${usage.repairs === 1 ? "repair" : "repairs"}` : ""}{usage.restarts ? ` · ${usage.restarts} ${usage.restarts === 1 ? "restart" : "restarts"}` : ""}</Leader>
        <Leader label="tokens in">{usage.inputReported ? tokenReading(tokensIn, usage.inputReported, usage.attempts, usage.attemptsComplete) : "not reported"}</Leader>
        <Leader label="tokens out">{usage.outputReported ? tokenReading(tokensOut, usage.outputReported, usage.attempts, usage.attemptsComplete) : "not reported"}</Leader>
        <Leader label="time">{fact.wallMs != null ? formatDuration(wall) : "not recorded"}</Leader>
        <Leader label="API cost">{apiCostLabel(fact.origin)}</Leader>
        <Leader label="model">{receipt.profile.model}</Leader>
        {showStreak && <Leader label="streak"><span className={verified ? "rr-add" : undefined}>{verified ? `${n(streak)} verified in a row` : "reset · needs passing checks"}</span></Leader>}
      </dl>
      <div className="rr-receipt-side">
        <h3>changed files</h3>
        {files.length ? <ul className="rr-files">{files.map(file => <li key={file.path}><span title={file.path}>{file.path}</span><span><span className="rr-add">+{file.added}</span> <span className="rr-del">−{file.removed}</span></span></li>)}</ul>
          : <p>{receipt.candidates.length ? "No candidate passed, so no change is proposed." : "No candidate was generated."}</p>}
        <h3>rollback point</h3>
        <p>{rollback}{receipt.git_index?.status === "passed" ? " The Git index matched from planning to review." : ""}</p>
        <h3>known gaps</h3>
        {receipt.known_gaps.length ? <ul className="rr-gaps">{receipt.known_gaps.map(gap => <li key={gap}>{gap}</li>)}</ul> : <p>None recorded.</p>}
      </div>
    </div>
  </Frame>;
}
