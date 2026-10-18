import { expect, test, type Page } from "@playwright/test";
import { openWorkbench } from "./mock-engine";

const runs = (page: Page) => page.getByRole("navigation", { name: "Workbench" }).getByRole("button", { name: "Runs" }).click();

async function runGoal(page: Page) {
  await page.getByLabel("Coding goal").fill("Reject a /todos limit outside 1-100 with HTTP 400");
  await page.getByRole("button", { name: /^Review plan/ }).click();
  await page.getByLabel(/Run these checks on my machine/).check();
  await page.getByRole("button", { name: /Run local goal/ }).click();
}

test("the record dashboard reads the engine record and every saved receipt", async ({ page }) => {
  const engine = await openWorkbench(page, { history: true });
  await runs(page);
  const record = page.getByRole("region", { name: "Record" });
  await expect(record).toContainText("12");
  await expect(record).toContainText("3 in a row");
  await expect(record).toContainText("best 5");
  await expect(record).toContainText("148,230");
  await expect(page.getByText("9 read")).toBeVisible();
  await expect(page.locator(".rr-outcomes")).toContainText("6 verified");
  await expect(page.locator(".rr-outcomes")).toContainText("1 stopped");
  await expect(page.getByText(/false dones caught/).locator("..")).toContainText("7");
  await expect(page.getByText(/^check runs$/).locator("..")).toContainText("6 passed of 13");
  await expect(page.getByText(/^API cost$/).locator("..")).toContainText("$0.00 for 7 managed · 1 unpriced");
  await expect(page.getByRole("table").first()).toContainText("todo-api");
  await expect(page.getByRole("table").first()).toContainText("4/5");
  await expect(page.getByText("7 of 9")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "50 verified runs" })).toContainText("12/50");
  await expect(page.getByRole("listitem").filter({ hasText: "Caught a false done" })).toContainText("Earned Oct 15, 2026");
  expect(engine.calls.filter(method => method === "local.run.read")).toHaveLength(9);
  // The sidebar mirrors the CLI status line.
  await expect(page.locator(".lw-side-status")).toContainText("record 12 of 16 verified");

  // Drill down: the receipt card for a run opened from the list.
  await page.getByRole("region", { name: "Saved runs" }).getByRole("button", { name: /Debounce the search input/ }).click();
  const receipt = page.getByRole("region", { name: "Receipt" });
  await expect(receipt).toContainText("VERIFIED");
  await expect(receipt).toContainText("3 tried · 2 repairs");
  await expect(receipt).toContainText("1 passed of 3 run");
  await expect(receipt).toContainText("$0.00 · managed local runtime");
  await expect(receipt).toContainText("src/routes/todos.ts");
  await expect(receipt).toContainText("Not applied. Your repository has not changed.");
  await expect(receipt).toContainText("Checks ran without filesystem or network isolation.");
  await expect(receipt).not.toContainText("streak", { ignoreCase: false });
});

test("a finished run lands its stamp, streak and loop state", async ({ page }) => {
  await openWorkbench(page, { recentRuns: true, runningPolls: 2 });
  await runGoal(page);
  const loop = page.getByRole("list", { name: "Goal progress" });
  await expect(loop).toContainText("edit: in progress");
  await expect(loop).toContainText("verify: in progress");
  await expect(page.getByText(/edited and checked on an isolated copy/)).toBeVisible();
  const receipt = page.getByRole("region", { name: "Receipt" });
  await expect(receipt).toContainText("✓ VERIFIED");
  await expect(receipt).toContainText("3 verified in a row");
  await expect(receipt).toContainText("11,140");
  await expect(loop).toContainText("review: waiting for you");
  await expect(loop).toContainText("remember: done");
  await page.getByRole("button", { name: /Apply selected changes/ }).click();
  await expect(receipt).toContainText("The original bytes of 1 file are backed up");
  await expect(loop).toContainText("review: done");
});

test("a rejected run resets the streak and proposes no files", async ({ page }) => {
  await openWorkbench(page, { scenario: "rejected", recentRuns: true });
  await runGoal(page);
  const receipt = page.getByRole("region", { name: "Receipt" });
  await expect(receipt).toContainText("✗ FAILED");
  await expect(receipt).toContainText("reset · needs passing checks");
  await expect(receipt).toContainText("No candidate passed, so no change is proposed.");
  await expect(page.getByRole("list", { name: "Goal progress" })).toContainText("verify: failed");
});

test("with no runs, the record shows an empty state and earns nothing", async ({ page }) => {
  await openWorkbench(page);
  await runs(page);
  await expect(page.getByText(/No runs yet/)).toBeVisible();
  await expect(page.getByRole("img", { name: "Phonton" })).toBeVisible();
  await page.getByRole("button", { name: "Start a goal" }).click();
  await expect(page.getByLabel("Coding goal")).toBeVisible();
});

test("an engine without a record keeps receipts and invents no progress", async ({ page }) => {
  await openWorkbench(page, { history: true, record: null });
  await runs(page);
  await expect(page.getByText(/This engine did not return its record/)).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "10 verified runs" })).toContainText("Needs the engine record");
  await expect(page.getByRole("listitem").filter({ hasText: "Repaired to green" })).toContainText("Earned");
  await expect(page.locator(".lw-side-status")).not.toContainText("record");
});

test("reduced motion stops the photon and stamps at once", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openWorkbench(page, { runningPolls: 3 });
  await runGoal(page);
  await expect(page.getByRole("list", { name: "Goal progress" })).toContainText("verify: in progress");
  await expect(page.locator(".loop-photon")).toHaveCount(0);
  await expect(page.locator(".stamp")).toHaveAttribute("data-phase", "2");
});
