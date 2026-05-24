import { test as setup, expect } from "@playwright/test";
import { AUTH_FILE } from "../playwright.config";

setup("authenticate and seed store session", async ({ page }) => {
  // Set larger timeout for the initial cold-start server boot/compilation
  setup.setTimeout(60000);

  await page.goto("/");

  const testEmail = "playwright-e2e-owner@paisapos-test.com";
  const testPassword = "E2eTestPassword123!";

  // 1. Attempt login first (in case the test store is already registered)
  await page.locator("#email").fill(testEmail);
  await page.locator("#pass").fill(testPassword);
  await page.getByRole("button", { name: "Sign In to Store" }).click();

  // Wait a short moment to see if we redirect or fail
  try {
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 4000 });
    console.log("Logged in successfully using pre-existing E2E test account.");
  } catch {
    console.log("Pre-existing login failed or timed out. Attempting dynamic registration...");

    // 2. If login fails, register a brand new store and user
    await page.goto("/");
    await page.getByText("Need a new store account? Register here").click();

    // Fill registration details
    await page.locator("#name").fill("Playwright Automated Tester");
    await page.locator("#store").fill("E2E Test Boutique Hub");
    await page.locator("#email").fill(testEmail);
    await page.locator("#pass").fill(testPassword);
    
    // Submit registration
    await page.getByRole("button", { name: "Register Store & Owner" }).click();

    // Assert that registration completes and redirects successfully to the authenticated dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
    console.log("Successfully registered and onboarded new E2E test store.");
  }

  // 3. Dump cookies and localStorage to cache the session
  await page.context().storageState({ path: AUTH_FILE });
});
