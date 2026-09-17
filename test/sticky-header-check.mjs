import { chromium } from "playwright";

// Regression check for Darryl's report (2026-09-02): "when you go into the
// pos it doesn't allow you to go back if you want to go back to the home
// screen". Root cause: the header (with the Home button) scrolled away with
// the rest of the page on a tall/small screen, so the only way back was
// scrolling all the way back up first. Fix: header+nav are now sticky to
// the top of the viewport. This test forces a small viewport + a scrolled
// page and confirms the Home button is still visible and clickable.

const BASE = process.env.TEST_BASE || "http://localhost:8950";
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 600 } }); // small/phone-ish
page.on("pageerror", (err) => errors.push("pageerror: " + err.message));

await page.goto(BASE + "/index.html");
await page.click('button[type="submit"]');
await page.waitForSelector(".home-grid");

await page.click('[data-home-tile="pos"]');
await page.waitForSelector("#barcode-input");

// Scroll the POS screen all the way down (past the cart/payment cards).
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(100);

const homeBtn = page.locator("#home-btn");
const visible = await homeBtn.isVisible();
console.log("STEP: #home-btn visible after scrolling to the bottom of POS =", visible);
if (!visible) errors.push("Home button not visible after scrolling down on POS");

const box = await homeBtn.boundingBox();
console.log("STEP: #home-btn bounding box =", box);
if (!box || box.y < 0 || box.y > 600) {
  errors.push("Home button is outside the visible viewport after scrolling: " + JSON.stringify(box));
}

// It should also still be clickable and actually navigate home.
await homeBtn.click();
await page.waitForSelector(".home-grid", { timeout: 3000 });
console.log("STEP: clicking Home from a scrolled POS screen returned to the Home grid");

await browser.close();
if (errors.length) { console.error("\n=== FAILURES ==="); errors.forEach((e) => console.error("- " + e)); process.exit(1); }
console.log("\nSTICKY HEADER CHECKS PASSED");
