import { test, expect } from "@playwright/test";

test.describe("Owner Staff Management", () => {
  test("renders staff directory and creates a pending cashier invite", async ({ page }) => {
    const inviteEmail = `playwright-staff-${Date.now()}@paisapos-test.com`;

    await page.goto("/staff");

    await expect(page.getByRole("heading", { name: "Staff" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("link", { name: "Staff", exact: true })).toBeVisible();
    await expect(page.locator("#staff-email")).toBeVisible();
    await expect(page.getByText("Active Directory")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Invitations", exact: true })).toBeVisible();

    await page.locator("#staff-email").fill(inviteEmail);
    await page.getByRole("button", { name: "Send Invite" }).click();

    await expect(page.getByText(`Invitation sent to ${inviteEmail}.`)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(inviteEmail, { exact: true })).toBeVisible();
  });
});
