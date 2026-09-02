// ---------------------------------------------------------------------------
// Aggregate performance report: for every product, how many units have sold,
// how much revenue that's brought in, and how much stock is left right now.
// No per-sale drill-down here — that's what Reporting > Sales History is for.
// ---------------------------------------------------------------------------
import { store } from "../store.js";
import { formatMoney, escapeHtml, debounce } from "../utils.js";
import { qs } from "../ui.js";

let unsubItems = null;
let unsubSales = null;

export function renderProductHistory(container, { navigate } = {}) {
  if (unsubItems) unsubItems();
  if (unsubSales) unsubSales();

  container.innerHTML = `
    <div class="card">
      <div class="row" style="margin-bottom:10px; gap:6px;">
        <button type="button" class="ghost" style="flex:0 0 auto" data-action="report-tab-sales">Sales History</button>
        <button type="button" class="primary" style="flex:0 0 auto" data-action="report-tab-products">Product History</button>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <h2 style="margin:0">Product history</h2>
        <span class="text-dim" id="ph-summary" style="font-size:13px"></span>
      </div>
      <div class="search-box" style="margin-top:14px">
        <input id="ph-search" placeholder="Search by name, category, barcode…" />
      </div>
      <div id="ph-table"></div>
    </div>
  `;

  const table = qs("#ph-table", container);
  const summary = qs("#ph-summary", container);
  const search = qs("#ph-search", container);

  function draw() {
    const sales = store.sales.list();
    const soldByItem = new Map(); // itemId -> {units, revenue}
    for (const sale of sales) {
      for (const line of sale.lineItems || []) {
        const agg = soldByItem.get(line.itemId) || { units: 0, revenue: 0 };
        agg.units += line.qty;
        agg.revenue += line.priceAtSale * line.qty;
        soldByItem.set(line.itemId, agg);
      }
    }

    const q = search.value.trim().toLowerCase();
    let items = store.items.list();
    if (q) {
      items = items.filter((it) =>
        [it.name, it.barcode, it.category].filter(Boolean).some((f) => f.toLowerCase().includes(q))
      );
    }

    const rows = items.map((it) => ({
      item: it,
      ...(soldByItem.get(it.id) || { units: 0, revenue: 0 }),
    })).sort((a, b) => b.revenue - a.revenue);

    const totalUnits = rows.reduce((n, r) => n + r.units, 0);
    const totalRevenue = rows.reduce((n, r) => n + r.revenue, 0);
    summary.textContent = `${rows.length} product${rows.length === 1 ? "" : "s"} · ${totalUnits} units sold · ${formatMoney(totalRevenue)} revenue`;

    if (rows.length === 0) {
      table.innerHTML = `<div class="empty-state">No products to show.</div>`;
      return;
    }
    table.innerHTML = `
      <table>
        <thead><tr><th>Product</th><th>Category</th><th>Units sold</th><th>Revenue</th><th>Current stock</th></tr></thead>
        <tbody>
          ${rows.map((r) => `
            <tr>
              <td>${escapeHtml(r.item.name)}</td>
              <td class="text-dim">${escapeHtml(r.item.category || "")}</td>
              <td>${r.units}</td>
              <td>${formatMoney(r.revenue)}</td>
              <td class="${(r.item.quantityOnHand ?? 0) <= 0 ? "text-bad" : ""}">${r.item.quantityOnHand ?? 0}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  search.addEventListener("input", debounce(draw, 120));
  qs("[data-action='report-tab-sales']", container).addEventListener("click", () => navigate?.("reporting-sales"));
  unsubItems = store.items.onChange(draw);
  unsubSales = store.sales.onChange(draw);
}
