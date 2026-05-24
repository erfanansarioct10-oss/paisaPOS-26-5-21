import { test, expect } from "@playwright/test";

test.describe("Cart Ledger Financial Calculations & Boundary Tests", () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto("/billing");
    await expect(page.locator("#pos-search-input")).toBeVisible({ timeout: 10000 });
  });

  test("Should verify that empty cart checkout button is strictly disabled", async ({ page }) => {
    const checkoutBtn = page.getByRole("button", { name: "Checkout" });
    await expect(checkoutBtn).toBeDisabled();
  });

  test("Should clamp cart discounts exceeding subtotal and prevent negative totals", async ({ page }) => {
    // 1. Add a custom item worth Rs. 1000
    await page.getByRole("button", { name: "Custom" }).click();
    await page.getByPlaceholder("e.g. Hemming/Alteration, Gift Wrap").fill("E2E Discount Fuzzing Scarf");
    await page.getByPlaceholder("e.g. 150").fill("1000");
    await page.getByRole("button", { name: "Add to Cart" }).click();

    // Verify subtotal is Rs. 1000
    const subtotalText = page.locator("text=Subtotal:").locator("..").locator("span").last();
    await expect(subtotalText).toContainText("1,000");

    // 2. Attempt to input an extreme discount exceeding the subtotal (Rs. 1,500)
    const discountInput = page.getByPlaceholder("Discount Rs.");
    await discountInput.fill("1500");

    // 3. Assert that the discount applied is clamped to exactly Rs. 1000 (100% discount)
    const discountAppliedText = page.locator("text=Discount Applied:").locator("..").locator("span").last();
    await expect(discountAppliedText).toContainText("1,000");

    // 4. Assert that the total amount remains Rs. 0 and never goes negative
    const checkoutBtn = page.getByRole("button", { name: "Checkout" });
    await expect(checkoutBtn).toContainText("Rs. 0");
  });

  test("Should block and clamp negative discount inputs to positive defaults", async ({ page }) => {
    // 1. Add custom item worth Rs. 800
    await page.getByRole("button", { name: "Custom" }).click();
    await page.getByPlaceholder("e.g. Hemming/Alteration, Gift Wrap").fill("E2E Negative Fuzzing Item");
    await page.getByPlaceholder("e.g. 150").fill("800");
    await page.getByRole("button", { name: "Add to Cart" }).click();

    // 2. Type negative discount "-200"
    const discountInput = page.getByPlaceholder("Discount Rs.");
    await discountInput.fill("-200");

    // 3. Assert that discount input clamps the negative number to 0.
    // In React component: value={cartDiscount || ""}. When cartDiscount is clamped to 0, it renders as "" (empty string).
    await expect(discountInput).toHaveValue("");

    // 4. Assert that the total amount remains Rs. 800 (no discount applied)
    const checkoutBtn = page.getByRole("button", { name: "Checkout" });
    await expect(checkoutBtn).toContainText("Rs. 800");
  });
});
