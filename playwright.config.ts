import { defineConfig, devices } from "@playwright/test";

/**
 * One end-to-end happy path, run against the local dev server and the Convex
 * dev deployment.
 *
 * The unit and convex-test suites already cover the rules exhaustively. What
 * they cannot prove is that the pieces are wired together — that a real
 * browser can sign in, upload a file to Convex storage, and see a decision
 * land. That is all this is for, which is why there is one spec and not forty.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      // `channel: "chromium"` runs the full browser headlessly instead of the
      // separate chrome-headless-shell build, which is a second download for
      // no benefit here.
      use: { ...devices["Desktop Chrome"], channel: "chromium" },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000/signin",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
