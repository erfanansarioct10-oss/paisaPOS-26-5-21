import { test, expect } from "@playwright/test";

test.describe("Spotty Internet & Offline Resilience E2E Tests", () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto("/billing");
    await expect(page.locator("#pos-search-input")).toBeVisible({ timeout: 10000 });
  });

  test("Should handle network offline state gracefully and block checkout", async ({ page, context }) => {
    // 1. Add a custom item to the cart to populate active ledger
    await page.getByRole("button", { name: "Custom" }).click();
    await page.getByPlaceholder("e.g. Hemming/Alteration, Gift Wrap").fill("E2E Offline alter Fee");
    await page.getByPlaceholder("e.g. 150").fill("600");
    await page.getByRole("button", { name: "Add to Cart" }).click();

    // Verify cart added successfully
    await expect(page.getByText("E2E Offline alter Fee")).toBeVisible();

    // 2. Emulate network going offline
    console.log("Simulating E2E network disconnection...");
    await context.setOffline(true);

    // 3. Verify that the global offline warning banner is displayed at the top
    const offlineBanner = page.locator("#offline-warning-banner");
    await expect(offlineBanner).toBeVisible();
    await expect(offlineBanner).toContainText("Offline Mode — Connection lost");

    // 4. Try clicking the checkout button in offline state
    await page.getByRole("button", { name: "Checkout" }).click();

    // 5. Verify the error message displays in the cart ledger
    const errorBlock = page.locator("text=Checkout failed: Internet connection is offline.");
    await expect(errorBlock).toBeVisible();

    // 6. Ensure cart items are still safe and preserved locally (not wiped)
    await expect(page.getByText("E2E Offline alter Fee")).toBeVisible();

    // 7. Restore network connection (going back online)
    console.log("Simulating E2E network reconnection (online)...");
    await context.setOffline(false);

    // 8. Assert that the offline banner slides up and disappears
    await expect(offlineBanner).toBeHidden();

    // 9. Click checkout and confirm transaction succeeds online!
    await page.getByRole("button", { name: "Checkout" }).click();
    
    // Receipt modal must render Completed Sale
    await expect(page.getByText("Sale Completed")).toBeVisible({ timeout: 12000 });
    await expect(page.getByText("E2E Offline alter Fee")).toBeVisible();

    // 10. Close terminal
    await page.getByRole("button", { name: "Close Terminal" }).click();
    await expect(page.getByText("POS Cart is Empty")).toBeVisible();
  });
});
