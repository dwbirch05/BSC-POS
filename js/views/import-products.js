// ---------------------------------------------------------------------------
// Bulk product loader: upload a CSV of products, preview exactly what will
// happen (new vs. updated vs. skipped), then commit. Meant for the initial
// stock load (hundreds of products) rather than one-off adds, which are
// still easiest through "+ Add item" on Search Inventory.
//
// A row whose barcode matches an item you already have UPDATES that item
// instead of creating a duplicate -- also makes this safe to re-run (e.g.
// re-importing an updated spreadsheet later just refreshes existing rows).
// ---------------------------------------------------------------------------
import { store } from "../store.js";
import { formatMoney, parseMoneyToCents, escapeHtml, normalizeBarcode } from "../utils.js";
import { parseCsv, toCsv } from "../csv.js";
import { qs, toast } from "../ui.js";

const CSV_HEADERS = ["name", "barcode", "category", "condition", "description", "cost", "price", "quantity", "tags", "images"];

let parsedRows = [];

export function renderImportProducts(container) {
  parsedRows = [];
  container.innerHTML = template();
  wireUp(container);
}

function template() {
  return `
    <div class="card">
      <h2 style="margin-top:0">Import products (CSV)</h2>
      <p class="text-dim">For loading a lot of products at once — handy for setting the app up the first time. Every row needs at least a product name; everything else is optional. If a row's barcode matches a product you already have, that product gets updated instead of duplicated, so it's safe to re-run later with an updated spreadsheet.</p>
      <button data-action="download-template">Download CSV template</button>
      <div class="field" style="margin-top:14px">
        <label>CSV file</label>
        <input id="csv-file-input" type="file" accept=".csv,text/csv" />
      </div>
      <p class="text-dim" style="font-size:12px">
        Columns: <span class="mono">${CSV_HEADERS.join(", ")}</span>. <span class="mono">tags</span> and <span class="mono">images</span> can hold multiple values separated by <span class="mono">;</span>. <span class="mono">cost</span>/<span class="mono">price</span> are plain dollar amounts, e.g. <span class="mono">24.99</span>.
      </p>
    </div>

    <div class="card" id="csv-preview-card" hidden>
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <h3 style="margin:0">Preview</h3>
        <span class="text-dim" id="csv-summary" style="font-size:13px"></span>
      </div>
      <div id="csv-preview-table" style="max-height:420px; overflow:auto; margin-top:10px"></div>
      <button class="primary" id="csv-import-btn" style="width:100%; font-size:16px; padding:14px; margin-top:14px;">Import</button>
      <div id="csv-progress" class="text-dim" style="margin-top:10px; font-size:13px"></div>
    </div>
  `;
}

function wireUp(container) {
  qs("[data-action='download-template']", container).addEventListener("click", downloadTemplate);
  qs("#csv-file-input", container).addEventListener("change", (e) => handleFile(container, e.target.files[0]));
  qs("#csv-import-btn", container).addEventListener("click", () => runImport(container));
}

async function handleFile(container, file) {
  if (!file) return;
  const text = await file.text();
  const raw = parseCsv(text);
  if (raw.length === 0) {
    toast("That CSV doesn't have any rows to import", "error");
    return;
  }

  const existingByBarcode = new Map(
    store.items.list().filter((it) => it.barcode).map((it) => [normalizeBarcode(it.barcode), it])
  );
  const seenBarcodes = new Set();

  parsedRows = raw.map((r, idx) => {
    const name = (r.name || "").trim();
    const barcode = (r.barcode || "").trim();
    const normalized = barcode ? normalizeBarcode(barcode) : "";
    const errors = [];
    if (!name) errors.push("Missing name");
    if (normalized && seenBarcodes.has(normalized)) errors.push("Duplicate barcode in this file");
    if (normalized) seenBarcodes.add(normalized);

    const existing = normalized ? existingByBarcode.get(normalized) : null;

    return {
      rowNum: idx + 2, // +1 for header row, +1 for 1-indexing
      name,
      barcode,
      category: (r.category || "").trim(),
      condition: (r.condition || "").trim(),
      description: (r.description || "").trim(),
      cost: r.cost ? parseMoneyToCents(r.cost) : 0,
      price: r.price ? parseMoneyToCents(r.price) : 0,
      quantityOnHand: r.quantity ? (parseInt(r.quantity, 10) || 0) : 0,
      tags: (r.tags || "").split(";").map((t) => t.trim()).filter(Boolean),
      images: (r.images || "").split(";").map((t) => t.trim()).filter(Boolean),
      errors,
      action: errors.length ? "skip" : (existing ? "update" : "create"),
      existingId: existing?.id || null,
    };
  });

  renderPreview(container);
}

function renderPreview(container) {
  qs("#csv-preview-card", container).hidden = false;
  const creates = parsedRows.filter((r) => r.action === "create").length;
  const updates = parsedRows.filter((r) => r.action === "update").length;
  const skips = parsedRows.filter((r) => r.action === "skip").length;
  qs("#csv-summary", container).textContent = `${parsedRows.length} rows · ${creates} new · ${updates} update${updates === 1 ? "" : "s"} · ${skips} skipped`;

  qs("#csv-preview-table", container).innerHTML = `
    <table>
      <thead><tr><th>Row</th><th>Name</th><th>Barcode</th><th>Price</th><th>Qty</th><th>Action</th></tr></thead>
      <tbody>
        ${parsedRows.map((r) => `
          <tr>
            <td class="text-dim">${r.rowNum}</td>
            <td>${escapeHtml(r.name || "(blank)")}</td>
            <td class="mono text-dim">${escapeHtml(r.barcode || "")}</td>
            <td>${formatMoney(r.price)}</td>
            <td>${r.quantityOnHand}</td>
            <td>${
              r.action === "skip" ? `<span class="text-bad">Skipped — ${escapeHtml(r.errors.join(", "))}</span>`
              : r.action === "update" ? `<span class="text-dim">Update existing</span>`
              : `New`
            }</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  qs("#csv-import-btn", container).disabled = (creates + updates) === 0;
}

async function runImport(container) {
  const rows = parsedRows.filter((r) => r.action !== "skip");
  if (rows.length === 0) return;

  const btn = qs("#csv-import-btn", container);
  const progress = qs("#csv-progress", container);
  btn.disabled = true;

  let created = 0, updated = 0, failed = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    progress.textContent = `Importing ${i + 1} / ${rows.length}…`;
    const data = {
      name: r.name, barcode: r.barcode, category: r.category, condition: r.condition,
      description: r.description, cost: r.cost, price: r.price, quantityOnHand: r.quantityOnHand,
      tags: r.tags, images: r.images,
    };
    try {
      if (r.action === "update") { await store.items.update(r.existingId, data); updated++; }
      else { await store.items.add(data); created++; }
    } catch (err) {
      console.warn("Import failed for row", r.rowNum, err);
      failed++;
    }
  }

  progress.textContent = "";
  toast(`Import complete — ${created} added, ${updated} updated${failed ? `, ${failed} failed` : ""}`, failed ? "error" : "success", 6000);
  parsedRows = [];
  qs("#csv-preview-card", container).hidden = true;
  qs("#csv-file-input", container).value = "";
}

function downloadTemplate() {
  const sample = [{
    name: "Signed Star Wars Photo", barcode: "BSC-000001", category: "Signed memorabilia",
    condition: "Mint", description: "Signed 10x8 photo", cost: "50", price: "120",
    quantity: "3", tags: "star wars;signed", images: "",
  }];
  const csv = toCsv(sample, CSV_HEADERS);
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "bsc-product-import-template.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
