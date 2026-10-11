import type { LocalReceipt } from "./local-run";

export type LocalRunUsage = {
  attempts: number;
  attemptsComplete: boolean;
  inputTokens: number;
  outputTokens: number;
  inputReported: number;
  outputReported: number;
  repairs: number;
  restarts: number;
};

/** Sum only runtime-reported counters; reserved calls without a reply remain unknown. */
export function summarizeLocalRunUsage(receipt: LocalReceipt): LocalRunUsage {
  const replies = [...(receipt.hypotheses ?? []), ...receipt.candidates];
  const attempts = Math.max(receipt.model_calls_reserved ?? 0, replies.length);
  const attemptsComplete = receipt.model_calls_reserved != null && receipt.model_calls_reserved >= replies.length;
  let inputTokens = 0;
  let outputTokens = 0;
  let inputReported = 0;
  let outputReported = 0;
  for (const reply of replies) {
    if (Number.isSafeInteger(reply.input_tokens) && reply.input_tokens! >= 0) {
      inputTokens += reply.input_tokens!;
      inputReported++;
    }
    if (Number.isSafeInteger(reply.output_tokens) && reply.output_tokens! >= 0) {
      outputTokens += reply.output_tokens!;
      outputReported++;
    }
  }
  return {
    attempts,
    attemptsComplete,
    inputTokens,
    outputTokens,
    inputReported,
    outputReported,
    repairs: receipt.candidates.filter(candidate => candidate.decision?.action === "repair").length,
    restarts: receipt.candidates.filter(candidate => candidate.decision?.action === "restart").length,
  };
}

/** Distinguish complete totals from lower bounds and entirely missing counters. */
export function tokenReading(tokens: number, reported: number, attempts: number, attemptsComplete: boolean): string {
  if (reported === 0) return "not reported";
  return `${reported < attempts || !attemptsComplete ? "at least " : ""}${tokens.toLocaleString()}`;
}
