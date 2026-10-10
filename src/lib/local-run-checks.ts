import type { Check } from "./local-run";

/** Parse up to four directly executed checks, one JSON command array per line. */
export function parseLocalRunChecks(input: string): Check[] {
  const lines = input.split(/\r?\n/).map((text, index) => ({ text: text.trim(), line: index + 1 }))
    .filter(({ text }) => text.length > 0);
  if (lines.length > 4) throw new Error("Enter at most four verification commands.");
  return lines.map(({ text, line }) => {
    let command: unknown;
    try { command = JSON.parse(text); }
    catch { throw new Error(`Verification line ${line} must be a JSON command array.`); }
    if (!Array.isArray(command) || command.length === 0 ||
      !command.every(value => typeof value === "string") ||
      !command[0].trim()) {
      throw new Error(`Verification line ${line} must be a nonempty JSON array of strings beginning with a program.`);
    }
    return { program: command[0], args: command.slice(1) };
  });
}

/** Show the exact executable and argument boundaries reviewed by the engine. */
export function formatLocalRunCommand(check: Check): string {
  return JSON.stringify([check.program, ...check.args]);
}
