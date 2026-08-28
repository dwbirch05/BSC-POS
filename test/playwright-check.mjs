import { chromium } from "playwright";

const BASE = "http://localhost:8931";
const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (err) => errors.push("pageerror: " + err.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push("console.error: " + msg.text()); });

await page.goto(BASE + "/index.html");
await page.waitForSelector("#login-form", { timeout: 5000 });
console.log("STEP: login form rendered");

await page.click('button[type="submit"]');
await page.waitForSelector("nav.tabs", { timeout: 5000 });
console.log("STEP: logged in, shell rendered");

// --- Inventory: add an item ---
await page.click('[data-tab="inventory"]');
await page.waitForSelector('[data-action="add-item"]');
await page.click('[data-action="add-item"]');
await page.waitForSelector("#f-name");
await page.fill("#f-name", "Signed Star Wars Photo");
await page.fill("#f-category", "Signed memorabilia");
await page.fill("#f-cost", "50");
await page.fill("#f-price", "120");
await page.fill("#f-qty", "3");
await page.click('[data-action="generate-barcode"]');
const barcodeVal = await page.inputValue("#f-barcode");
console.log("STEP: generated barcode =", barcodeVal);
if (!barcodeVal.startsWith("BSC-")) errors.push("Generated barcode has unexpected format: " + barcodeVal);
const svgCount = await page.locator("#barcode-preview svg rect").count();
console.log("STEP: barcode preview rects =", svgCount);
if (svgCount < 10) errors.push("Barcode preview looks empty (rects=" + svgCount + ")");
await page.click('[data-action="save"]');
await page.waitForSelector(".toast.success", { timeout: 3000 });
console.log("STEP: item saved");
await page.waitForTimeout(300);

const rowCount = await page.locator("#inv-table tbody tr").count();
console.log("STEP: inventory rows =", rowCount);
if (rowCount !== 1) errors.push("Expected 1 inventory row, got " + rowCount);

// --- POS: scan the barcode, add customer, complete sale ---
await page.click('[data-tab="pos"]');
await page.waitForSelector("#barcode-input");
await page.fill("#barcode-input", barcodeVal);
await page.press("#barcode-input", "Enter");
await page.waitForSelector(".cart-item");
const cartText = await page.locator(".cart-item .name").first().innerText();
console.log("STEP: cart line =", cartText);
if (!cartText.includes("Signed Star Wars Photo")) errors.push("Cart line missing expected item name");

const subtotal = await page.locator("#subtotal").innerText();
console.log("STEP: subtotal =", subtotal);
if (!subtotal.includes("120")) errors.push("Subtotal doesn't reflect $120 price: " + subtotal);

// add a customer
await page.click('[data-action="pick-customer"]');
await page.waitForSelector("#new-cust-name");
await page.fill("#new-cust-name", "Jane Collector");
await page.fill("#new-cust-email", "jane@example.com");
await page.click('[data-action="add-new"]');
await page.waitForTimeout(200);
const custBlockText = await page.locator("#customer-block").innerText();
console.log("STEP: customer block =", custBlockText.replace(/\n/g, " | "));
if (!custBlockText.includes("Jane Collector")) errors.push("Customer not attached to sale");

// payment + complete
await page.click('[data-action="set-payment"][data-method="Cash"]');
await page.click("#complete-sale-btn");
await page.waitForSelector(".receipt", { timeout: 4000 });
const receiptText = await page.locator(".receipt").innerText();
console.log("STEP: receipt rendered, contains total 120?", receiptText.includes("120"));
if (!receiptText.includes("120")) errors.push("Receipt total looks wrong:\n" + receiptText);
await page.click('[data-action="close"]');

// stock should have decremented from 3 to 2
await page.click('[data-tab="inventory"]');
await page.waitForTimeout(300);
const stockText = await page.locator("#inv-table tbody tr td").nth(4).innerText();
console.log("STEP: stock after sale =", stockText);
if (stockText.trim() !== "2") errors.push("Expected stock 2 after sale, got " + stockText);

// --- Sales history shows the sale ---
await page.click('[data-tab="sales"]');
await page.waitForTimeout(300);
const salesSummary = await page.locator("#sales-summary").innerText();
console.log("STEP: sales summary =", salesSummary);
if (!salesSummary.startsWith("1 sale")) errors.push("Sales history doesn't show 1 sale: " + salesSummary);

// --- Events: Home Store shows revenue ---
await page.click('[data-tab="events"]');
await page.waitForTimeout(300);
const eventRow = await page.locator("#event-table tbody tr").first().innerText();
console.log("STEP: event row =", eventRow.replace(/\n/g, " | "));

// --- offline banner ---
await page.click('[data-tab="pos"]');
await page.context().setOffline(true);
await page.evaluate(() => window.dispatchEvent(new Event("offline")));
await page.waitForTimeout(200);
const pillText = await page.locator("#online-pill").innerText();
console.log("STEP: offline pill =", pillText);
if (!pillText.toLowerCase().includes("offline")) errors.push("Offline pill didn't update");
await page.context().setOffline(false);

// --- barcode-not-found flow ---
await page.evaluate(() => window.dispatchEvent(new Event("online")));
await page.fill("#barcode-input", "DOES-NOT-EXIST");
await page.press("#barcode-input", "Enter");
await page.waitForSelector(".modal");
const modalText = await page.locator(".modal").innerText();
console.log("STEP: not-found modal =", modalText.replace(/\n/g, " | "));
if (!modalText.includes("not found")) errors.push("Barcode-not-found modal text unexpected");
await page.click('[data-action="add-to-inventory"]');
await page.waitForSelector("#f-barcode");
const prefill = await page.inputValue("#f-barcode");
console.log("STEP: prefilled barcode in add-item form =", prefill);
if (prefill !== "DOES-NOT-EXIST") errors.push("Prefill barcode mismatch: " + prefill);

await page.screenshot({ path: "test/screenshot-inventory-add.png" });

await browser.close();

if (errors.length) {
  console.error("\n=== FAILURES ===");
  errors.forEach((e) => console.error("- " + e));
  process.exit(1);
} else {
  console.log("\nALL CHECKS PASSED");
}
