import { expect, test, type Page } from "@playwright/test";
import { MODEL_BUTTON, openWorkbench, type MockOptions } from "./mock-engine";

// Captures every main surface to $SHOTS_DIR for visual review, in the preset
// named by $TOUR_THEME (default nebula). playwright.config.ts only runs it when
// SHOTS_DIR is set; the asserted baselines live in themes.spec.ts.
const dir = process.env.SHOTS_DIR;
const theme = process.env.TOUR_THEME ?? "nebula";

async function open(page: Page, options: MockOptions & { repository?: boolean } = {}) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript((value) => localStorage.setItem("phonton.theme.v2", value), JSON.stringify({ preset: theme }));
  await openWorkbench(page, options);
}

async function plan(page: Page) {
  await expect(page.getByRole("button", { name: MODEL_BUTTON })).toBeVisible();
  await page.getByLabel("Coding goal").fill("Reject a /todos limit outside 1-100 with HTTP 400");
  await page.getByRole("button", { name: /^Review plan/ }).click();
  await expect(page.getByRole("button", { name: /Run without checks/ })).toBeVisible();
}

async function shot(page: Page, project: string, name: string) {
  // Sticky navigation is drawn where the page is scrolled; capture from the top.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${dir}/${theme}-${project}-${name}.png`, fullPage: true });
}

test("tour: goal, plan, run, receipt", async ({ page }, info) => {
  await open(page, { recentRuns: true, runningPolls: 2 });
  await expect(page.getByRole("button", { name: MODEL_BUTTON })).toBeVisible();
  await shot(page, info.project.name, "1-workbench");
  await plan(page);
  await shot(page, info.project.name, "2-plan");
  await page.getByLabel(/Run these checks on my machine/).check();
  await page.getByRole("button", { name: /Run local goal/ }).click();
  await expect(page.getByRole("button", { name: /Cancel run/ })).toBeVisible();
  await shot(page, info.project.name, "3-running");
  await page.getByRole("button", { name: /Apply selected changes/ }).click();
  await expect(page.getByRole("button", { name: /Restore original files/ })).toBeVisible();
  await shot(page, info.project.name, "4-applied");
});

test("tour: commands and runs", async ({ page }, info) => {
  await open(page, { recentRuns: true });
  await expect(page.getByRole("button", { name: MODEL_BUTTON })).toBeVisible();
  await page.getByRole("button", { name: "Commands" }).click();
  await expect(page.getByPlaceholder("Type a command…")).toBeVisible();
  await shot(page, info.project.name, "11-commands");
  await page.keyboard.press("Escape");
  await page.getByRole("navigation", { name: "Workbench" }).getByRole("button", { name: "Runs" }).click();
  await expect(page.getByRole("heading", { name: "Runs", exact: true })).toBeVisible();
  await shot(page, info.project.name, "12-runs");
});

test("tour: record, achievements, receipt card", async ({ page }, info) => {
  await open(page, { history: true });
  await page.getByRole("navigation", { name: "Workbench" }).getByRole("button", { name: "Runs" }).click();
  await expect(page.getByRole("region", { name: "Saved runs" })).toContainText("Sort todos by due date");
  await expect(page.getByText("9 read")).toBeVisible();
  await shot(page, info.project.name, "13-record");
  await page.getByRole("region", { name: "Saved runs" }).getByRole("button", { name: /Debounce the search input/ }).click();
  await expect(page.getByRole("region", { name: "Receipt" })).toContainText("VERIFIED");
  await shot(page, info.project.name, "14-receipt-card");
});

test("tour: empty record", async ({ page }, info) => {
  await open(page);
  await page.getByRole("navigation", { name: "Workbench" }).getByRole("button", { name: "Runs" }).click();
  await expect(page.getByText(/No runs yet/)).toBeVisible();
  await shot(page, info.project.name, "15-record-empty");
});

test("tour: rejected", async ({ page }, info) => {
  await open(page, { scenario: "rejected" });
  await plan(page);
  await page.getByLabel(/Run these checks on my machine/).check();
  await page.getByRole("button", { name: /Run local goal/ }).click();
  await expect(page.getByText(/No candidate passed your checks/)).toBeVisible();
  await shot(page, info.project.name, "5-rejected");
});

test("tour: models, settings, setup", async ({ page }, info) => {
  await open(page);
  await page.getByRole("button", { name: "Local models" }).click();
  await expect(page.getByRole("heading", { name: "Installed models" })).toBeVisible();
  await shot(page, info.project.name, "6-models");
  await page.getByRole("navigation", { name: "Workbench" }).getByRole("button", { name: "Goal" }).click();
  await page.getByRole("button", { name: "Settings" }).click();
  await shot(page, info.project.name, "7-settings");
  await page.getByRole("button", { name: "General" }).click();
  await page.getByRole("button", { name: "Open provider-key workbench" }).click();
  await expect(page.getByRole("button", { name: /Get started/ })).toBeVisible();
  await shot(page, info.project.name, "8-setup-welcome");
  await page.getByRole("button", { name: /Get started/ }).click();
  await shot(page, info.project.name, "9-setup-theme");
});

test("tour: provider shell", async ({ page }, info) => {
  await page.addInitScript(() => localStorage.setItem("phonton.setup.complete", "true"));
  await open(page, { repository: false });
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "General" }).click();
  await page.getByRole("button", { name: "Open provider-key workbench" }).click();
  await expect(page.getByRole("button", { name: /Open project folder/ })).toBeVisible();
  await shot(page, info.project.name, "10-provider-shell");
});
