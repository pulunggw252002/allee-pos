import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config — e2e POS flow (login → shift → order → payment → close).
 *
 * Konvensi:
 *   - workers: 1, fullyParallel: false → tests SERIAL supaya state shift/DB
 *     tidak saling tabrak (app pakai 1 DB SQLite lokal untuk testing).
 *   - webServer spawns `next dev` dengan DATABASE_URL override ke file SQLite
 *     khusus test (`test-pos.db`). Env var di process.env menang dari `.env.local`.
 *   - globalSetup mereset DB test dan menjalankan seed sebelum test dijalankan.
 *   - baseURL aman untuk `page.goto('/login')` dan `page.waitForURL('/order')`.
 */

const TEST_DB_PATH = "test-pos.db";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],

  globalSetup: "./tests/e2e/global-setup.ts",

  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 900 },
      },
    },
  ],

  webServer: {
    command: "npm run test:server",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: `file:${TEST_DB_PATH}`,
      DATABASE_AUTH_TOKEN: "",
      BETTER_AUTH_SECRET: "test-e2e-allee-pos-32char-minimum-secret-xyz",
      BETTER_AUTH_URL: "http://localhost:3100",
      PORT: "3100",
    },
    stdout: "pipe",
    stderr: "pipe",
  },
});
