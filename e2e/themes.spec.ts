import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { MODEL_BUTTON, openWorkbench } from "./mock-engine";

const PRESETS = ["nebula", "graphite", "light", "high-contrast"] as const;

async function withTheme(page: Page, preset: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript((value) => localStorage.setItem("phonton.theme.v2", value), JSON.stringify({ preset }));
}

const rootVar = (page: Page, name: string) => page.evaluate((n) => document.documentElement.style.getPropertyValue(n), name);

// Screenshot baselines: every preset, at the desktop and narrow project widths.
for (const preset of PRESETS) {
  test.describe(`${preset} theme`, () => {
    test("workbench", async ({ page }) => {
      await withTheme(page, preset);
      await openWorkbench(page, { recentRuns: true });
      await expect(page.getByRole("button", { name: MODEL_BUTTON })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", preset);
      await expect(page).toHaveScreenshot(`workbench-${preset}.png`, { fullPage: true, mask: [page.locator(".lw-version")] });
    });

    test("receipt", async ({ page }) => {
      await withTheme(page, preset);
      await openWorkbench(page);
      await page.getByLabel("Coding goal").fill("Reject a /todos limit outside 1-100 with HTTP 400");
      await page.getByRole("button", { name: /^Review plan/ }).click();
      await page.getByLabel(/Run these checks on my machine/).check();
      await page.getByRole("button", { name: /Run local goal/ }).click();
      await expect(page.getByRole("button", { name: /Apply selected changes/ })).toBeVisible();
      await page.getByRole("region", { name: "Candidate 2" }).scrollIntoViewIfNeeded();
      await expect(page).toHaveScreenshot(`receipt-${preset}.png`);
    });

    test("settings appearance", async ({ page }) => {
      await withTheme(page, preset);
      await openWorkbench(page);
      await page.getByRole("button", { name: "Settings" }).click();
      await expect(page.getByRole("radiogroup", { name: "Theme preset" })).toBeVisible();
      await expect(page).toHaveScreenshot(`settings-${preset}.png`);
    });
  });
}

test.describe("theme editor", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openWorkbench(page);
    await page.getByRole("button", { name: "Settings" }).click();
  });

  test("a preset applies at once and survives a reload", async ({ page }) => {
    await page.getByRole("radio", { name: /Light/ }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("editing a color makes a custom theme; reset returns to the preset", async ({ page }) => {
    await page.getByLabel("Accent", { exact: true }).fill("#ff00aa");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "custom");
    expect(await rootVar(page, "--ph-accent")).toBe("#ff00aa");
    await expect(page.getByRole("list", { name: "Contrast" })).toContainText("accent on background");
    await page.getByRole("button", { name: "Reset to Nebula" }).click();
    expect(await rootVar(page, "--ph-accent")).toBe("#2ec9b4");
  });

  test("density and font change the root and persist", async ({ page }) => {
    await page.getByLabel("compact").check();
    await page.getByLabel(/Sans for prose/).check();
    await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
    expect(await rootVar(page, "--ph-font-ui")).toContain("system-ui");
    await page.getByLabel(/Font family name/).fill("Iosevka Term");
    await page.getByLabel("Installed font").check();
    expect(await rootVar(page, "--ph-font-ui")).toMatch(/^"Iosevka Term", ui-monospace/);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
    expect(await rootVar(page, "--ph-font-ui")).toMatch(/^"Iosevka Term"/);
  });

  test("imports a base16 file, exports it, and the export imports back", async ({ page }) => {
    const yaml = ["scheme: \"Tomorrow Night\"", ...[
      "1d1f21", "282a2e", "373b41", "969896", "b4b7b4", "c5c8c6", "e0e0e0", "ffffff",
      "cc6666", "de935f", "f0c674", "b5bd68", "8abeb7", "81a2be", "b294bb", "a3685a",
    ].map((hex, i) => `base0${i.toString(16).toUpperCase()}: "${hex}"`)].join("\n");
    await page.locator("#theme-file").setInputFiles({ name: "tomorrow-night.yaml", mimeType: "text/yaml", buffer: Buffer.from(yaml) });
    await expect(page.getByRole("status").filter({ hasText: "Imported Tomorrow Night (base16)." })).toBeVisible();
    expect(await rootVar(page, "--ph-bg")).toBe("#1d1f21");
    await page.reload();
    expect(await rootVar(page, "--ph-bg")).toBe("#1d1f21");
    await page.getByRole("button", { name: "Settings" }).click();

    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: /^Download / }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe("tomorrow-night.phonton-theme.json");
    const exported = await readFile(await download.path(), "utf8");
    expect(JSON.parse(exported)).toMatchObject({ phonton_theme: 1, name: "Tomorrow Night", palette: { bg: "#1d1f21", accent: "#8abeb7" } });

    await page.getByRole("radio", { name: /Graphite/ }).click();
    await page.getByText("Paste a palette").click();
    await page.getByLabel("Palette text").fill(exported);
    await page.getByRole("button", { name: "Import pasted text" }).click();
    expect(await rootVar(page, "--ph-bg")).toBe("#1d1f21");
  });

  test("an unreadable file shows an error and keeps the current theme", async ({ page }) => {
    await page.locator("#theme-file").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("just some notes") });
    await expect(page.getByRole("alert")).toContainText("Unrecognized format");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "nebula");
  });

  test("a legacy cursor-dark choice opens as Graphite", async ({ page }) => {
    await page.evaluate(() => { localStorage.removeItem("phonton.theme.v2"); localStorage.setItem("phonton.theme", "cursor-dark"); });
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "graphite");
  });
});
