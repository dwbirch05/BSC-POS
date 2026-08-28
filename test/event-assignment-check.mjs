import { chromium } from "playwright";
const BASE = process.env.TEST_BASE || "http://localhost:8932";
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (err) => errors.push("pageerror: " + err.message));

await page.goto(BASE + "/index.html");
await page.click('button[type="submit"]');
await page.waitForSelector("nav.tabs");

// POS should show the default (unassigned) event with nothing else set up.
await page.click('[data-nav="pos"]');
await page.waitForSelector("#current-event-pill");
let pillText = await page.locator("#current-event-pill").innerText();
console.log("STEP: default pill =", pillText);
if (pillText !== "Home Store") errors.push("Expected default event pill 'Home Store', got: " + pillText);

// Create a dated event assigned to the signed-in demo user, covering today.
await page.click('[data-nav="events"]');
await page.click('[data-action="add-event"]');
await page.waitForSelector("#f-name");
await page.fill("#f-name", "Brisbane Comic Con");
const today = new Date().toISOString().slice(0, 10);
await page.fill("#f-start", today);
await page.fill("#f-end", today);
const checkboxCount = await page.locator(".f-user-checkbox").count();
console.log("STEP: assignable users =", checkboxCount);
if (checkboxCount < 1) errors.push("Expected at least 1 assignable user, got " + checkboxCount);
// assign the signed-in demo user (first/only checkbox at this point)
await page.locator(".f-user-checkbox").first().check();
await page.click('[data-action="save"]');
await page.waitForSelector(".toast.success");
await page.waitForTimeout(300);

const runByCell = await page.locator("#event-table tbody tr").first().locator("td").nth(2).innerText();
console.log("STEP: run-by cell on new event row =", runByCell);

// POS should now auto-resolve to the new event.
await page.click('[data-nav="pos"]');
await page.waitForTimeout(300);
pillText = await page.locator("#current-event-pill").innerText();
console.log("STEP: pill after assigning today's event =", pillText);
if (pillText !== "Brisbane Comic Con") errors.push("Expected pill to switch to 'Brisbane Comic Con', got: " + pillText);

await browser.close();
if (errors.length) { console.error(errors); process.exit(1); }
console.log("EVENT ASSIGNMENT CHECKS PASSED");
