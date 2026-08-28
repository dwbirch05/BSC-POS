import { chromium } from "playwright";
const BASE = process.env.TEST_BASE || "http://localhost:8933";
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (err) => errors.push("pageerror: " + err.message));

await page.goto(BASE + "/index.html");
await page.click('button[type="submit"]');
await page.waitForSelector("nav.tabs");

// Add a second staff member (the demo owner already exists from login).
await page.click('[data-nav="settings"]');
await page.click('[data-action="add-staff"]');
await page.waitForSelector("#f-name");
await page.fill("#f-name", "Alex Staffer");
await page.fill("#f-email", "alex@example.com");
await page.click('[data-action="save"]');
await page.waitForSelector(".toast.success");
await page.waitForTimeout(200);

// Create an event, check BOTH users.
await page.click('[data-nav="events"]');
await page.click('[data-action="add-event"]');
await page.waitForSelector("#f-name");
await page.fill("#f-name", "Multi-Staff Show");
const today = new Date().toISOString().slice(0, 10);
await page.fill("#f-start", today);
await page.fill("#f-end", today);
const checkboxCount = await page.locator(".f-user-checkbox").count();
console.log("STEP: checkbox count =", checkboxCount);
if (checkboxCount !== 2) errors.push("Expected 2 assignable users, got " + checkboxCount);
await page.locator(".f-user-checkbox").nth(0).check();
await page.locator(".f-user-checkbox").nth(1).check();
await page.click('[data-action="save"]');
await page.waitForSelector(".toast.success");
await page.waitForTimeout(300);

const runByCell = await page.locator("#event-table tbody tr").first().locator("td").nth(2).innerText();
console.log("STEP: run-by cell =", runByCell);
if (!runByCell.includes(",")) errors.push("Expected multiple names in Run by cell, got: " + runByCell);

// The signed-in demo user is one of the two assigned -> POS should resolve to this event.
await page.click('[data-nav="pos"]');
await page.waitForTimeout(300);
const pillText = await page.locator("#current-event-pill").innerText();
console.log("STEP: pill =", pillText);
if (pillText !== "Multi-Staff Show") errors.push("Expected pill 'Multi-Staff Show', got: " + pillText);

// Re-open the event to confirm both checkboxes come back checked.
await page.click('[data-nav="events"]');
await page.click('[data-action="edit-event"]');
await page.waitForSelector(".f-user-checkbox");
const checkedStates = await page.locator(".f-user-checkbox").evaluateAll((els) => els.map((e) => e.checked));
console.log("STEP: checked states on reopen =", checkedStates);
if (!checkedStates.every(Boolean)) errors.push("Expected both checkboxes checked on reopen, got: " + checkedStates);

await browser.close();
if (errors.length) { console.error(errors); process.exit(1); }
console.log("MULTI-ASSIGN CHECKS PASSED");
