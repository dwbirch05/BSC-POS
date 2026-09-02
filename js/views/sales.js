import { store } from "../store.js";
import { formatMoney, formatDateTime, escapeHtml } from "../utils.js";
import { qs, toast, openModal, closeModal } from "../ui.js";
import { renderReceiptHtml, printReceipt, emailReceipt } from "../receipt.js";

let unsubscribe = null;

export function renderSales(container, { navigate } = {}) {
  if (unsubscribe) unsubscribe();
  const events = store.events.list();
  const staff = store.users.list();
  container.innerHTML = `
    <div class="card">
      <div class="row" style="margin-bottom:10px; gap:6px;">
        <button type="button" class="primary" style="flex:0 0 auto" data-action="report-tab-sales">Sales History</button>
        <button type="button" class="ghost" style="flex:0 0 auto" data-action="report-tab-products">Product History</button>
      </div>
      <h2 style="margin-top:0">Sales history</h2>
      <div class="row">
        <div class="field">
          <label>Event</label>
          <select id="filter-event"><option value="">All events</option>${events.map((e) => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join("")}</select>
        </div>
        <div class="field">
          <label>Staff</label>
          <select id="filter-staff"><option value="">All staff</option>${staff.map((u) => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join("")}</select>
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
      <div class="field" style="max-width:260px">
        <label>Group by</label>
        <select id="filter-groupby">
          <option value="none">None — individual sales</option>
          <option value="event">Event (totals)</option>
          <option value="staff">Staff (totals)</option>
        </select>
      </div>
      <div id="sales-summary" class="text-dim" style="margin-bottom:10px"></div>
      <div id="sales-table"></div>
    </div>
  `;

  const table = qs("#sales-table", container);
  const summary = qs("#sales-summary", container);
  const eventFilter = qs("#filter-event", container);
  const staffFilter = qs("#filter-staff", container);
  const fromFilter = qs("#filter-from", container);
  const toFilter = qs("#filter-to", container);
  const groupBy = qs("#filter-groupby", container);

  function filteredSales() {
    let sales = store.sales.list();
    if (eventFilter.value) sales = sales.filter((s) => s.eventId === eventFilter.value);
    if (staffFilter.value) sales = sales.filter((s) => s.staffUserId === staffFilter.value);
    if (fromFilter.value) sales = sales.filter((s) => s.createdAt >= fromFilter.value);
    if (toFilter.value) sales = sales.filter((s) => s.createdAt <= toFilter.value + "T23:59:59");
    return sales;
  }

  function draw() {
    const sales = filteredSales();
    const revenue = sales.reduce((sum, s) => sum + s.total, 0);
    summary.textContent = `${sales.length} sale${sales.length === 1 ? "" : "s"} · ${formatMoney(revenue)} total`;

    if (sales.length === 0) { table.innerHTML = `<div class="empty-state">No sales in this range.</div>`; return; }

    if (groupBy.value === "none") {
      drawIndividual(sales);
    } else {
      drawGrouped(sales, groupBy.value);
    }
  }

  function drawIndividual(sales) {
    table.innerHTML = `
      <table>
        <thead><tr><th>Date</th><th>Event</th><th>Staff</th><th>Customer</th><th>Items</th><th>Payment</th><th>Total</th><th></th></tr></thead>
        <tbody>
          ${sales.map((s) => `
            <tr>
              <td>${formatDateTime(s.createdAt)}</td>
              <td class="text-dim">${escapeHtml(s.eventName || "")}</td>
              <td class="text-dim">${escapeHtml(s.staffName || "")}</td>
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

  // Grouped totals report — same aggregate-then-sort-by-revenue pattern as
  // Reporting > Product History, just keyed by event or staff instead of item.
  function drawGrouped(sales, by) {
    const keyOf = by === "event"
      ? (s) => ({ key: s.eventId || "none", label: s.eventName || "(no event)" })
      : (s) => ({ key: s.staffUserId || "none", label: s.staffName || "(unknown staff)" });

    const groups = new Map(); // key -> { label, count, revenue }
    for (const sale of sales) {
      const { key, label } = keyOf(sale);
      const agg = groups.get(key) || { label, count: 0, revenue: 0 };
      agg.count += 1;
      agg.revenue += sale.total;
      groups.set(key, agg);
    }

    const rows = [...groups.values()].sort((a, b) => b.revenue - a.revenue);
    table.innerHTML = `
      <table>
        <thead><tr><th>${by === "event" ? "Event" : "Staff"}</th><th>Sales</th><th>Total revenue</th></tr></thead>
        <tbody>
          ${rows.map((r) => `
            <tr>
              <td>${escapeHtml(r.label)}</td>
              <td>${r.count}</td>
              <td>${formatMoney(r.revenue)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  [eventFilter, staffFilter, fromFilter, toFilter, groupBy].forEach((f) => f.addEventListener("change", draw));
  table.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action='view-sale']");
    if (btn) showSaleModal(store.sales.get(btn.dataset.id));
  });
  qs("[data-action='report-tab-products']", container).addEventListener("click", () => navigate?.("reporting-products"));

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
