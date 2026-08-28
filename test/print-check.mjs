import { chromium } from "playwright";
const BASE = "http://localhost:8931";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(BASE + "/index.html");
await page.click('button[type="submit"]');
await page.waitForSelector("nav.tabs");

// Complete a quick sale to get a receipt modal open
await page.click('[data-tab="inventory"]');
await page.click('[data-action="add-item"]');
await page.fill("#f-name", "Film Cell - Empire Strikes Back");
await page.fill("#f-price", "45");
await page.fill("#f-qty", "5");
await page.click('[data-action="generate-barcode"]');
const barcode = await page.inputValue("#f-barcode");
await page.click('[data-action="save"]');
await page.waitForTimeout(300);

await page.click('[data-tab="pos"]');
await page.fill("#barcode-input", barcode);
await page.press("#barcode-input", "Enter");
await page.click('[data-action="set-payment"][data-method="Card"]');
await page.click("#complete-sale-btn");
await page.waitForSelector(".receipt");

await page.emulateMedia({ media: "print" });
await page.screenshot({ path: "test/screenshot-print-receipt.png", fullPage: true });
console.log("print screenshot saved");
await browser.close();
