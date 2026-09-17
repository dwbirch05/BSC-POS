import { chromium } from "playwright";

// Covers Card Intake (AI card reading), added 2026-09-17 -- Darryl: "okay
// lets not do the pricing first lets get the ai reading the card and
// inserting the information first". Demo mode uses a fake AI mock
// (js/local-store.js's cardAI.identifyCard) so this whole flow is testable
// with zero real AI/network calls: upload -> confirm pairing (incl. an odd
// leftover photo, swap, remove) -> AI processing -> review (accept one,
// reject one) -> CSV export -- plus the CARD_AI_ALLOWED_EMAILS gate on the
// Home tile.

const BASE = process.env.TEST_BASE || "http://localhost:8951";
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ acceptDownloads: true });
page.on("pageerror", (err) => errors.push("pageerror: " + err.message));

// A tiny valid 1x1 PNG, reused for every fake "card photo".
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);
const photo = (name) => ({ name, mimeType: "image/png", buffer: PNG_1x1 });

await page.goto(BASE + "/index.html");
await page.click('button[type="submit"]'); // logs in as the seeded demo owner (demo@bigscreencollectables.local)
await page.waitForSelector(".home-grid");

// --- The seeded demo account is in CARD_AI_ALLOWED_EMAILS -- tile is there ---
let tileCount = await page.locator('[data-home-tile="card-intake"]').count();
console.log("STEP: Card Intake tile visible for allowed demo account =", tileCount === 1);
if (tileCount !== 1) errors.push("Expected a Card Intake tile on Home for the allowed demo account");

await page.click('[data-home-tile="card-intake"]');
await page.waitForSelector("#ci-intro");
console.log("STEP: Card Intake tile opened the Card Intake screen");

// --- Odd number of photos: one pair + a leftover, with a note -- then start over ---
await page.setInputFiles("#ci-file-input", [photo("1.png"), photo("2.png"), photo("3.png")]);
await page.waitForSelector("#ci-pairing-card:not([hidden])");
let pairCount = await page.locator('[data-action="swap-pair"]').count();
console.log("STEP: 3 photos paired into", pairCount, "pair(s), with a leftover note");
if (pairCount !== 1) errors.push("Expected 3 photos to produce exactly 1 pair (+ 1 leftover): got " + pairCount);
const leftoverNote = await page.locator("#ci-leftover-note").innerText();
if (!leftoverNote.trim()) errors.push("Expected a leftover-photo note when an odd number of photos is selected");

await page.click('[data-action="cancel-pairing"]');
await page.waitForFunction(() => document.querySelector("#ci-pairing-card").hidden === true);
console.log("STEP: Start over cleared the pairing card");

// --- Upload 2 pairs, swap one, remove one, leaving exactly 1 pair to process ---
await page.setInputFiles("#ci-file-input", [photo("a-front.png"), photo("a-back.png"), photo("b-front.png"), photo("b-back.png")]);
await page.waitForSelector("#ci-pairing-card:not([hidden])");
pairCount = await page.locator('[data-action="swap-pair"]').count();
if (pairCount !== 2) errors.push("Expected 2 pairs from 4 photos: got " + pairCount);

await page.click('[data-action="swap-pair"][data-idx="0"]');
console.log("STEP: swapped front/back on the first pair with no error");

await page.click('[data-action="remove-pair"][data-idx="1"]');
await page.waitForFunction(() => document.querySelectorAll('[data-action="swap-pair"]').length === 1);
console.log("STEP: removed the second pair, 1 pair remains");

await page.click('[data-action="start-processing"]');
await page.waitForSelector("#ci-review-card:not([hidden])", { timeout: 15000 });
let entries = page.locator("#ci-review-list > [data-id]");
let entryCount = await entries.count();
console.log("STEP: review queue entry count after processing 1 pair =", entryCount);
if (entryCount !== 1) errors.push("Expected exactly 1 card in the review queue after processing 1 pair: got " + entryCount);
const summaryText = await page.locator("#ci-review-summary").innerText();
console.log("STEP: AI processed the pair -- review summary =", summaryText);

const nameValue = await entries.first().locator('[data-field="name"]').inputValue();
console.log("STEP: AI drafted a name/title =", JSON.stringify(nameValue));
if (!nameValue.trim()) errors.push("Expected the AI mock to fill in a draft name/title");

await entries.first().locator('[data-action="accept-card"]').click();
await page.waitForFunction(() => document.querySelector("#ci-review-card").hidden === true);
await page.waitForSelector("#ci-export-card:not([hidden])");
let exportSummary = await page.locator("#ci-export-summary").innerText();
console.log("STEP: accepted the card -- export summary =", exportSummary);
if (!exportSummary.includes("1 card")) errors.push("Expected the export summary to say 1 card ready: " + exportSummary);

// --- A second batch: process 1 pair, then reject it -- shouldn't add to the export ---
await page.setInputFiles("#ci-file-input", [photo("c-front.png"), photo("c-back.png")]);
await page.waitForSelector("#ci-pairing-card:not([hidden])");
await page.click('[data-action="start-processing"]');
await page.waitForSelector("#ci-review-card:not([hidden])", { timeout: 15000 });
entries = page.locator("#ci-review-list > [data-id]");
await entries.first().locator('[data-action="reject-card"]').click();
await page.waitForFunction(() => document.querySelector("#ci-review-card").hidden === true);
exportSummary = await page.locator("#ci-export-summary").innerText();
console.log("STEP: rejected the second card -- export summary still =", exportSummary);
if (!exportSummary.includes("1 card")) errors.push("Rejecting a card shouldn't change the accepted count: " + exportSummary);

// --- Export the CSV and check its shape (header + exactly 1 accepted row, with a real barcode) ---
const [download] = await Promise.all([
  page.waitForEvent("download"),
  page.click('[data-action="export-csv"]'),
]);
const stream = await download.createReadStream();
const chunks = [];
for await (const chunk of stream) chunks.push(chunk);
const csvText = Buffer.concat(chunks).toString("utf8");
const csvLines = csvText.trim().split("\n");
console.log("STEP: downloaded CSV has", csvLines.length, "line(s) (header + rows)");
if (csvLines.length !== 2) errors.push("Expected the CSV to have a header + exactly 1 row: got " + csvLines.length + " lines");
if (!csvLines[0].startsWith("name,barcode,category,condition,description,cost,price,quantity,tags,images")) {
  errors.push("CSV header doesn't match the Import Products (CSV) contract: " + csvLines[0]);
}
if (!/BSC-\d{6}/.test(csvLines[1] || "")) errors.push("Expected the accepted row to carry a generated BSC-###### barcode: " + csvLines[1]);
console.log("STEP: CSV header matches Import Products (CSV), row carries a generated barcode");

// --- A non-allowed account never sees the tile ---
await page.click("#logout-btn");
await page.waitForSelector('button[type="submit"]');
await page.fill('input[name="email"]', "not-on-the-list@example.com");
await page.click('button[type="submit"]');
await page.waitForSelector(".home-grid");
tileCount = await page.locator('[data-home-tile="card-intake"]').count();
console.log("STEP: Card Intake tile visible for a non-allowed account =", tileCount === 1);
if (tileCount !== 0) errors.push("Card Intake tile should NOT show for an account not in CARD_AI_ALLOWED_EMAILS");

await browser.close();
if (errors.length) { console.error("\n=== FAILURES ==="); errors.forEach((e) => console.error("- " + e)); process.exit(1); }
console.log("\nCARD INTAKE CHECKS PASSED");
