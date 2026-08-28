import { store } from "../store.js";
import { APP_MODE, APP_NAME } from "../config.js";
import { escapeHtml, formatDate } from "../utils.js";
import { qs, toast, openModal, closeModal, onAction } from "../ui.js";

let unsubscribe = null;

export function renderSettings(container, { currentUser }) {
  if (unsubscribe) unsubscribe();
  const isOwner = currentUser?.role === "owner";

  container.innerHTML = `
    <div class="card">
      <h2 style="margin-top:0">Your account</h2>
      <p><strong>${escapeHtml(currentUser?.name || "")}</strong><br/>
      <span class="text-dim">${escapeHtml(currentUser?.email || "")} · ${escapeHtml(currentUser?.role || "")}</span></p>
    </div>

    ${isOwner ? `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <h2 style="margin:0">Staff accounts</h2>
        <button class="primary" data-action="add-staff" ${APP_MODE === "demo" ? "" : ""}>+ Add staff</button>
      </div>
      ${APP_MODE === "demo"
        ? `<p class="text-dim">In demo mode, staff accounts are just labels — there's no real password check. Switch to live (Firebase) mode for real staff logins with restricted permissions.</p>`
        : `<p class="text-dim">Staff accounts can use the POS and inventory but won't see cost prices or this settings page. Give them the temporary password below and have them sign in once — they can then keep using it (there's no in-app "change password" yet; use "Forgot password" on Firebase's hosted reset page if needed).</p>`}
      <div id="staff-table"></div>
    </div>` : `
    <div class="card"><p class="text-dim">Staff accounts are managed by the shop owner.</p></div>`}

    <div class="card">
      <h2 style="margin-top:0">About</h2>
      <p class="text-dim">${APP_NAME} POS &middot; running in <strong>${APP_MODE}</strong> mode.</p>
    </div>
  `;

  if (isOwner) {
    const table = qs("#staff-table", container);
    function draw() {
      const users = store.users.list();
      if (!users || users.length === 0) { table.innerHTML = `<div class="empty-state">No staff added yet.</div>`; return; }
      table.innerHTML = `
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Added</th></tr></thead>
          <tbody>
            ${users.map((u) => `<tr><td>${escapeHtml(u.name)}</td><td class="text-dim">${escapeHtml(u.email)}</td><td><span class="pill">${escapeHtml(u.role)}</span></td><td class="text-dim">${formatDate(u.createdAt)}</td></tr>`).join("")}
          </tbody>
        </table>
      `;
    }
    unsubscribe = store.users.onChange ? store.users.onChange(draw) : (draw(), null);

    onAction(container, { "add-staff": () => openAddStaffModal() });
  }
}

function openAddStaffModal() {
  const modal = openModal(`
    <h2>Add staff account</h2>
    <div class="field"><label>Name</label><input id="f-name" /></div>
    <div class="field"><label>Email</label><input id="f-email" type="email" /></div>
    <div class="field"><label>Role</label>
      <select id="f-role">
        <option value="staff">Staff (no costs / settings)</option>
        <option value="owner">Owner (full access)</option>
      </select>
    </div>
    ${APP_MODE === "firebase" ? `<div class="field"><label>Temporary password</label><input id="f-password" type="text" placeholder="They should change this after first login" /></div>` : ""}
    <div class="modal-actions">
      <button data-action="cancel">Cancel</button>
      <button class="primary" data-action="save">Add staff</button>
    </div>
  `);
  modal.addEventListener("click", async (e) => {
    const action = e.target.dataset.action;
    if (action === "cancel") closeModal();
    if (action === "save") {
      const name = qs("#f-name", modal).value.trim();
      const email = qs("#f-email", modal).value.trim();
      if (!name || !email) { toast("Name and email are required", "error"); return; }
      const role = qs("#f-role", modal).value;
      try {
        if (APP_MODE === "firebase") {
          const tempPassword = qs("#f-password", modal).value;
          if (!tempPassword || tempPassword.length < 6) { toast("Temporary password needs 6+ characters", "error"); return; }
          await store.users.add({ name, email, role, tempPassword });
        } else {
          await store.users.add({ name, email, role });
        }
        toast("Staff account added", "success");
        closeModal();
      } catch (err) {
        toast("Couldn't add staff: " + err.message, "error");
      }
    }
  });
}
