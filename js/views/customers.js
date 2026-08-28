import { store } from "../store.js";
import { formatMoney, formatDate, escapeHtml, debounce } from "../utils.js";
import { qs, toast, openModal, closeModal, onAction } from "../ui.js";

let unsubscribe = null;

export function renderCustomers(container) {
  if (unsubscribe) unsubscribe();
  container.innerHTML = `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <h2 style="margin:0">Customers</h2>
        <button class="primary" data-action="add-cust">+ Add customer</button>
      </div>
      <div class="search-box" style="margin-top:14px">
        <input id="cust-search" placeholder="Search name, email, phone…" />
      </div>
      <div id="cust-table"></div>
    </div>
  `;

  const table = qs("#cust-table", container);
  const search = qs("#cust-search", container);

  function draw() {
    const q = search.value.trim();
    const list = q ? store.customers.search(q) : store.customers.list();
    if (list.length === 0) {
      table.innerHTML = `<div class="empty-state">No customers yet.</div>`;
      return;
    }
    table.innerHTML = `
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Purchases</th><th></th></tr></thead>
        <tbody>
          ${list.map((c) => {
            const sales = store.sales.forCustomer(c.id);
            return `
            <tr>
              <td>${escapeHtml(c.name)}</td>
              <td class="text-dim">${escapeHtml(c.email || "")}</td>
              <td class="text-dim">${escapeHtml(c.phone || "")}</td>
              <td>${sales.length}</td>
              <td style="text-align:right">
                <button class="ghost" data-action="view-cust" data-id="${c.id}">View</button>
                <button class="ghost" data-action="edit-cust" data-id="${c.id}">Edit</button>
              </td>
            </tr>
          `; }).join("")}
        </tbody>
      </table>
    `;
  }

  search.addEventListener("input", debounce(draw, 120));
  onAction(container, {
    "add-cust": () => openCustModal(),
    "edit-cust": (btn) => openCustModal(store.customers.get(btn.dataset.id)),
    "view-cust": (btn) => openCustDetail(store.customers.get(btn.dataset.id)),
  });
  unsubscribe = store.customers.onChange(draw);
}

function openCustModal(existing) {
  const isEdit = !!existing;
  const modal = openModal(`
    <h2>${isEdit ? "Edit customer" : "Add customer"}</h2>
    <div class="field"><label>Name</label><input id="f-name" value="${escapeHtml(existing?.name || "")}" /></div>
    <div class="row">
      <div class="field"><label>Email</label><input id="f-email" type="email" value="${escapeHtml(existing?.email || "")}" /></div>
      <div class="field"><label>Phone</label><input id="f-phone" value="${escapeHtml(existing?.phone || "")}" /></div>
    </div>
    <div class="field"><label>Delivery address</label><input id="f-street" placeholder="Street address" value="${escapeHtml(existing?.street || "")}" /></div>
    <div class="row">
      <div class="field"><label>Suburb</label><input id="f-suburb" value="${escapeHtml(existing?.suburb || "")}" /></div>
      <div class="field"><label>State</label><input id="f-state" value="${escapeHtml(existing?.state || "")}" /></div>
      <div class="field"><label>Postcode</label><input id="f-postcode" value="${escapeHtml(existing?.postcode || "")}" /></div>
    </div>
    <div class="field"><label>Notes</label><textarea id="f-notes" rows="2">${escapeHtml(existing?.notes || "")}</textarea></div>
    <div class="modal-actions">
      ${isEdit ? `<button class="danger" data-action="delete">Delete</button>` : `<span></span>`}
      <button data-action="cancel">Cancel</button>
      <button class="primary" data-action="save">${isEdit ? "Save changes" : "Add customer"}</button>
    </div>
  `);
  modal.addEventListener("click", async (e) => {
    const action = e.target.dataset.action;
    if (action === "cancel") closeModal();
    if (action === "delete") {
      if (!confirm(`Delete ${existing.name}?`)) return;
      await store.customers.remove(existing.id);
      closeModal();
    }
    if (action === "save") {
      const name = qs("#f-name", modal).value.trim();
      if (!name) { toast("Enter a name", "error"); return; }
      const data = {
        name,
        email: qs("#f-email", modal).value.trim(),
        phone: qs("#f-phone", modal).value.trim(),
        street: qs("#f-street", modal).value.trim(),
        suburb: qs("#f-suburb", modal).value.trim(),
        state: qs("#f-state", modal).value.trim(),
        postcode: qs("#f-postcode", modal).value.trim(),
        notes: qs("#f-notes", modal).value.trim(),
      };
      if (isEdit) await store.customers.update(existing.id, data);
      else await store.customers.add(data);
      toast(isEdit ? "Customer updated" : "Customer added", "success");
      closeModal();
    }
  });
}

function formatAddress(c) {
  const line2 = [c.suburb, c.state, c.postcode].filter(Boolean).join(" ");
  return [c.street, line2].filter(Boolean).join(", ");
}

function openCustDetail(customer) {
  if (!customer) return;
  const sales = store.sales.forCustomer(customer.id);
  const address = formatAddress(customer);
  const modal = openModal(`
    <h2>${escapeHtml(customer.name)}</h2>
    <p class="text-dim">${escapeHtml(customer.email || "")} ${customer.phone ? " · " + escapeHtml(customer.phone) : ""}</p>
    ${address ? `<p><label>Delivery address</label>${escapeHtml(address)}</p>` : ""}
    ${customer.notes ? `<p>${escapeHtml(customer.notes)}</p>` : ""}
    <h3>Purchase history</h3>
    ${sales.length === 0 ? `<p class="text-dim">No purchases yet.</p>` : `
      <table>
        <thead><tr><th>Date</th><th>Event</th><th>Total</th></tr></thead>
        <tbody>
          ${sales.map((s) => `<tr><td>${formatDate(s.createdAt)}</td><td class="text-dim">${escapeHtml(s.eventName || "")}</td><td>${formatMoney(s.total)}</td></tr>`).join("")}
        </tbody>
      </table>
    `}
    <div class="modal-actions"><button data-action="close">Close</button></div>
  `);
  modal.addEventListener("click", (e) => { if (e.target.dataset.action === "close") closeModal(); });
}
