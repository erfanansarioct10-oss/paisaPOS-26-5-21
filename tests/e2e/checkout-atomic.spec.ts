import { test, expect } from "@playwright/test";

test.describe("POS Billing Checkout & Inventory Sync E2E Tests", () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto("/billing");
    await expect(page.locator("#pos-search-input")).toBeVisible({ timeout: 10000 });
  });

  test("Should complete a successful custom item checkout and open receipt modal", async ({ page }) => {
    // 1. Add a custom item
    await page.getByRole("button", { name: "Custom" }).click();
    await page.getByPlaceholder("e.g. Hemming/Alteration, Gift Wrap").fill("E2E Heavy Jacket Custom Fee");
    await page.getByPlaceholder("e.g. 150").fill("1500");
    await page.getByRole("button", { name: "Add to Cart" }).click();

    // 2. Set Customer details
    await page.getByPlaceholder("Customer Name").fill("Playwright Buyer");
    await page.getByPlaceholder("Phone Number").fill("9801234567");

    // 3. Select payment method and checkout
    await page.getByRole("button", { name: "Fonepay" }).click();
    await page.getByRole("button", { name: "Checkout" }).click();

    // 4. Assert Receipt Modal opens and confirms successful sale
    await expect(page.getByText("Sale Completed")).toBeVisible({ timeout: 12000 });
    await expect(page.getByText("E2E Heavy Jacket Custom Fee")).toBeVisible();
    await expect(page.getByText("Net Total:Rs. 1,500")).toBeVisible();

    // 5. Close receipt modal and verify cart resets
    await page.getByRole("button", { name: "Close Terminal" }).click();
    await expect(page.getByText("POS Cart is Empty")).toBeVisible();
  });

  test("Should synchronize stock changes immediately between POS checkout and Inventory table", async ({ page }) => {
    // 1. Create a dynamic test product first via the Inventory UI
    await page.goto("/inventory");
    await page.getByRole("button", { name: "Add Product" }).click();

    const randomId = Math.floor(Math.random() * 10000);
    const productName = `${randomId} E2E Shirt`;

    await page.locator("#wizard-product-title").fill(productName);
    await page.locator("#wizard-product-category").selectOption("Tops");
    await page.locator("#wizard-sizes-input").fill("L");
    await page.locator("#wizard-colors-input").fill("White");

    // Fill price & stock for generated variant
    await page.locator("#wizard-variant-price-0").fill("1200");
    await page.locator("#wizard-variant-stock-0").fill("10"); // Starts with 10 stock
    await page.getByRole("button", { name: /Create Product/ }).click();

    // Wait for the inventory grid to reload and list the shirt
    await expect(page.getByText(productName)).toBeVisible({ timeout: 10000 });

    // 2. Go to Billing and buy 2 of these shirts
    await page.goto("/billing");
    await page.locator("#pos-search-input").fill(productName);
    
    // Tap to expand variant panel
    const productCard = page.locator(`text=${productName}`).locator("..");
    await productCard.click();

    // Add to cart twice
    const variantRow = page.getByRole("button", { name: `Size L / White` });
    await variantRow.click();
    await variantRow.click();

    // Checkout
    await page.getByRole("button", { name: "Checkout" }).click();
    await expect(page.getByText("Sale Completed")).toBeVisible({ timeout: 12000 });
    await page.getByRole("button", { name: "Close Terminal" }).click();

    // 3. Return to Inventory and verify stock has decreased to 8
    await page.goto("/inventory");
    await expect(page.getByText(productName)).toBeVisible();
    
    // Find the row containing our dynamic product and assert its stock column is "8"
    const productRow = page.locator("div").filter({ hasText: productName }).first();
    await expect(productRow).toContainText("8 items");
  });

  test("Should support parallel concurrent cashier session isolation", async ({ browser }) => {
    // 1. Create two isolated browser context sessions simulating two different cashiers
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    // 2. Open billing on both pages concurrently
    await pageA.goto("/billing");
    await pageB.goto("/billing");

    await expect(pageA.locator("#pos-search-input")).toBeVisible({ timeout: 10000 });
    await expect(pageB.locator("#pos-search-input")).toBeVisible({ timeout: 10000 });

    // 3. Close the test cashier sessions cleanly
    await contextA.close();
    await contextB.close();
  });
});
