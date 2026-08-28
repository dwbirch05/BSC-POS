import { store } from "../store.js";
import { formatMoney, parseMoneyToCents, escapeHtml, debounce } from "../utils.js";
import { qs, qsa, el, toast, openModal, closeModal, onAction } from "../ui.js";
import { renderBarcodeSVG, generateSku, isCode39Encodable } from "../barcode.js";

let unsubscribe = null;

export function renderInventory(container, { prefillBarcode } = {}) {
  if (unsubscribe) unsubscribe();
  container.innerHTML = `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <h2 style="margin:0">Inventory</h2>
        <button class="primary" data-action="add-item">+ Add item</button>
      </div>
      <div class="search-box" style="margin-top:14px">
        <input id="inv-search" placeholder="Search by name, category, barcode…" />
      </div>
      <div id="inv-table"></div>
    </div>
  `;

  const table = qs("#inv-table", container);
  const search = qs("#inv-search", container);

  function draw() {
    const q = search.value.trim();
    const items = q ? store.items.search(q) : store.items.list();
    if (items.length === 0) {
      table.innerHTML = `<div class="empty-state">No items yet — click "Add item" to start building your inventory.</div>`;
      return;
    }
    table.innerHTML = `
      <table>
        <thead><tr><th>Name</th><th>Category</th><th>Barcode</th><th>Price</th><th>Stock</th><th></th></tr></thead>
        <tbody>
          ${items.map((it) => `
            <tr>
              <td>${escapeHtml(it.name)}</td>
              <td class="text-dim">${escapeHtml(it.category || "")}</td>
              <td class="mono text-dim">${escapeHtml(it.barcode || "")}</td>
              <td>${formatMoney(it.price ?? 0)}</td>
              <td class="${(it.quantityOnHand ?? 0) <= 0 ? "text-bad" : ""}">${it.quantityOnHand ?? 0}</td>
              <td style="text-align:right; white-space:nowrap;">
                <button class="ghost" data-action="view-item" data-id="${it.id}">View</button>
                <button class="ghost" data-action="edit-item" data-id="${it.id}">Edit</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  search.addEventListener("input", debounce(draw, 120));

  onAction(container, {
    "add-item": () => openItemModal(),
    "edit-item": (btn) => openItemModal(store.items.get(btn.dataset.id)),
    "view-item": (btn) => openItemDetail(store.items.get(btn.dataset.id)),
  });

  unsubscribe = store.items.onChange(draw);

  if (prefillBarcode) openItemModal(null, prefillBarcode);
}

function openItemModal(existing, prefillBarcode) {
  const isEdit = !!existing;
  const modal = openModal(`
    <h2>${isEdit ? "Edit item" : "Add item"}</h2>
    <div class="field"><label>Name</label><input id="f-name" value="${escapeHtml(existing?.name || "")}" /></div>
    <div class="row">
      <div class="field"><label>Category</label><input id="f-category" value="${escapeHtml(existing?.category || "")}" placeholder="Film cell, signed photo, etc." /></div>
      <div class="field"><label>Condition / notes</label><input id="f-condition" value="${escapeHtml(existing?.condition || "")}" /></div>
    </div>
    <div class="field"><label>Description</label><textarea id="f-desc" rows="2">${escapeHtml(existing?.description || "")}</textarea></div>
    <div class="row">
      <div class="field"><label>Cost ($)</label><input id="f-cost" value="${existing ? (existing.cost ?? 0) / 100 : ""}" /></div>
      <div class="field"><label>Price ($)</label><input id="f-price" value="${existing ? (existing.price ?? 0) / 100 : ""}" /></div>
      <div class="field"><label>Qty on hand</label><input id="f-qty" type="number" value="${existing?.quantityOnHand ?? 1}" /></div>
    </div>
    <div class="field">
      <label>Barcode</label>
      <div class="row" style="align-items:flex-start">
        <input id="f-barcode" value="${escapeHtml(existing?.barcode || prefillBarcode || "")}" placeholder="Scan an existing barcode, or generate one" />
        <button type="button" data-action="generate-barcode" style="flex:0 0 auto">Generate SKU</button>
      </div>
      <p class="text-dim" id="barcode-warning" style="font-size:12px; margin:6px 0 0"></p>
    </div>
    <div id="barcode-preview"></div>
    <div class="modal-actions">
      ${isEdit ? `<button class="danger" data-action="delete">Delete</button>` : `<span></span>`}
      <button data-action="cancel">Cancel</button>
      <button class="primary" data-action="save">${isEdit ? "Save changes" : "Add item"}</button>
    </div>
  `);

  const barcodeInput = qs("#f-barcode", modal);
  const updatePreview = () => {
    const code = barcodeInput.value.trim();
    const warn = qs("#barcode-warning", modal);
    const preview = qs("#barcode-preview", modal);
    if (!code) { preview.innerHTML = ""; warn.textContent = ""; return; }
    if (!isCode39Encodable(code)) {
      warn.textContent = "This code has characters that can't be printed as a barcode (letters/numbers/dash only) — it will still work for manual lookup.";
      preview.innerHTML = "";
      return;
    }
    warn.textContent = "";
    preview.innerHTML = `<div class="barcode-label">${renderBarcodeSVG(code, { narrow: 2 })}</div>`;
  };
  barcodeInput.addEventListener("input", debounce(updatePreview, 150));
  updatePreview();

  modal.addEventListener("click", async (e) => {
    const action = e.target.dataset.action;
    if (action === "cancel") closeModal();

    if (action === "generate-barcode") {
      const n = await store.items.nextSkuNumber();
      barcodeInput.value = generateSku(n);
      updatePreview();
    }

    if (action === "delete") {
      if (!confirm(`Delete "${existing.name}"? This can't be undone.`)) return;
      await store.items.remove(existing.id);
      toast("Item deleted", "success");
      closeModal();
    }

    if (action === "save") {
      const name = qs("#f-name", modal).value.trim();
      if (!name) { toast("Enter a name", "error"); return; }
      const data = {
        name,
        category: qs("#f-category", modal).value.trim(),
        condition: qs("#f-condition", modal).value.trim(),
        description: qs("#f-desc", modal).value.trim(),
        cost: parseMoneyToCents(qs("#f-cost", modal).value || "0"),
        price: parseMoneyToCents(qs("#f-price", modal).value || "0"),
        quantityOnHand: parseInt(qs("#f-qty", modal).value || "0", 10),
        barcode: barcodeInput.value.trim(),
      };
      try {
        if (isEdit) {
          await store.items.update(existing.id, data);
          toast("Item updated", "success");
        } else {
          await store.items.add(data);
          toast("Item added", "success");
        }
        closeModal();
      } catch (err) {
        toast("Couldn't save: " + err.message, "error");
      }
    }
  });
}

function openItemDetail(item) {
  if (!item) return;
  const modal = openModal(`
    <h2>${escapeHtml(item.name)}</h2>
    <p class="text-dim">${escapeHtml(item.category || "")}${item.condition ? " · " + escapeHtml(item.condition) : ""}</p>
    <p>${escapeHtml(item.description || "")}</p>
    <div class="row">
      <div><label>Price</label><div>${formatMoney(item.price ?? 0)}</div></div>
      <div><label>Cost</label><div>${formatMoney(item.cost ?? 0)}</div></div>
      <div><label>Qty on hand</label><div>${item.quantityOnHand ?? 0}</div></div>
    </div>
    ${item.barcode && isCode39Encodable(item.barcode) ? `
      <div class="field" style="margin-top:16px">
        <label>Printable label</label>
        <div class="barcode-label" id="label-print-area">
          <div class="item-name">${escapeHtml(item.name)}</div>
          <div class="item-price">${formatMoney(item.price ?? 0)}</div>
          ${renderBarcodeSVG(item.barcode, { narrow: 2 })}
        </div>
      </div>` : ""}
    <div class="modal-actions">
      <button data-action="close">Close</button>
      ${item.barcode ? `<button class="primary" data-action="print-label">Print label</button>` : ""}
    </div>
  `);
  modal.addEventListener("click", (e) => {
    if (e.target.dataset.action === "close") closeModal();
    if (e.target.dataset.action === "print-label") window.print();
  });
}
