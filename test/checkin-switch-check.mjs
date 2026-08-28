import { chromium } from "playwright";
const BASE = process.env.TEST_BASE || "http://localhost:8934";
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (err) => errors.push("pageerror: " + err.message));

await page.goto(BASE + "/index.html");
await page.click('button[type="submit"]');
await page.waitForSelector("nav.tabs");

// Add a second staff member.
await page.click('[data-nav="settings"]');
await page.click('[data-action="add-staff"]');
await page.waitForSelector("#f-name");
await page.fill("#f-name", "Alex Staffer");
await page.fill("#f-email", "alex@example.com");
await page.click('[data-action="save"]');
await page.waitForSelector(".toast.success");
await page.waitForTimeout(200);

// Add a sellable item.
await page.click('[data-nav-toggle="inventory"]');
await page.click('[data-nav="inventory-search"]');
await page.waitForSelector('[data-action="add-item"]');
await page.click('[data-action="add-item"]');
await page.fill("#f-name", "Test Prop Replica");
await page.fill("#f-price", "80");
await page.fill("#f-qty", "2");
await page.click('[data-action="generate-barcode"]');
const barcode = await page.inputValue("#f-barcode");
await page.click('[data-action="save"]');
await page.waitForSelector(".toast.success");
await page.waitForTimeout(200);

// On POS, Alex shouldn't be selectable yet (not checked in today).
await page.click('[data-nav="pos"]');
await page.waitForSelector("#serving-select");
let options = await page.locator("#serving-select option").allTextContents();
console.log("STEP: serving options before check-in =", options);
if (options.some((t) => t.includes("Alex Staffer"))) {
  errors.push("Alex shouldn't appear in the serving switcher before being checked in");
}

// Check Alex in via "+ Check in someone else…" (demo mode: no password required).
await page.selectOption("#serving-select", "__other__");
await page.waitForSelector("#ci-user");
const candidateNames = await page.locator("#ci-user option").allTextContents();
console.log("STEP: check-in candidates =", candidateNames);
if (!candidateNames.some((t) => t.includes("Alex Staffer"))) {
  errors.push("Alex Staffer should be a check-in candidate");
}
const hasPasswordField = await page.locator("#ci-password").count();
if (hasPasswordField !== 0) errors.push("Demo mode shouldn't ask for a password to check in");
await page.click('[data-action="confirm"]');
await page.waitForSelector(".toast.success");
await page.waitForTimeout(200);

// Alex should now be selected as the acting server.
options = await page.locator("#serving-select option").allTextContents();
console.log("STEP: serving options after check-in =", options);
if (!options.some((t) => t.includes("Alex Staffer"))) {
  errors.push("Alex Staffer should now appear in the serving switcher");
}
const selectedLabel = await page.locator("#serving-select option:checked").innerText();
console.log("STEP: selected server after check-in =", selectedLabel);
if (!selectedLabel.includes("Alex Staffer")) errors.push("Alex Staffer should be auto-selected after checking in");

// Complete a sale while Alex is serving; receipt should credit her.
await page.fill("#barcode-input", barcode);
await page.press("#barcode-input", "Enter");
await page.waitForSelector(".cart-item");
await page.click('[data-action="set-payment"][data-method="Cash"]');
await page.click("#complete-sale-btn");
await page.waitForSelector(".receipt");
const receiptText = await page.locator(".receipt").innerText();
console.log("STEP: receipt =", receiptText.replace(/\n/g, " | "));
if (!receiptText.includes("Alex Staffer")) errors.push("Receipt should show Alex Staffer as served by");
await page.click('[data-action="close"]');

// Switching back to the owner should still work without re-verifying.
await page.selectOption("#serving-select", { label: "Owner (demo)" });
const backTo = await page.locator("#serving-select option:checked").innerText();
console.log("STEP: switched back to =", backTo);
if (!backTo.includes("Owner (demo)")) errors.push("Should be able to switch back to the owner without re-checking in");

await browser.close();
if (errors.length) { console.error(errors); process.exit(1); }
console.log("CHECK-IN SWITCH CHECKS PASSED");
