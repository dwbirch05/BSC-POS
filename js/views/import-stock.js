// ---------------------------------------------------------------------------
// Log stock arriving from a supplier/order: pick a date, find each product by
// its code, record the cost + quantity received, and build up the order
// before committing it in one go. Cost logged here is for record-keeping
// only — it never overwrites the item's stored cost or price.
// ---------------------------------------------------------------------------
import { store } from "../store.js";
import { formatMoney, parseMoneyToCents, escapeHtml } from "../utils.js";
import { qs, toast } from "../ui.js";

let lines = []; // [{itemId, name, barcode, cost, qty}]

export function renderImportStock(container) {
  lines = [];
  container.innerHTML = template();
  wireUp(container);
}

function template() {
  const today = new Date().toISOString().slice(0, 10);
  return `
    <div class="card">
      <h2 style="margin-top:0">Import stock</h2>
      <p class="text-dim">Log a delivery: find each product by its code, add the cost and quantity you received, then build up the order below before completing it.</p>
      <div class="field" style="max-width:220px">
        <label>Import date</label>
        <input id="imp-date" type="date" value="${today}" />
      </div>
    </div>

    <div class="card">
      <h3 style="margin-top:0">Add a product</h3>
      <div class="field">
        <label>Product code</label>
        <input id="imp-code" placeholder="Scan or type the barcode / SKU, then press Enter" autocomplete="off" />
      </div>
      <div id="imp-found"></div>
    </div>

    <div class="card">
      <h3 style="margin-top:0">This order</h3>
      <div id="imp-lines"></div>
      <div class="subtotal-row"><span>Total cost</span><span id="imp-total">${formatMoney(0)}</span></div>
      <button class="primary" id="imp-complete" style="width:100%; font-size:16px; padding:14px; margin-top:10px;" disabled>Complete import</button>
    </div>
  `;
}

function wireUp(container) {
  const dateInput = qs("#imp-date", container);
  const codeInput = qs("#imp-code", container);

  codeInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const code = codeInput.value.trim();
    if (!code) return;
    const item = store.items.findByBarcode(code);
    if (!item) {
      toast(`No inventory item found with code "${escapeHtml(code)}"`, "error");
      return;
    }
    showFound(container, item);
  });

  container.addEventListener("click", (e) => {
    const action = e.target.dataset.action;
    if (action === "add-line") {
      const found = e.target.closest(".import-found");
      const item = store.items.get(found.dataset.id);
      if (!item) return;
      const cost = parseMoneyToCents(qs("#found-cost", found).value || "0");
      const qty = parseInt(qs("#found-qty", found).value || "0", 10);
      if (!qty || qty <= 0) { toast("Enter a quantity", "error"); return; }
      lines.push({ itemId: item.id, name: item.name, barcode: item.barcode, cost, qty });
      qs("#imp-found", container).innerHTML = "";
      codeInput.value = "";
      codeInput.focus();
      renderLines(container);
    }
    if (action === "remove-import-line") {
      lines.splice(parseInt(e.target.dataset.idx, 10), 1);
      renderLines(container);
    }
  });

  qs("#imp-complete", container).addEventListener("click", () => completeImport(container, dateInput));

  renderLines(container);
}

function showFound(container, item) {
  qs("#imp-found", container).innerHTML = `
    <div class="card import-found" data-id="${item.id}" style="margin-top:10px">
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <div class="text-dim" style="font-size:13px">${escapeHtml(item.category || "")} · currently ${item.quantityOnHand ?? 0} on hand</div>
      </div>
      <div class="row" style="margin-top:10px">
        <div class="field"><label>Cost per unit ($)</label><input id="found-cost" value="${item.cost ? (item.cost / 100).toFixed(2) : ""}" /></div>
        <div class="field"><label>Quantity received</label><input id="found-qty" type="number" min="1" value="1" /></div>
      </div>
      <button class="primary" data-action="add-line" style="width:100%">Add to import</button>
    </div>
  `;
}

function renderLines(container) {
  const wrap = qs("#imp-lines", container);
  if (lines.length === 0) {
    wrap.innerHTML = `<div class="empty-state">No products added yet.</div>`;
  } else {
    wrap.innerHTML = lines.map((l, idx) => `
      <div class="cart-item">
        <span class="name">${escapeHtml(l.name)} <span class="text-dim mono">${escapeHtml(l.barcode || "")}</span></span>
        <span class="text-dim">x${l.qty}</span>
        <span class="mono">${formatMoney(l.cost * l.qty)}</span>
        <button class="ghost" data-action="remove-import-line" data-idx="${idx}" title="Remove">✕</button>
      </div>
    `).join("");
  }
  const total = lines.reduce((sum, l) => sum + l.cost * l.qty, 0);
  qs("#imp-total", container).textContent = formatMoney(total);
  qs("#imp-complete", container).disabled = lines.length === 0;
}

async function completeImport(container, dateInput) {
  if (lines.length === 0) return;
  const btn = qs("#imp-complete", container);
  btn.disabled = true;
  try {
    for (const l of lines) {
      const item = store.items.get(l.itemId);
      if (item) {
        await store.items.update(item.id, { quantityOnHand: (item.quantityOnHand ?? 0) + l.qty });
      }
    }
    await store.imports.add({
      importDate: dateInput.value || new Date().toISOString().slice(0, 10),
      lines: lines.map((l) => ({ itemId: l.itemId, name: l.name, barcode: l.barcode, cost: l.cost, qty: l.qty })),
      totalCost: lines.reduce((sum, l) => sum + l.cost * l.qty, 0),
      totalUnits: lines.reduce((sum, l) => sum + l.qty, 0),
    });
    toast("Stock imported", "success");
    lines = [];
    renderLines(container);
    qs("#imp-found", container).innerHTML = "";
  } catch (err) {
    toast("Couldn't complete import: " + err.message, "error");
    btn.disabled = false;
  }
}
