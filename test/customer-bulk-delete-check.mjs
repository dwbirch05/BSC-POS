import { chromium } from "playwright";

// Covers the Customers multi-select + bulk delete feature added 2026-09-02
// (Darryl: "the select in the inventory is great. Now i want to add the
// same one into the customer database as well") -- same pattern as
// test/inventory-bulk-delete-check.mjs, applied to the Customers screen.

const BASE = process.env.TEST_BASE || "http://localhost:8950";
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (err) => errors.push("pageerror: " + err.message));
page.on("dialog", (d) => d.accept()); // auto-confirm the delete confirmation

await page.goto(BASE + "/index.html");
await page.click('button[type="submit"]');
await page.waitForSelector(".home-grid");
await page.click('[data-home-tile="customers"]');
await page.waitForSelector('[data-action="add-cust"]');

// --- Seed 3 customers ---
for (const name of ["Bulk Cust A", "Bulk Cust B", "Bulk Cust C"]) {
  await page.click('[data-action="add-cust"]');
  await page.waitForSelector("#f-name");
  await page.fill("#f-name", name);
  await page.click('[data-action="save"]');
  await page.waitForSelector(".toast.success");
  await page.waitForTimeout(150);
}

// --- No bulk bar until something is selected ---
let bulkBarCount = await page.locator(".bulk-bar").count();
console.log("STEP: bulk bar present before any selection =", bulkBarCount > 0);
if (bulkBarCount !== 0) errors.push("Bulk bar should not show before any row is selected");

// --- Select two of the three rows individually ---
const rows = page.locator("#cust-table tbody tr");
const rowsText = await rows.allInnerTexts();
const idxA = rowsText.findIndex((t) => t.includes("Bulk Cust A"));
const idxB = rowsText.findIndex((t) => t.includes("Bulk Cust B"));
await rows.nth(idxA).locator(".row-select").check();
await rows.nth(idxB).locator(".row-select").check();

const bulkBarText = await page.locator(".bulk-bar").innerText();
console.log("STEP: bulk bar after selecting 2 rows =", bulkBarText.replace(/\n/g, " | "));
if (!bulkBarText.includes("2 selected")) errors.push("Expected bulk bar to say '2 selected': " + bulkBarText);

// --- Select-all selects everything (3), including the untouched row ---
await page.click("#select-all-checkbox");
const bulkBarText2 = await page.locator(".bulk-bar").innerText();
console.log("STEP: bulk bar after select-all =", bulkBarText2.replace(/\n/g, " | "));
if (!bulkBarText2.includes("3 selected")) errors.push("Expected select-all to select all 3 rows: " + bulkBarText2);

// --- Unchecking select-all clears everything ---
await page.click("#select-all-checkbox");
bulkBarCount = await page.locator(".bulk-bar").count();
console.log("STEP: bulk bar after unchecking select-all =", bulkBarCount);
if (bulkBarCount !== 0) errors.push("Unchecking select-all should clear the selection");

// --- Clear button works ---
await rows.nth(idxA).locator(".row-select").check();
await page.click('[data-action="clear-selection"]');
bulkBarCount = await page.locator(".bulk-bar").count();
if (bulkBarCount !== 0) errors.push("Clear button should empty the selection");
console.log("STEP: Clear button empties the selection");

// --- Search narrows the list -- select-all only selects what's shown ---
await page.fill("#cust-search", "Bulk Cust A");
await page.waitForTimeout(200);
await page.click("#select-all-checkbox");
const bulkBarSearch = await page.locator(".bulk-bar").innerText();
console.log("STEP: bulk bar after select-all while searched to 1 row =", bulkBarSearch.replace(/\n/g, " | "));
if (!bulkBarSearch.includes("1 selected")) errors.push("Expected select-all under a search filter to only select the filtered row: " + bulkBarSearch);
await page.click('[data-action="clear-selection"]');
await page.fill("#cust-search", "");
await page.waitForTimeout(200);

// --- Select A and B, delete selected, confirm only C remains ---
const rows2 = page.locator("#cust-table tbody tr");
const rowsText2 = await rows2.allInnerTexts();
const idxA2 = rowsText2.findIndex((t) => t.includes("Bulk Cust A"));
const idxB2 = rowsText2.findIndex((t) => t.includes("Bulk Cust B"));
await rows2.nth(idxA2).locator(".row-select").check();
await rows2.nth(idxB2).locator(".row-select").check();
await page.click('[data-action="delete-selected"]');
await page.waitForSelector(".toast.success");
await page.waitForTimeout(200);

const remainingText = await page.locator("#cust-table").innerText();
console.log("STEP: customers after bulk delete =", remainingText.replace(/\n/g, " | "));
if (remainingText.includes("Bulk Cust A") || remainingText.includes("Bulk Cust B")) {
  errors.push("Bulk-deleted customers are still showing: " + remainingText);
}
if (!remainingText.includes("Bulk Cust C")) {
  errors.push("Un-selected customer C should still be present: " + remainingText);
}
const remainingBulkBar = await page.locator(".bulk-bar").count();
if (remainingBulkBar !== 0) errors.push("Bulk bar should be gone after the delete completes");

await browser.close();
if (errors.length) { console.error("\n=== FAILURES ==="); errors.forEach((e) => console.error("- " + e)); process.exit(1); }
console.log("\nCUSTOMER BULK DELETE CHECKS PASSED");
