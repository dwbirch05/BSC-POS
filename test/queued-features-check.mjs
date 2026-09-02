import { chromium } from "playwright";

// Covers the three "queued changes" built this session:
// 1. Inventory table thumbnail (item.images[0] shown / blank placeholder)
// 2. Barcode case + dash insensitivity, and uniqueness enforcement
// 3. Sales History: staff filter + grouped totals report (by event / by staff)

const BASE = process.env.TEST_BASE || "http://localhost:8941";
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (err) => errors.push("pageerror: " + err.message));

const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

async function goTo(routeId, parentId) {
  if (parentId) {
    await page.click(`[data-nav-toggle="${parentId}"]`);
    await page.waitForSelector(`.nav-dropdown-menu [data-nav="${routeId}"]`);
  }
  await page.click(`[data-nav="${routeId}"]`);
}

await page.goto(BASE + "/index.html");
await page.click('button[type="submit"]');
await page.waitForSelector("nav.tabs");

// --- Add item A (with a photo) and item B (no photo) ---
await goTo("inventory-search", "inventory");
await page.waitForSelector('[data-action="add-item"]');

await page.click('[data-action="add-item"]');
await page.waitForSelector("#f-name");
await page.fill("#f-name", "Item With Photo");
await page.fill("#f-price", "10");
await page.fill("#f-qty", "5");
await page.fill("#f-barcode", "BSC-000001");
await page.setInputFiles("#f-images-input", { name: "photo.png", mimeType: "image/png", buffer: PNG_1x1 });
await page.waitForFunction(() => document.querySelectorAll(".image-thumb").length === 1, { timeout: 8000 });
await page.click('[data-action="save"]');
await page.waitForSelector(".toast.success");
await page.waitForTimeout(200);

await page.click('[data-action="add-item"]');
await page.waitForSelector("#f-name");
await page.fill("#f-name", "Item Without Photo");
await page.fill("#f-price", "15");
await page.fill("#f-qty", "5");
await page.fill("#f-barcode", "BSC-000002");
await page.click('[data-action="save"]');
await page.waitForSelector(".toast.success");
await page.waitForTimeout(200);

// --- Thumbnail column: item A has a real thumb, item B has an empty placeholder ---
const rowsText = await page.locator("#inv-table tbody tr").allInnerTexts();
const rowWithPhotoIdx = rowsText.findIndex((t) => t.includes("Item With Photo"));
const rowWithoutPhotoIdx = rowsText.findIndex((t) => t.includes("Item Without Photo"));
const thumbImgCount = await page.locator("#inv-table tbody tr").nth(rowWithPhotoIdx).locator(".row-thumb img").count();
const emptyThumbCount = await page.locator("#inv-table tbody tr").nth(rowWithoutPhotoIdx).locator(".row-thumb-empty").count();
console.log("STEP: row-with-photo has thumb img =", thumbImgCount === 1, "| row-without-photo has empty placeholder =", emptyThumbCount === 1);
if (thumbImgCount !== 1) errors.push("Expected inventory row for photographed item to show a thumbnail image");
if (emptyThumbCount !== 1) errors.push("Expected inventory row for photo-less item to show an empty thumbnail placeholder");

// --- Barcode uniqueness: case + dash-insensitive clash is blocked ---
await page.click('[data-action="add-item"]');
await page.waitForSelector("#f-name");
await page.fill("#f-name", "Duplicate Barcode Attempt");
await page.fill("#f-price", "20");
await page.fill("#f-qty", "1");
await page.fill("#f-barcode", "bsc000001"); // same as item A, different case, no dash
await page.click('[data-action="save"]');
await page.waitForSelector(".toast.error");
const clashToast = await page.locator(".toast.error").last().innerText();
console.log("STEP: duplicate-barcode toast =", clashToast);
if (!clashToast.includes("Item With Photo")) errors.push("Clash toast didn't name the conflicting item: " + clashToast);

// Modal should still be open (save was blocked) -- fix the barcode and save for real
await page.fill("#f-barcode", "BSC-000003");
await page.click('[data-action="save"]');
await page.waitForSelector(".toast.success");
await page.waitForTimeout(200);
console.log("STEP: item with a fixed unique barcode saved fine after the clash was blocked");

// --- POS: typing the barcode without the dash / in a different case still finds the item ---
await goTo("pos");
await page.waitForSelector("#barcode-input");
await page.fill("#barcode-input", "bsc000001"); // item A's barcode, lowercase, no dash
await page.press("#barcode-input", "Enter");
await page.waitForSelector(".cart-item");
const cartLine = await page.locator(".cart-item .name").first().innerText();
console.log("STEP: POS cart line after dash/case-insensitive scan =", cartLine);
if (!cartLine.includes("Item With Photo")) errors.push("POS didn't find item A via dash/case-insensitive barcode: " + cartLine);

// --- Import Stock: same normalization applies there ---
await goTo("inventory-import", "inventory");
await page.waitForSelector("#imp-code");
await page.fill("#imp-code", "BSC 000002"); // item B's barcode, with a space instead of a dash
await page.press("#imp-code", "Enter");
await page.waitForSelector(".import-found");
const foundText = await page.locator(".import-found").innerText();
console.log("STEP: Import Stock found via normalized barcode =", foundText.replace(/\n/g, " | "));
if (!foundText.includes("Item Without Photo")) errors.push("Import Stock didn't find item B via normalized barcode: " + foundText);

// --- Seed a couple more sales directly (different events/staff) to test Sales History reporting ---
// Uses real user records (so the #filter-staff dropdown, which is populated
// from store.users.list(), actually has matching options to select).
await page.evaluate(async () => {
  const { store } = await import("/js/store.js");
  const item = store.items.list().find((it) => it.name === "Item Without Photo");
  const owner = store.users.list().find((u) => u.name === "Owner (demo)");
  let alex = store.users.list().find((u) => u.name === "Alex Staffer");
  if (!alex) alex = await store.users.add({ name: "Alex Staffer", email: "alex@bigscreencollectables.local", role: "staff" });
  const common = { lineItems: [{ itemId: item.id, name: item.name, priceAtSale: item.price, qty: 1 }], paymentMethod: "Cash", customerName: "Walk-in" };
  await store.sales.add({ ...common, eventId: "evt-a", eventName: "Home Store", staffUserId: alex.id, staffName: alex.name, total: 1500 });
  await store.sales.add({ ...common, eventId: "evt-b", eventName: "Comic Con", staffUserId: alex.id, staffName: alex.name, total: 1500 });
  await store.sales.add({ ...common, eventId: "evt-b", eventName: "Comic Con", staffUserId: owner.id, staffName: owner.name, total: 3000 });
});

// --- Sales History: staff filter narrows the individual-sales list ---
// (reached via Home now, not the old nav dropdown)
await page.click("#home-btn");
await page.waitForSelector('[data-home-tile="reporting-sales"]');
await page.click('[data-home-tile="reporting-sales"]');
await page.waitForTimeout(300);
const staffOptions = await page.locator("#filter-staff option").allInnerTexts();
console.log("STEP: staff filter options =", staffOptions);
await page.selectOption("#filter-staff", { label: "Alex Staffer" });
await page.waitForTimeout(150);
const filteredSummary = await page.locator("#sales-summary").innerText();
console.log("STEP: sales summary filtered to Alex Staffer =", filteredSummary);
if (!filteredSummary.startsWith("2 sale")) errors.push("Expected 2 sales for Alex Staffer, got: " + filteredSummary);
await page.selectOption("#filter-staff", { label: "All staff" });
await page.waitForTimeout(150);

// --- Grouped totals report: by event ---
await page.selectOption("#filter-groupby", { value: "event" });
await page.waitForTimeout(150);
const eventGroupRows = await page.locator("#sales-table tbody tr").allInnerTexts();
console.log("STEP: grouped-by-event rows =", eventGroupRows.map((r) => r.replace(/\n/g, " | ")));
const comicConRow = eventGroupRows.find((r) => r.includes("Comic Con"));
if (!comicConRow || !comicConRow.includes("$45.00")) {
  errors.push("Comic Con event group should total $45.00 (2 sales) — got: " + comicConRow);
}

// --- Grouped totals report: by staff ---
await page.selectOption("#filter-groupby", { value: "staff" });
await page.waitForTimeout(150);
const staffGroupRows = await page.locator("#sales-table tbody tr").allInnerTexts();
console.log("STEP: grouped-by-staff rows =", staffGroupRows.map((r) => r.replace(/\n/g, " | ")));
const alexRow = staffGroupRows.find((r) => r.includes("Alex Staffer"));
if (!alexRow || !alexRow.includes("$30.00")) {
  errors.push("Alex Staffer group should total $30.00 (2 sales) — got: " + alexRow);
}
const ownerRow = staffGroupRows.find((r) => r.includes("Owner (demo)"));
if (!ownerRow || !ownerRow.includes("$30.00")) {
  errors.push("Owner (demo) group should total $30.00 (1 sale) — got: " + ownerRow);
}

await browser.close();
if (errors.length) { console.error("\n=== FAILURES ==="); errors.forEach((e) => console.error("- " + e)); process.exit(1); }
console.log("\nQUEUED FEATURES CHECKS PASSED");
