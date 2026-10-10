import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/local-run-apply.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2021 },
}).outputText;
const { localApplyEligibility, localMutationConfirmed, localMutationNeedsRecheck, localRollbackEligibility, localRunRepositorySelection } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

function fixture() {
  const check = { program: "node", args: ["--test"] };
  const candidate = { number: 2, stage: "complete", content_sha256: "abc", diff: "--- a/app.js\n+++ b/app.js\n", checks: [{ check, purpose: "verification", status: "passed", exit_code: 0 }] };
  const receipt = { id: "run-1", state: "review_ready", selected_candidate: 2, request: { repository: "C:\\Projects\\saved", checks: [check] }, git_index: { status: "passed", stage: "final review" } };
  return { receipt, candidate };
}

test("a saved run cannot Apply or Rollback while another repository is selected", () => {
  const { receipt } = fixture();
  assert.equal(localRunRepositorySelection(receipt, "C:\\Projects\\other", false).allowed, false);
  assert.match(localRunRepositorySelection(receipt, "", null).reason, /different repository/);
  assert.match(localRunRepositorySelection(receipt, "C:\\Projects\\saved", null).reason, /Checking/);
  assert.match(localRunRepositorySelection(receipt, "C:\\Projects\\saved", null, "engine unavailable").reason, /Repository check failed/);
  assert.equal(localRunRepositorySelection(receipt, "C:\\Projects\\saved\\.", true).allowed, true);
});

test("a lost mutation reply is confirmed only by the matching terminal journal", () => {
  const status = { run_id: "run-1", candidate_number: 2, state: "applied" };
  assert.equal(localMutationConfirmed("apply", "run-1", 2, status), true);
  assert.equal(localMutationConfirmed("rollback", "run-1", 2, status), false);
  status.state = "rolled_back";
  assert.equal(localMutationConfirmed("rollback", "run-1", 2, status), true);
  assert.equal(localMutationConfirmed("rollback", "another-run", 2, status), false);
  assert.equal(localMutationConfirmed("rollback", "run-1", 3, status), false);
  status.state = "rollback_prepared";
  assert.equal(localMutationConfirmed("rollback", "run-1", 2, status), false);
  assert.equal(localMutationConfirmed("apply", "run-1", 2, null), false);
});

test("a guarded retry blocked by an active engine lease still needs a journal recheck", () => {
  const retry = { action: "apply", retryReady: true };
  const prepared = { run_id: "run-1", candidate_number: 2, state: "prepared" };
  assert.equal(localMutationNeedsRecheck(retry, "apply", "run-1", 2, prepared), true);
  assert.equal(localMutationNeedsRecheck(retry, "apply", "run-1", 2, null), true);
  assert.equal(localMutationNeedsRecheck(retry, "apply", "run-1", 2, { ...prepared, state: "applied" }), false);
  assert.equal(localMutationNeedsRecheck(null, "apply", "run-1", 2, prepared), false);
});

test("a selected verified candidate with final Git index proof can Apply", () => {
  const { receipt, candidate } = fixture();
  assert.equal(localApplyEligibility(receipt, candidate).allowed, true);
});

test("rollback requires a matching existing-file Apply journal", () => {
  const { receipt, candidate } = fixture();
  const status = { schema: 2, run_id: "run-1", candidate_number: 2, state: "applied" };
  assert.equal(localRollbackEligibility(receipt, candidate, status).allowed, true);
  status.state = "rollback_prepared";
  assert.equal(localRollbackEligibility(receipt, candidate, status).allowed, true);
  status.state = "rolled_back";
  assert.equal(localRollbackEligibility(receipt, candidate, status).allowed, false);
  status.schema = 4;
  status.state = "applied";
  assert.match(localRollbackEligibility(receipt, candidate, status).reason, /cannot restore existing files/);
});

test("a witnessed, applied single creation can roll back on Windows only", () => {
  const { receipt, candidate } = fixture();
  receipt.request.new_file = "src/new.js";
  const status = {
    schema: 3, run_id: "run-1", candidate_number: 2, state: "applied",
    created_file: { path: "src/new.js", anchor: "apply-created-anchor.bin", identity: { kind: "windows_file_id_128", device: 1, file_id: "ab" }, publication_attempted: true },
  };
  assert.equal(localRollbackEligibility(receipt, candidate, status, true).allowed, true);
  assert.match(localRollbackEligibility(receipt, candidate, status, false).reason, /Windows only/);
  status.state = "rollback_prepared";
  assert.equal(localRollbackEligibility(receipt, candidate, status, true).allowed, true);
  status.created_file.identity = undefined;
  assert.match(localRollbackEligibility(receipt, candidate, status, true).reason, /no retained file-identity proof/);
  status.created_file.identity = { kind: "windows_file_id_128", device: 1, file_id: "ab" };
  receipt.request.editable_existing = ["app.js"];
  assert.match(localRollbackEligibility(receipt, candidate, status, true).reason, /does not match/);
  status.schema = 4;
  assert.equal(localRollbackEligibility(receipt, candidate, status, true).allowed, true);
  status.state = "prepared";
  assert.match(localRollbackEligibility(receipt, candidate, status, true).reason, /Finish or inspect/);
});

test("an older saved review without final Git index proof is review-only", () => {
  const { receipt, candidate } = fixture();
  delete receipt.git_index;
  assert.match(localApplyEligibility(receipt, candidate).reason, /no final Git staging integrity proof/);
});

test("staged creation and mismatched verification cannot Apply", () => {
  const { receipt, candidate } = fixture();
  candidate.stage = "creation_pending_edit";
  assert.equal(localApplyEligibility(receipt, candidate).allowed, false);
  candidate.stage = "complete";
  candidate.checks[0].check = { program: "node", args: ["--list-tests"] };
  assert.equal(localApplyEligibility(receipt, candidate).allowed, false);
});

test("passing preparation must precede the selected verification", () => {
  const { receipt, candidate } = fixture();
  const preparation = { program: "npm", args: ["ci", "--offline"] };
  receipt.request.preparation = preparation;
  candidate.checks.unshift({ check: preparation, purpose: "preparation", status: "passed", exit_code: 0 });
  assert.equal(localApplyEligibility(receipt, candidate).allowed, true);
  candidate.checks[0].status = "failed";
  assert.equal(localApplyEligibility(receipt, candidate).allowed, false);
});
