import { store } from "../store.js";
import { formatMoney, formatDate, escapeHtml } from "../utils.js";
import { qs, toast, openModal, closeModal, onAction } from "../ui.js";

let unsubscribe = null;

export function renderEvents(container) {
  if (unsubscribe) unsubscribe();
  container.innerHTML = `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <h2 style="margin:0">Events &amp; shows</h2>
        <button class="primary" data-action="add-event">+ Add event</button>
      </div>
      <p class="text-dim">Every sale is tagged with the event selected on the POS screen, so you can see how each show performed.</p>
      <div id="event-table"></div>
    </div>
  `;

  function draw() {
    const events = store.events.list();
    const table = qs("#event-table", container);
    if (events.length === 0) { table.innerHTML = `<div class="empty-state">No events yet.</div>`; return; }
    table.innerHTML = `
      <table>
        <thead><tr><th>Event</th><th>Dates</th><th>Sales</th><th>Revenue</th><th></th></tr></thead>
        <tbody>
          ${events.map((ev) => {
            const sales = store.sales.forEvent(ev.id);
            const revenue = sales.reduce((sum, s) => sum + s.total, 0);
            return `
            <tr>
              <td>${escapeHtml(ev.name)}${ev.location ? `<div class="text-dim" style="font-size:12px">${escapeHtml(ev.location)}</div>` : ""}</td>
              <td class="text-dim">${ev.startDate ? formatDate(ev.startDate) : ""}${ev.endDate ? " – " + formatDate(ev.endDate) : ""}</td>
              <td>${sales.length}</td>
              <td>${formatMoney(revenue)}</td>
              <td style="text-align:right"><button class="ghost" data-action="edit-event" data-id="${ev.id}">Edit</button></td>
            </tr>
          `; }).join("")}
        </tbody>
      </table>
    `;
  }

  onAction(container, {
    "add-event": () => openEventModal(),
    "edit-event": (btn) => openEventModal(store.events.get(btn.dataset.id)),
  });
  unsubscribe = store.events.onChange(draw);
}

function openEventModal(existing) {
  const isEdit = !!existing;
  const modal = openModal(`
    <h2>${isEdit ? "Edit event" : "Add event"}</h2>
    <div class="field"><label>Name</label><input id="f-name" value="${escapeHtml(existing?.name || "")}" placeholder="e.g. Brisbane Comic Con 2026" /></div>
    <div class="field"><label>Location</label><input id="f-location" value="${escapeHtml(existing?.location || "")}" /></div>
    <div class="row">
      <div class="field"><label>Start date</label><input id="f-start" type="date" value="${existing?.startDate ? existing.startDate.slice(0, 10) : ""}" /></div>
      <div class="field"><label>End date</label><input id="f-end" type="date" value="${existing?.endDate ? existing.endDate.slice(0, 10) : ""}" /></div>
    </div>
    <div class="field"><label>Notes</label><textarea id="f-notes" rows="2">${escapeHtml(existing?.notes || "")}</textarea></div>
    <div class="modal-actions">
      <button data-action="cancel">Cancel</button>
      <button class="primary" data-action="save">${isEdit ? "Save changes" : "Add event"}</button>
    </div>
  `);
  modal.addEventListener("click", async (e) => {
    const action = e.target.dataset.action;
    if (action === "cancel") closeModal();
    if (action === "save") {
      const name = qs("#f-name", modal).value.trim();
      if (!name) { toast("Enter an event name", "error"); return; }
      const data = {
        name,
        location: qs("#f-location", modal).value.trim(),
        startDate: qs("#f-start", modal).value || null,
        endDate: qs("#f-end", modal).value || null,
        notes: qs("#f-notes", modal).value.trim(),
      };
      if (isEdit) await store.events.update(existing.id, data);
      else await store.events.add(data);
      toast(isEdit ? "Event updated" : "Event added", "success");
      closeModal();
    }
  });
}
