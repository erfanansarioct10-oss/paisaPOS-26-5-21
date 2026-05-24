import { defineConfig, devices } from "@playwright/test";
import path from "path";

// Path to store auth credentials JSON
export const AUTH_FILE = path.join(__dirname, "playwright/.auth/owner.json");

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false, // POS transactions and DB state require deterministic sequential runs
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Restrict to 1 worker locally to prevent database locks and auth overlaps
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    viewport: { width: 1280, height: 720 },
    screenshot: "only-on-failure",
    // Inject testing header to bypass IP rate limits during local E2E test runs
    extraHTTPHeaders: {
      "x-paisapos-e2e-test": "true",
    },
    // Override default HeadlessChrome User-Agent to match a real human Chrome browser
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  },
  projects: [
    // 1. Session Onboarding Setup Project
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    // 2. Main E2E Browser Testing Project
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Automatically inject cached session cookies and local storage tokens
        storageState: AUTH_FILE,
      },
      dependencies: ["setup"],
    },
  ],
  // Dynamically spin up the local Next.js dev server if port 3000 is inactive
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120000,
  },
});
