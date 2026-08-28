// ---------------------------------------------------------------------------
// A read-only log of past "Import stock" batches, so you can look back at
// what came in and when. See import-stock.js for how these records are made.
// ---------------------------------------------------------------------------
import { store } from "../store.js";
import { formatMoney, formatDate, formatDateTime, escapeHtml } from "../utils.js";
import { qs, openModal, closeModal } from "../ui.js";

let unsubscribe = null;

export function renderImportHistory(container) {
  if (unsubscribe) unsubscribe();
  container.innerHTML = `
    <div class="card">
      <h2 style="margin-top:0">Import history</h2>
      <p class="text-dim">Past stock deliveries you've logged, most recent first.</p>
      <div id="imp-hist-table"></div>
    </div>
  `;

  const table = qs("#imp-hist-table", container);

  function draw() {
    const batches = store.imports.list();
    if (batches.length === 0) {
      table.innerHTML = `<div class="empty-state">No imports logged yet — use "Import Stock" to log a delivery.</div>`;
      return;
    }
    table.innerHTML = `
      <table>
        <thead><tr><th>Import date</th><th>Products</th><th>Units</th><th>Total cost</th><th>Logged</th><th></th></tr></thead>
        <tbody>
          ${batches.map((b) => `
            <tr>
              <td>${formatDate(b.importDate)}</td>
              <td>${(b.lines || []).length}</td>
              <td>${b.totalUnits ?? (b.lines || []).reduce((n, l) => n + l.qty, 0)}</td>
              <td>${formatMoney(b.totalCost ?? (b.lines || []).reduce((n, l) => n + l.cost * l.qty, 0))}</td>
              <td class="text-dim">${formatDateTime(b.createdAt)}</td>
              <td style="text-align:right"><button class="ghost" data-id="${b.id}" data-action="view-import">View</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  table.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action='view-import']");
    if (btn) showImportModal(store.imports.get(btn.dataset.id));
  });

  unsubscribe = store.imports.onChange(draw);
}

function showImportModal(batch) {
  if (!batch) return;
  const modal = openModal(`
    <h2>Import — ${formatDate(batch.importDate)}</h2>
    <p class="text-dim">Logged ${formatDateTime(batch.createdAt)}</p>
    <table>
      <thead><tr><th>Product</th><th>Code</th><th>Qty</th><th>Cost each</th><th>Line cost</th></tr></thead>
      <tbody>
        ${(batch.lines || []).map((l) => `
          <tr>
            <td>${escapeHtml(l.name)}</td>
            <td class="mono text-dim">${escapeHtml(l.barcode || "")}</td>
            <td>${l.qty}</td>
            <td>${formatMoney(l.cost)}</td>
            <td>${formatMoney(l.cost * l.qty)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    <div class="subtotal-row"><span>Total</span><span>${formatMoney(batch.totalCost ?? (batch.lines || []).reduce((n, l) => n + l.cost * l.qty, 0))}</span></div>
    <div class="modal-actions"><button data-action="close">Close</button></div>
  `);
  modal.addEventListener("click", (e) => { if (e.target.dataset.action === "close") closeModal(); });
}
