import { chromium } from "playwright";
const BASE = process.env.TEST_BASE || "http://localhost:8935";
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (err) => errors.push("pageerror: " + err.message));

// A tiny valid 1x1 PNG, used twice with different filenames to simulate two photos.
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

await page.goto(BASE + "/index.html");
await page.click('button[type="submit"]');
await page.waitForSelector("nav.tabs");

// --- Add an item with tags + two photos, then remove one photo before saving ---
await page.click('[data-nav-toggle="inventory"]');
await page.click('[data-nav="inventory-search"]');
await page.waitForSelector('[data-action="add-item"]');
await page.click('[data-action="add-item"]');
await page.waitForSelector("#f-name");
await page.fill("#f-name", "Signed Photo With Tags");
await page.fill("#f-category", "Signed memorabilia");
await page.fill("#f-tags", "signed, star wars,  limited edition ");
await page.fill("#f-cost", "20");
await page.fill("#f-price", "60");
await page.fill("#f-qty", "4");
await page.click('[data-action="generate-barcode"]');
const uiBarcode = await page.inputValue("#f-barcode");
console.log("STEP: item created with barcode =", uiBarcode);

await page.setInputFiles("#f-images-input", [
  { name: "photo1.png", mimeType: "image/png", buffer: PNG_1x1 },
  { name: "photo2.png", mimeType: "image/png", buffer: PNG_1x1 },
]);
await page.waitForFunction(() => document.querySelectorAll(".image-thumb").length === 2, { timeout: 8000 });
console.log("STEP: two photo thumbnails present after upload");

await page.click(".image-thumb .image-remove");
await page.waitForFunction(() => document.querySelectorAll(".image-thumb").length === 1);
console.log("STEP: one photo remains after removing the other");

await page.click('[data-action="save"]');
await page.waitForSelector(".toast.success");
await page.waitForTimeout(300);

// --- Detail view shows the tag pills and the remaining photo ---
await page.click('[data-action="view-item"]');
await page.waitForSelector(".modal");
const tagPills = await page.locator(".modal .pill").allInnerTexts();
console.log("STEP: tag pills in detail view =", tagPills);
if (!["signed", "star wars", "limited edition"].every((t) => tagPills.includes(t))) {
  errors.push("Detail view missing expected tag pills: " + JSON.stringify(tagPills));
}
const detailThumbCount = await page.locator(".modal .image-thumb").count();
console.log("STEP: photo thumbnails in detail view =", detailThumbCount);
if (detailThumbCount !== 1) errors.push("Expected 1 photo in detail view, got " + detailThumbCount);
await page.click('[data-action="close"]');

// --- CSV bulk import: one new row, one row that updates the item above, ---
// --- one duplicate-barcode row (skipped), one missing-name row (skipped) ---
const csv = [
  "name,barcode,category,condition,description,cost,price,quantity,tags,images",
  `"New CSV Product",CSV-A,Collectable,Mint,"Brought in via CSV",15,45,10,"csv;bulk",`,
  `"Signed Photo With Tags",${uiBarcode},Signed memorabilia,Mint,"Updated via CSV import",25,999,42,"signed;updated",`,
  `"Duplicate Barcode Row",CSV-A,Collectable,,,,10,1,,`,
  `"",MISSING-NAME,Collectable,,,,10,1,,`,
].join("\n");

await page.click('[data-nav-toggle="inventory"]');
await page.click('[data-nav="inventory-import-products"]');
await page.waitForSelector("#csv-file-input");
await page.setInputFiles("#csv-file-input", { name: "products.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
await page.waitForSelector("#csv-preview-card:not([hidden])");

const summary = await page.locator("#csv-summary").innerText();
console.log("STEP: csv preview summary =", summary);
if (!summary.includes("4 rows") || !summary.includes("1 new") || !summary.includes("1 update") || !summary.includes("2 skipped")) {
  errors.push("CSV preview summary didn't match expected 4 rows / 1 new / 1 update / 2 skipped: " + summary);
}

const skippedRows = await page.locator("#csv-preview-table .text-bad").count();
console.log("STEP: skipped rows shown =", skippedRows);
if (skippedRows !== 2) errors.push("Expected 2 skipped rows shown in preview, got " + skippedRows);

await page.click("#csv-import-btn");
await page.waitForSelector(".toast.success", { timeout: 8000 });
const importToast = await page.locator(".toast.success").last().innerText();
console.log("STEP: import toast =", importToast);
if (!importToast.includes("1 added") || !importToast.includes("1 updated")) {
  errors.push("Import toast didn't confirm 1 added / 1 updated: " + importToast);
}
await page.waitForTimeout(300);

// --- Verify results landed in inventory: 2 total items, and the update actually applied ---
await page.click('[data-nav-toggle="inventory"]');
await page.click('[data-nav="inventory-search"]');
await page.waitForTimeout(300);
const rowCount = await page.locator("#inv-table tbody tr").count();
console.log("STEP: inventory rows after import =", rowCount);
if (rowCount !== 2) errors.push("Expected 2 inventory rows after import, got " + rowCount);

const rowsText = await page.locator("#inv-table tbody tr").allInnerTexts();
const updatedRow = rowsText.find((t) => t.includes("Signed Photo With Tags"));
console.log("STEP: updated row text =", updatedRow?.replace(/\n/g, " | "));
if (!updatedRow || !updatedRow.includes("999.00") || !/\b42\b/.test(updatedRow)) {
  errors.push("CSV update didn't apply new price/qty to the existing item: " + updatedRow);
}
const newRow = rowsText.find((t) => t.includes("New CSV Product"));
if (!newRow) errors.push("CSV-created new product not found in inventory list");

await browser.close();
if (errors.length) { console.error(errors); process.exit(1); }
console.log("PRODUCTS/CSV CHECKS PASSED");
