import { chromium } from "@playwright/test";

async function main() {
  console.log("Launching browser...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Listen for console logs
  page.on("console", (msg) => {
    console.log(`[BROWSER CONSOLE] [${msg.type()}] ${msg.text()}`);
  });

  // Listen for page errors
  page.on("pageerror", (err) => {
    console.log("[BROWSER PAGE ERROR]", err.message);
  });

  // Listen for failed requests
  page.on("requestfailed", (req) => {
    console.log(`[BROWSER REQUEST FAILED] ${req.url()}: ${req.failure()?.errorText}`);
  });

  console.log("Navigating to http://localhost:3000...");
  await page.goto("http://localhost:3000");

  console.log("Logging in...");
  await page.fill('input[type="email"]', "browser-owner@paisapos-test.com");
  await page.fill('input[type="password"]', "Password123!");
  await page.click('button[type="submit"]');

  console.log("Waiting for dashboard to load...");
  await page.waitForURL("**/dashboard", { timeout: 10000 });
  console.log("Successfully logged in and reached dashboard!");

  // Wait a bit to ensure dashboard is settled
  await page.waitForTimeout(2000);

  console.log("Navigating to /invoices...");
  await page.click('a[href="/invoices"]');
  await page.waitForURL("**/invoices", { timeout: 10000 });
  console.log("Successfully navigated to /invoices!");

  // Wait a bit for data loading
  await page.waitForTimeout(3000);

  console.log("Closing browser...");
  await browser.close();
}

main().catch(console.error);
