import { chromium } from "playwright";

// Covers Phase 1 of the "all-in-one business app" idea (2026-08-30 discussion):
// - Login lands on the Home icon-launcher, not POS.
// - Home has a tile for every section, including Events and Reporting.
// - Reporting is NOT in the shared top nav bar (only reachable via Home).
// - The Home button (visible on every screen) returns to the grid from anywhere.
// - The in-page Sales History <-> Product History switcher works without the nav.

const BASE = process.env.TEST_BASE || "http://localhost:8942";
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (err) => errors.push("pageerror: " + err.message));

await page.goto(BASE + "/index.html");
await page.click('button[type="submit"]');

// --- Login lands on Home, not POS ---
await page.waitForSelector(".home-grid", { timeout: 5000 });
console.log("STEP: login landed on the Home screen (icon grid present)");
const barcodeInputVisible = await page.locator("#barcode-input").count();
if (barcodeInputVisible !== 0) errors.push("Expected POS's #barcode-input NOT to be present on initial load (should land on Home)");

// --- Home has a tile for every expected section ---
const tileIds = await page.locator("[data-home-tile]").evaluateAll((els) => els.map((e) => e.dataset.homeTile));
console.log("STEP: home tile route ids =", tileIds);
for (const expected of ["pos", "inventory-search", "customers", "events", "reporting-sales", "settings"]) {
  if (!tileIds.includes(expected)) errors.push(`Home is missing a tile for "${expected}"`);
}

// --- Reporting is not in the shared top nav (no dropdown/toggle for it) ---
const reportingNavCount = await page.locator('[data-nav-toggle="reporting"], [data-nav="reporting-sales"], [data-nav="reporting-products"]').count();
console.log("STEP: reporting elements in the shared nav bar =", reportingNavCount);
if (reportingNavCount !== 0) errors.push("Reporting should not appear in the shared top nav bar anymore");

// --- Events tile takes you to the Events screen ---
await page.click('[data-home-tile="events"]');
await page.waitForSelector('[data-action="add-event"]');
console.log("STEP: Events tile opened the Events screen");

// --- Home button (visible on every screen) returns to the grid ---
await page.click("#home-btn");
await page.waitForSelector(".home-grid");
console.log("STEP: Home button returned to the icon grid from Events");

// --- Reporting tile -> Sales History, then the in-page switcher -> Product History, and back ---
await page.click('[data-home-tile="reporting-sales"]');
await page.waitForSelector("#sales-summary");
console.log("STEP: Reporting tile opened Sales History");

await page.click('[data-action="report-tab-products"]');
await page.waitForSelector("#ph-summary");
console.log("STEP: in-page switcher moved from Sales History to Product History");

await page.click('[data-action="report-tab-sales"]');
await page.waitForSelector("#sales-summary");
console.log("STEP: in-page switcher moved back from Product History to Sales History");

// --- Inventory tile still opens Search Inventory, and its own dropdown still works ---
await page.click("#home-btn");
await page.waitForSelector(".home-grid");
await page.click('[data-home-tile="inventory-search"]');
await page.waitForSelector('[data-action="add-item"]');
console.log("STEP: Inventory tile opened Search Inventory");
await page.click('[data-nav-toggle="inventory"]');
await page.waitForSelector('.nav-dropdown-menu [data-nav="inventory-import"]');
await page.click('[data-nav="inventory-import"]');
await page.waitForSelector("#imp-code");
console.log("STEP: Inventory's own nav dropdown (Import Stock) still works once inside the section");

// --- Home button is present on every screen, not just some ---
for (const nav of ['[data-nav="pos"]', '[data-nav="customers"]', '[data-nav="settings"]']) {
  await page.click(nav);
  const homeBtnCount = await page.locator("#home-btn").count();
  if (homeBtnCount !== 1) errors.push(`Expected #home-btn to be visible on screen reached via ${nav}`);
}
console.log("STEP: Home button confirmed present across POS, Customers, and Settings");

await browser.close();
if (errors.length) { console.error("\n=== FAILURES ==="); errors.forEach((e) => console.error("- " + e)); process.exit(1); }
console.log("\nHOME SCREEN CHECKS PASSED");
