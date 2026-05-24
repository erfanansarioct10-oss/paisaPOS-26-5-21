import { test, expect } from "@playwright/test";

test.describe("Receipt Print Layout & Thermal Media CSS Tests", () => {
  
  test.beforeEach(async ({ page }) => {
    // Navigate directly to billing using global authenticated storageState
    await page.goto("/billing");
    await expect(page.locator("#pos-search-input")).toBeVisible({ timeout: 10000 });
  });

  test("Should hide standard UI headers and render correct thermal layout on print media emulation", async ({ page }) => {
    // 1. Add a custom item to cart to perform checkout
    await page.getByRole("button", { name: "Custom" }).click();
    await page.getByPlaceholder("e.g. Hemming/Alteration, Gift Wrap").fill("E2E Thermal Print Silk Scarf");
    await page.getByPlaceholder("e.g. 150").fill("900");
    await page.getByRole("button", { name: "Add to Cart" }).click();

    // 2. Select checkout and trigger receipt modal
    await page.getByRole("button", { name: "Fonepay" }).click();
    await page.getByRole("button", { name: "Checkout" }).click();

    // 3. Assert Receipt modal has rendered "Sale Completed" and print area is present
    const saleTitle = page.getByText("Sale Completed");
    await expect(saleTitle).toBeVisible({ timeout: 12000 });
    const printArea = page.locator(".print-area");
    await expect(printArea).toBeVisible();

    // 4. Emulate print media format in browser engine
    console.log("Emulating browser print media styling...");
    await page.emulateMedia({ media: "print" });

    // 5. Assert that non-printable UI components are hidden. 
    // In print media, globals.css overrides body * to visibility: hidden
    const sidebar = page.locator("aside");
    const sidebarVisibility = await sidebar.evaluate((el) => window.getComputedStyle(el).visibility);
    expect(sidebarVisibility).toBe("hidden");

    // 6. Assert that only the print-area receipt block remains fully visible in layout
    const printAreaVisibility = await printArea.evaluate((el) => window.getComputedStyle(el).visibility);
    expect(printAreaVisibility).toBe("visible");

    // 7. Verify print layout size conforms exactly to standard 80mm thermal roll widths
    const printAreaWidth = await printArea.evaluate((el) => window.getComputedStyle(el).width);
    // 80mm translates roughly to 302px at standard 96dpi, or verify print style rule applies
    console.log(`Print layout computed width: ${printAreaWidth}`);
    expect(printAreaWidth).toBe("302.359px"); // Exact 80mm width standard inside chromium engine

    // 8. Restore normal screen media view
    await page.emulateMedia({ media: "screen" });
    const sidebarRestoreVisibility = await sidebar.evaluate((el) => window.getComputedStyle(el).visibility);
    expect(sidebarRestoreVisibility).toBe("visible");

    // 9. Close Modal and complete test cleanly
    await page.getByRole("button", { name: "Close Terminal" }).click();
    await expect(page.getByText("POS Cart is Empty")).toBeVisible();
  });
});
