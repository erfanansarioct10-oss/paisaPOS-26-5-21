import { test, expect } from "@playwright/test";

test.describe("Authentication Lockout E2E Cooldown Tests", () => {
  // Override global storageState to run on a clean, logged-out context
  test.use({ storageState: { cookies: [], origins: [] } });

  test("Should lockout after 5 failed login attempts and recover with clock fast-forward", async ({ page }) => {
    // 1. Install the clock mock BEFORE navigating to the page to intercept initial timers
    await page.clock.install();

    // 2. Navigate to the landing page
    await page.goto("/");
    await expect(page.locator("button[type='submit']")).toBeVisible();

    // Ensure we are in login mode (and not register mode)
    const isLoginButton = page.getByRole("button", { name: "Sign In to Store" });
    await expect(isLoginButton).toBeVisible();

    const emailInput = page.locator("#email");
    const passwordInput = page.locator("#pass");
    const invalidEmail = `unregistered-operator-${Date.now()}@pois.com`;
    const authErrorMessage = /Invalid email or password|Too many failed login attempts|Too many attempts|Too many requests|rate limit/i;

    // 3. Flood the login form with 5 incorrect attempts
    for (let i = 1; i <= 5; i++) {
      await emailInput.fill(invalidEmail);
      await passwordInput.fill(`badpass-${i}`);
      await isLoginButton.click();

      if (i < 5) {
        // Wait for server-side auth response error or rate-limit error to update local DOM attempts
        const errMessage = page.getByText(authErrorMessage);
        await expect(errMessage).toBeVisible({ timeout: 8000 });
      }
    }

    // 4. Assert lockout warning banner is visible
    const lockoutBanner = page.locator("text=Too many failed login attempts");
    await expect(lockoutBanner).toBeVisible({ timeout: 8000 });

    // 5. Assert the submit button is completely disabled
    await expect(isLoginButton).toBeDisabled();

    // 6. Manipulate the browser clock to fast-forward past the 30-second cooldown.
    // We tick the clock 1 second at a time to let React process and render state transitions smoothly.
    console.log("Fast-forwarding clock step-by-step E2E...");
    for (let tick = 0; tick < 35; tick++) {
      await page.clock.fastForward(1000);
      await page.waitForTimeout(10); // yields execution to allow React state updates to flush
    }

    // 7. Verify that lockout has automatically cleared and inputs are back online
    await expect(lockoutBanner).toBeHidden();
    await expect(isLoginButton).toBeEnabled();
  });
});
