import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

/** E2E against the production Vite build with a mocked `phonton serve`. */
export default defineConfig({
  testDir: "e2e",
  // The screenshot tour is a capture tool, not a check: run it with SHOTS_DIR set.
  testIgnore: process.env.SHOTS_DIR ? [] : ["**/tour.spec.ts"],
  fullyParallel: true,
  // Each worker is a full Chromium. Under memory pressure, extra workers fail
  // navigation or skip painting text in full-page screenshots.
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: "disabled", caret: "hide" } },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: "en-US",
    timezoneId: "UTC",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "narrow", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: `npm run build && npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
