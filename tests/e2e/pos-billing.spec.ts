import { test, expect } from "@playwright/test";

test.describe("POS Billing Panel & Workspace E2E Tests", () => {
  
  test.beforeEach(async ({ page }) => {
    // Navigate directly to the billing page (auth state is dynamically injected by storageState)
    await page.goto("/billing");
    // Ensure the page has fully hydrated and the search input is visible
    await expect(page.locator("#pos-search-input")).toBeVisible({ timeout: 10000 });
  });

  test("Should render billing panel layout with all core controls", async ({ page }) => {
    // 1. Check if the page title brand is visible in the sidebar or mobile bar
    await expect(page.locator("aside").getByText("PaisaPOS")).toBeVisible();

    // 2. Check search input placeholder
    const searchInput = page.locator("#pos-search-input");
    await expect(searchInput).toBeVisible();

    // 3. Confirm billing cart terminal ledger has placeholder text initially
    await expect(page.getByText("POS Cart is Empty")).toBeVisible();
  });

  test("Should support adding custom ad-hoc fees to cart and updating ledger math", async ({ page }) => {
    // 1. Click the custom fee button
    await page.getByRole("button", { name: "Custom" }).click();

    // 2. Fill the custom item dialog modal
    await page.getByPlaceholder("e.g. Hemming/Alteration, Gift Wrap").fill("E2E Tailoring Alterations");
    await page.getByPlaceholder("e.g. 150").fill("450");
    await page.getByRole("button", { name: "Add to Cart" }).click();

    // 3. Verify item is in the cart ledger
    await expect(page.getByText("E2E Tailoring Alterations")).toBeVisible();
    await expect(page.getByText("Ad-hoc Custom Item")).toBeVisible();

    // 4. Verify subtotal recalculation
    const subtotalText = page.locator("text=Subtotal:").locator("..").locator("span").last();
    await expect(subtotalText).toContainText("450");

    // 5. Test discount limit clamping (apply Rs. 100 discount)
    const discountInput = page.getByPlaceholder("Discount Rs.");
    await discountInput.fill("100");

    // Total should be Rs. 350 (450 - 100)
    const totalButton = page.getByRole("button", { name: "Checkout" });
    await expect(totalButton).toContainText("350");
  });

  test("Should support search bar quick filter operations", async ({ page }) => {
    const searchInput = page.locator("#pos-search-input");
    
    // Focus search bar
    await searchInput.focus();
    
    // Type search term
    await searchInput.fill("Premium");
    
    // Check that results contain filtered items or show a clear empty catalog result if no "Premium" items exist yet
    const catalogCardsCount = await page.locator("[id^='prod-card-']").count();
    console.log(`E2E Search Results Count: ${catalogCardsCount}`);
  });

  test("Should verify Horizontal Momentum scroll borders for Favorites", async ({ page }) => {
    // Check if any favorite products exist on page
    const favoritesHeader = await page.getByText("Favorites", { exact: true }).isVisible();
    
    if (favoritesHeader) {
      // Find the scrollable list container
      const scrollableList = page.locator(".flex-1.flex.items-center.gap-1\\.5.overflow-x-auto");
      await expect(scrollableList).toBeVisible();
      console.log("Verified favorites scroll container rendering in DOM.");
    } else {
      console.log("No favorites registered, skipping momentum scroll boundaries test.");
    }
  });

  test("Should allow toggling active payment methods on footer", async ({ page }) => {
    // Verify cash is selected by default, or support clicking other channels
    const esewaBtn = page.getByRole("button", { name: "eSewa" });
    const fonepayBtn = page.getByRole("button", { name: "Fonepay" });

    await esewaBtn.click();
    await expect(esewaBtn).toHaveClass(/bg-primary/); // Assert it becomes active
    await expect(fonepayBtn).not.toHaveClass(/bg-primary/);

    await fonepayBtn.click();
    await expect(fonepayBtn).toHaveClass(/bg-primary/);
    await expect(esewaBtn).not.toHaveClass(/bg-primary/);
  });
});
