import { test, expect } from "@playwright/test";

test.describe("Owner Activity Log", () => {
  test("renders the owner activity timeline filters and navigation", async ({ page }) => {
    await page.goto("/activity");

    await expect(page.getByRole("heading", { name: "Activity Log" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("link", { name: "Activity" })).toBeVisible();
    await expect(page.locator("#activity-search")).toBeVisible();
    await expect(page.locator("#activity-actor")).toBeVisible();
    await expect(page.locator("#activity-action")).toBeVisible();
    await expect(page.locator("#activity-result")).toBeVisible();

    await page.locator("#activity-search").fill("checkout");
    await page.getByRole("button", { name: "Apply" }).click();

    await expect(page).toHaveURL(/\/activity\?q=checkout/);
  });
});
