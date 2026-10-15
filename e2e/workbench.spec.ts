import { expect, test } from "@playwright/test";
import { MOCK, MODEL_BUTTON, openWorkbench } from "./mock-engine";

const GOAL = "Reject a /todos limit outside 1-100 with HTTP 400";

test("first run: engine, model, repository, goal → plan → run → review → apply → rollback", async ({ page }) => {
  const engine = await openWorkbench(page, { repository: false });

  // Setup: the engine connects, a calibrated local model is selected, then a repository is opened.
  await expect(page.locator(".lw-engine")).toHaveText(/engine 0\.25\.0/);
  await expect(page.locator(".lw-engine")).toBeVisible();
  await expect(page.getByRole("img", { name: "Phonton" })).toBeVisible();
  await page.getByRole("button", { name: MODEL_BUTTON }).click();
  await expect(page.getByRole("heading", { name: "Local models" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Installed models" })).toBeVisible();
  await expect(page.getByText(MOCK.MODEL).first()).toBeVisible();
  await page.getByRole("button", { name: /Workspace/ }).click();

  await page.getByRole("button", { name: /Open repository/ }).click();
  await page.getByLabel("Repository folder path").fill(MOCK.REPOSITORY);
  await page.getByRole("button", { name: /Open folder/ }).click();
  await expect(page.getByRole("heading", { name: "What should we build in todo-api?" })).toBeVisible();

  // Goal → plan.
  const review = page.getByRole("button", { name: /^Review plan/ });
  await expect(review).toBeDisabled();
  await page.getByLabel("Coding goal").fill(GOAL);
  await review.click();
  const plan = page.getByRole("region", { name: "Reviewed plan" });
  await expect(plan).toContainText("EDIT src/routes/todos.ts");
  await expect(plan).toContainText("Check: npm test");
  await expect(plan).toContainText("1 file · 1 check");
  expect(engine.params["local.run.plan"]).toMatchObject({ goal: GOAL, repository: MOCK.REPOSITORY, approve_host_execution: false });

  // Approve host checks and run.
  await expect(page.getByRole("button", { name: /Run without checks/ })).toBeVisible();
  await page.getByLabel(/Run these checks on my machine/).check();
  await page.getByRole("button", { name: /Run local goal/ }).click();
  await expect.poll(() => engine.params["local.run.start"]).toMatchObject({ request: { goal: GOAL, approve_host_execution: true } });

  // Review: the failing first candidate and the verified repair are both on record.
  await expect(page.getByRole("status").filter({ hasText: "Candidate 2 passed your checks" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Candidate 1" })).toContainText("Check failed: npm test exited 1");
  await expect(page.getByLabel("Candidate 2 diff")).toContainText("limit must be an integer from 1 to 100");

  // Apply, then reject the applied change by restoring the original files.
  await page.getByRole("button", { name: /Apply selected changes/ }).click();
  await expect(page.getByText(/Applied src\/routes\/todos\.ts/)).toBeVisible();
  expect(engine.params["local.run.apply"]).toMatchObject({ candidate_number: 2, expected_repository: MOCK.REPOSITORY });
  await page.getByRole("button", { name: /Restore original files/ }).click();
  await expect(page.getByRole("heading", { name: "Original files restored" })).toBeVisible();
  expect(engine.calls).toContain("local.run.rollback");

  // New goal returns to an empty composer.
  await page.getByRole("button", { name: "New goal" }).click();
  await expect(page.getByLabel("Coding goal")).toHaveValue("");
});

test("rejected run: no candidate passes, nothing can be applied", async ({ page }) => {
  const engine = await openWorkbench(page, { scenario: "rejected" });
  await page.getByLabel("Coding goal").fill(GOAL);
  await page.getByRole("button", { name: /^Review plan/ }).click();
  await page.getByLabel(/Run these checks on my machine/).check();
  await page.getByRole("button", { name: /Run local goal/ }).click();

  await expect(page.getByRole("status").filter({ hasText: "No candidate passed your checks. Nothing was applied to your repository." })).toBeVisible();
  await expect(page.getByRole("region", { name: "Candidate 2" })).toContainText("Check failed");
  await expect(page.getByRole("button", { name: /Apply selected changes/ })).toHaveCount(0);
  expect(engine.calls).not.toContain("local.run.apply");
});

test("cancel a running goal", async ({ page }) => {
  const engine = await openWorkbench(page, { runningPolls: 1000 });
  await page.getByLabel("Coding goal").fill(GOAL);
  await page.getByRole("button", { name: /^Review plan/ }).click();
  await page.getByRole("button", { name: /Run without checks/ }).click();
  await page.getByRole("button", { name: "Cancel run" }).click();
  await expect(page.getByRole("button", { name: "Cancel requested…" })).toBeDisabled();
  expect(engine.calls).toContain("local.run.cancel");
});

test("offline engine: the workbench says so and offers reconnect", async ({ page }) => {
  await openWorkbench(page, { offline: true });
  await expect(page.getByText(/No local engine responded/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Reconnect" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Review plan/ })).toBeDisabled();
});

test("provider-key setup: theme step applies and keeps the choice", async ({ page }) => {
  await openWorkbench(page);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "General" }).click();
  await page.getByRole("button", { name: "Open provider-key workbench" }).click();
  await page.getByRole("button", { name: /Get started/ }).click();

  await expect(page.getByRole("list", { name: "Setup progress" })).toContainText("theme");
  await page.getByRole("radio", { name: /Graphite/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "graphite");
  await page.getByRole("button", { name: /Continue/ }).click();
  // The browser preview cannot start the engine for the provider path; Continue stays locked.
  await expect(page.locator(".setup-steps [aria-current=step]")).toContainText("engine");
  await expect(page.getByRole("button", { name: /Continue/ })).toBeDisabled();

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "graphite");
});
