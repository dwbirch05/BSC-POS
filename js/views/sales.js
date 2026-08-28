import { store } from "../store.js";
import { formatMoney, formatDateTime, escapeHtml } from "../utils.js";
import { qs, toast, openModal, closeModal } from "../ui.js";
import { renderReceiptHtml, printReceipt, emailReceipt } from "../receipt.js";

let unsubscribe = null;

export function renderSales(container) {
  if (unsubscribe) unsubscribe();
  const events = store.events.list();
  container.innerHTML = `
    <div class="card">
      <h2 style="margin-top:0">Sales history</h2>
      <div class="row">
        <div class="field">
          <label>Event</label>
          <select id="filter-event"><option value="">All events</option>${events.map((e) => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join("")}</select>
        </div>
        <div class="field">
          <label>From</label>
          <input id="filter-from" type="date" />
        </div>
        <div class="field">
          <label>To</label>
          <input id="filter-to" type="date" />
        </div>
      </div>
      <div id="sales-summary" class="text-dim" style="margin-bottom:10px"></div>
      <div id="sales-table"></div>
    </div>
  `;

  const table = qs("#sales-table", container);
  const summary = qs("#sales-summary", container);
  const eventFilter = qs("#filter-event", container);
  const fromFilter = qs("#filter-from", container);
  const toFilter = qs("#filter-to", container);

  function draw() {
    let sales = store.sales.list();
    if (eventFilter.value) sales = sales.filter((s) => s.eventId === eventFilter.value);
    if (fromFilter.value) sales = sales.filter((s) => s.createdAt >= fromFilter.value);
    if (toFilter.value) sales = sales.filter((s) => s.createdAt <= toFilter.value + "T23:59:59");

    const revenue = sales.reduce((sum, s) => sum + s.total, 0);
    summary.textContent = `${sales.length} sale${sales.length === 1 ? "" : "s"} · ${formatMoney(revenue)} total`;

    if (sales.length === 0) { table.innerHTML = `<div class="empty-state">No sales in this range.</div>`; return; }
    table.innerHTML = `
      <table>
        <thead><tr><th>Date</th><th>Event</th><th>Customer</th><th>Items</th><th>Payment</th><th>Total</th><th></th></tr></thead>
        <tbody>
          ${sales.map((s) => `
            <tr>
              <td>${formatDateTime(s.createdAt)}</td>
              <td class="text-dim">${escapeHtml(s.eventName || "")}</td>
              <td class="text-dim">${escapeHtml(s.customerName || "Walk-in")}</td>
              <td>${(s.lineItems || []).reduce((n, l) => n + l.qty, 0)}</td>
              <td><span class="pill">${escapeHtml(s.paymentMethod)}</span></td>
              <td>${formatMoney(s.total)}</td>
              <td style="text-align:right"><button class="ghost" data-id="${s.id}" data-action="view-sale">View</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  [eventFilter, fromFilter, toFilter].forEach((f) => f.addEventListener("change", draw));
  table.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action='view-sale']");
    if (btn) showSaleModal(store.sales.get(btn.dataset.id));
  });

  unsubscribe = store.sales.onChange(draw);
}

function showSaleModal(sale) {
  if (!sale) return;
  const modal = openModal(`
    ${renderReceiptHtml(sale)}
    <div class="modal-actions no-print">
      <button data-action="close">Close</button>
      ${sale.customerEmail ? `<button data-action="email">Email receipt</button>` : ""}
      <button class="primary" data-action="print">Print receipt</button>
    </div>
  `);
  modal.addEventListener("click", (e) => {
    const action = e.target.dataset.action;
    if (action === "close") closeModal();
    if (action === "print") printReceipt();
    if (action === "email") emailReceipt(sale, sale.customerEmail);
  });
}
