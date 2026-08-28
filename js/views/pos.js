import { store } from "../store.js";
import { formatMoney, parseMoneyToCents, escapeHtml, debounce, resolveActiveEvent } from "../utils.js";
import { qs, qsa, toast, openModal, closeModal, onAction } from "../ui.js";
import { renderReceiptHtml, printReceipt, emailReceipt } from "../receipt.js";
import { getCheckedInToday, markCheckedIn } from "../checkin.js";
import { DEFAULT_EVENT_NAME } from "../config.js";

let cart = []; // [{itemId, name, priceAtSale, qty, barcode}]
let selectedCustomer = null; // {id, name, email} | null
let paymentMethod = null;
let actingStaffId = null; // who's actually serving this sale (may differ from the signed-in account)
let unsubscribers = [];

export function renderPos(container, { goToInventory } = {}) {
  cleanup();
  actingStaffId = store.auth.currentUser()?.id || null;
  container.innerHTML = posTemplate();
  wireUp(container, { goToInventory });
  const offEvents = store.events.onChange(() => refreshCurrentEvent(container));
  const offItems = store.items.onChange(() => {}); // keep cache warm for lookups
  const offUsers = store.users.onChange ? store.users.onChange(() => renderServingSelect(container)) : null;
  unsubscribers = [offEvents, offItems, offUsers];
}

/** The event this sale will be tagged to — no picker, resolved from who's
 * signed in and today's date (see utils.js#resolveActiveEvent). Set up the
 * mapping in the Events tab. */
function getCurrentEvent() {
  return resolveActiveEvent(store.events.list(), store.auth.currentUser(), DEFAULT_EVENT_NAME);
}

function cleanup() {
  unsubscribers.forEach((fn) => fn && fn());
  unsubscribers = [];
}

function posTemplate() {
  return `
    <div class="pos-stack">
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
          <select id="serving-select" class="select-compact"></select>
          <div style="display:flex; align-items:center; gap:8px; white-space:nowrap;">
            <span class="text-dim" style="font-size:13px">Selling at</span>
            <span class="pill" id="current-event-pill">&nbsp;</span>
          </div>
        </div>
      </div>

      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
          <h3 style="margin:0">Customer</h3>
          <div id="customer-block"></div>
        </div>
      </div>

      <div class="card scan-box">
        <label>Scan or type a barcode / SKU, then press Enter</label>
        <input id="barcode-input" type="text" placeholder="Scan here..." autocomplete="off" autofocus />
        <button class="ghost" id="camera-scan-btn" title="Scan with camera" style="margin-top:10px">📷 Camera scan</button>
      </div>

      <div class="card">
        <h3 style="margin:0 0 10px">Cart</h3>
        <div id="cart-list"></div>
        <div class="subtotal-row"><span>Total</span><span id="subtotal">${formatMoney(0)}</span></div>
      </div>

      <div class="card">
        <h3>Payment method</h3>
        <div class="pay-methods" id="pay-methods">
          ${["Cash", "Card", "Other"].map((m) => `<button data-action="set-payment" data-method="${m}">${m}</button>`).join("")}
        </div>
        <button class="primary" id="complete-sale-btn" style="width:100%; font-size:16px; padding:14px;">Complete Sale</button>
      </div>
    </div>
  `;
}

function wireUp(container, { goToInventory }) {
  const barcodeInput = qs("#barcode-input", container);
  barcodeInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const code = barcodeInput.value.trim();
    barcodeInput.value = "";
    if (!code) return;
    handleScan(code, container, goToInventory);
  });

  qs("#camera-scan-btn", container).addEventListener("click", () => cameraScan(container, goToInventory));

  refreshCurrentEvent(container);
  renderCustomerBlock(container);
  renderServingSelect(container);

  qs("#serving-select", container).addEventListener("change", (e) => {
    if (e.target.value === "__other__") {
      openCheckInModal(container, (newId) => {
        actingStaffId = newId;
        renderServingSelect(container);
      });
      renderServingSelect(container); // snap the select back until check-in actually succeeds
      return;
    }
    actingStaffId = e.target.value;
  });

  onAction(container, {
    "set-payment": (btn) => {
      paymentMethod = btn.dataset.method;
      qsa("#pay-methods button", container).forEach((b) => b.classList.toggle("selected", b === btn));
    },
    "inc-qty": (btn) => changeQty(container, btn.dataset.id, 1),
    "dec-qty": (btn) => changeQty(container, btn.dataset.id, -1),
    "remove-line": (btn) => removeLine(container, btn.dataset.id),
    "pick-customer": () => openCustomerPicker(container),
    "clear-customer": () => { selectedCustomer = null; renderCustomerBlock(container); },
  });

  container.addEventListener("change", (e) => {
    if (e.target.matches("input.price")) {
      const line = cart.find((l) => l.itemId === e.target.dataset.id);
      if (line) { line.priceAtSale = parseMoneyToCents(e.target.value); renderCart(container); }
    }
  });

  qs("#complete-sale-btn", container).addEventListener("click", () => completeSale(container));

  renderCart(container);
  barcodeInput.focus();
}

/** Who can be picked as "serving" — anyone verified on this device today,
 * always including the person actually signed in. Picking "+ Check in
 * someone else…" opens the verification modal instead of selecting it. */
function renderServingSelect(container) {
  const select = qs("#serving-select", container);
  if (!select) return;
  const users = store.users.list() || [];
  const checkedIds = new Set(getCheckedInToday());
  const me = store.auth.currentUser();
  if (me) checkedIds.add(me.id);

  const available = users.filter((u) => checkedIds.has(u.id));
  if (me && !available.find((u) => u.id === me.id)) {
    available.unshift({ id: me.id, name: me.name || me.email || "You" });
  }

  if (!actingStaffId || !available.find((u) => u.id === actingStaffId)) {
    actingStaffId = me?.id || available[0]?.id || null;
  }

  select.innerHTML = `
    ${available.map((u) => `<option value="${u.id}" ${u.id === actingStaffId ? "selected" : ""}>${escapeHtml(u.name)}</option>`).join("")}
    <option value="__other__">+ Check in someone else…</option>
  `;
}

/** Verify a staff member so they show up in the "serving" switcher for the
 * rest of today on this device. Demo mode just confirms who they are; live
 * (Firebase) mode requires their real password. */
function openCheckInModal(container, onCheckedIn) {
  const users = store.users.list() || [];
  const checkedIds = new Set(getCheckedInToday());
  const me = store.auth.currentUser();
  if (me) checkedIds.add(me.id);
  const candidates = users.filter((u) => !checkedIds.has(u.id));

  if (candidates.length === 0) {
    toast("Everyone with a staff account is already checked in today.", "info");
    return;
  }

  const modal = openModal(`
    <h2>Check in someone else</h2>
    <p class="text-dim">They need to verify themselves once per day on this device before they can be picked as who's serving.</p>
    <div class="field">
      <label>Staff member</label>
      <select id="ci-user">${candidates.map((u) => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join("")}</select>
    </div>
    ${store.mode === "firebase"
      ? `<div class="field"><label>Their password</label><input id="ci-password" type="password" autocomplete="off" /></div>`
      : `<p class="text-dim">Demo mode: no password needed to try this out.</p>`}
    <div class="modal-actions">
      <button data-action="cancel">Cancel</button>
      <button class="primary" data-action="confirm">Check in</button>
    </div>
  `);

  modal.addEventListener("click", async (e) => {
    const action = e.target.dataset.action;
    if (action === "cancel") closeModal();
    if (action === "confirm") {
      const uid = qs("#ci-user", modal).value;
      const candidate = candidates.find((u) => u.id === uid);
      if (!candidate) return;
      const password = store.mode === "firebase" ? qs("#ci-password", modal).value : undefined;
      if (store.mode === "firebase" && !password) { toast("Enter their password", "error"); return; }

      const btn = qs("[data-action='confirm']", modal);
      btn.disabled = true;
      try {
        const verified = await store.auth.checkInOther(candidate.email, password);
        markCheckedIn(verified.id);
        toast(`${verified.name} checked in`, "success");
        closeModal();
        onCheckedIn(verified.id);
      } catch (err) {
        toast("Couldn't check in: " + err.message, "error");
        btn.disabled = false;
      }
    }
  });
}

function handleScan(code, container, goToInventory) {
  const item = store.items.findByBarcode(code);
  if (!item) {
    const modal = openModal(`
      <h2>Barcode not found</h2>
      <p>No inventory item has barcode <strong class="mono">${escapeHtml(code)}</strong>.</p>
      <div class="modal-actions">
        <button data-action="close">Cancel</button>
        <button class="primary" data-action="add-to-inventory">Add it to inventory</button>
      </div>
    `);
    modal.addEventListener("click", (e) => {
      const action = e.target.dataset.action;
      if (action === "close") closeModal();
      if (action === "add-to-inventory") {
        closeModal();
        goToInventory && goToInventory(code);
      }
    });
    return;
  }
  addToCart(item);
  renderCart(container);
}

function addToCart(item) {
  const existing = cart.find((l) => l.itemId === item.id);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ itemId: item.id, name: item.name, priceAtSale: item.price ?? 0, qty: 1, barcode: item.barcode });
  }
}

function changeQty(container, itemId, delta) {
  const line = cart.find((l) => l.itemId === itemId);
  if (!line) return;
  line.qty += delta;
  if (line.qty <= 0) cart = cart.filter((l) => l.itemId !== itemId);
  renderCart(container);
}

function removeLine(container, itemId) {
  cart = cart.filter((l) => l.itemId !== itemId);
  renderCart(container);
}

function renderCart(container) {
  const list = qs("#cart-list", container);
  if (cart.length === 0) {
    list.innerHTML = `<div class="empty-state">Cart is empty — scan an item to begin.</div>`;
  } else {
    list.innerHTML = cart.map((l) => `
      <div class="cart-item">
        <span class="name">${escapeHtml(l.name)}</span>
        <button class="ghost" data-action="dec-qty" data-id="${l.itemId}">−</button>
        <input class="qty" value="${l.qty}" readonly />
        <button class="ghost" data-action="inc-qty" data-id="${l.itemId}">+</button>
        <input class="price mono" data-id="${l.itemId}" value="${(l.priceAtSale / 100).toFixed(2)}" />
        <button class="ghost" data-action="remove-line" data-id="${l.itemId}" title="Remove">✕</button>
      </div>
    `).join("");
  }
  const subtotal = cart.reduce((sum, l) => sum + l.priceAtSale * l.qty, 0);
  qs("#subtotal", container).textContent = formatMoney(subtotal);
}

function refreshCurrentEvent(container) {
  const pill = qs("#current-event-pill", container);
  if (!pill) return;
  const event = getCurrentEvent();
  pill.textContent = event ? event.name : "No event set up";
  pill.title = event
    ? "Set this up (dates + who's running it) in the Events tab."
    : "Add an event in the Events tab first.";
}

function renderCustomerBlock(container) {
  const block = qs("#customer-block", container);
  if (selectedCustomer) {
    block.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; white-space:nowrap;">
        <span>${escapeHtml(selectedCustomer.name)}</span>
        <button class="ghost" data-action="clear-customer">Change</button>
      </div>
    `;
  } else {
    block.innerHTML = `<button class="ghost" data-action="pick-customer">Add / choose customer</button>`;
  }
}

function openCustomerPicker(container) {
  const modal = openModal(`
    <h2>Choose customer</h2>
    <input id="cust-search" placeholder="Search name, email, phone…" />
    <div id="cust-results" style="max-height:240px; overflow:auto; margin:10px 0"></div>
    <hr style="border-color:var(--border)"/>
    <h3>Or add a new customer</h3>
    <div class="field"><label>Name</label><input id="new-cust-name" /></div>
    <div class="row">
      <div class="field"><label>Email</label><input id="new-cust-email" type="email" /></div>
      <div class="field"><label>Phone</label><input id="new-cust-phone" /></div>
    </div>
    <div class="modal-actions">
      <button data-action="cancel">Cancel</button>
      <button class="primary" data-action="add-new">Add & select</button>
    </div>
  `);

  const renderResults = (query) => {
    const results = query ? store.customers.search(query) : store.customers.list().slice(0, 8);
    qs("#cust-results", modal).innerHTML = results.map((c) => `
      <div class="cart-item" data-action="select-cust" data-id="${c.id}" style="cursor:pointer">
        <span class="name">${escapeHtml(c.name)} <span class="text-dim">${escapeHtml(c.email || c.phone || "")}</span></span>
      </div>
    `).join("") || `<p class="text-dim">No matches</p>`;
  };
  renderResults("");
  qs("#cust-search", modal).addEventListener("input", debounce((e) => renderResults(e.target.value), 150));

  modal.addEventListener("click", async (e) => {
    const row = e.target.closest("[data-action]");
    if (!row) return;
    if (row.dataset.action === "cancel") closeModal();
    if (row.dataset.action === "select-cust") {
      const c = store.customers.get(row.dataset.id);
      selectedCustomer = { id: c.id, name: c.name, email: c.email, phone: c.phone };
      closeModal();
      renderCustomerBlock(container);
    }
    if (row.dataset.action === "add-new") {
      const name = qs("#new-cust-name", modal).value.trim();
      if (!name) { toast("Enter a name", "error"); return; }
      const email = qs("#new-cust-email", modal).value.trim();
      const phone = qs("#new-cust-phone", modal).value.trim();
      const c = await store.customers.add({ name, email, phone, notes: "" });
      selectedCustomer = { id: c.id, name: c.name, email: c.email, phone: c.phone };
      closeModal();
      renderCustomerBlock(container);
    }
  });
}

async function completeSale(container) {
  if (cart.length === 0) { toast("Cart is empty", "error"); return; }
  if (!paymentMethod) { toast("Choose a payment method", "error"); return; }

  const event = getCurrentEvent();
  if (!event) { toast("No event set up yet — add one in the Events tab first", "error"); return; }
  const subtotal = cart.reduce((sum, l) => sum + l.priceAtSale * l.qty, 0);

  const staff = store.users.list().find((u) => u.id === actingStaffId) || store.auth.currentUser();

  const btn = qs("#complete-sale-btn", container);
  btn.disabled = true;
  try {
    const sale = await store.sales.add({
      lineItems: cart.map((l) => ({ itemId: l.itemId, name: l.name, priceAtSale: l.priceAtSale, qty: l.qty })),
      customerId: selectedCustomer?.id || null,
      customerName: selectedCustomer?.name || null,
      customerEmail: selectedCustomer?.email || null,
      eventId: event.id,
      eventName: event.name,
      subtotal,
      total: subtotal,
      paymentMethod,
      staffUserId: actingStaffId || store.auth.currentUser()?.id || null,
      staffName: staff?.name || null,
    });

    // Decrement stock for each line item (best-effort; never blocks the sale).
    for (const l of cart) {
      const item = store.items.get(l.itemId);
      if (item) {
        try {
          await store.items.update(item.id, { quantityOnHand: Math.max(0, (item.quantityOnHand ?? 0) - l.qty) });
        } catch (err) { console.warn("Stock update failed for", item.id, err); }
      }
    }

    showReceiptModal(sale);
    cart = [];
    paymentMethod = null;
    selectedCustomer = null;
    qsa("#pay-methods button", container).forEach((b) => b.classList.remove("selected"));
    renderCart(container);
    renderCustomerBlock(container);
    qs("#barcode-input", container).focus();
  } catch (err) {
    console.error(err);
    toast("Couldn't complete sale: " + err.message, "error");
  } finally {
    btn.disabled = false;
  }
}

function showReceiptModal(sale) {
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

async function cameraScan(container, goToInventory) {
  if (!("BarcodeDetector" in window)) {
    toast("Camera scanning isn't supported in this browser — use a USB scanner or type the code.", "error", 6000);
    return;
  }
  const modal = openModal(`
    <h2>Camera scan</h2>
    <video id="scan-video" style="width:100%; border-radius:8px; background:#000" playsinline></video>
    <div class="modal-actions"><button data-action="close">Cancel</button></div>
  `);
  const video = qs("#scan-video", modal);
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = stream;
    await video.play();
  } catch (err) {
    toast("Couldn't access the camera: " + err.message, "error");
    closeModal();
    return;
  }
  const detector = new window.BarcodeDetector({ formats: ["code_39", "code_128", "ean_13", "upc_a", "upc_e", "qr_code"] });
  let stopped = false;
  const stop = () => { stopped = true; stream.getTracks().forEach((t) => t.stop()); };
  modal.addEventListener("click", (e) => { if (e.target.dataset.action === "close") { stop(); closeModal(); } });

  (async function loop() {
    while (!stopped) {
      try {
        const codes = await detector.detect(video);
        if (codes.length > 0) {
          const value = codes[0].rawValue;
          stop();
          closeModal();
          handleScan(value, container, goToInventory);
          return;
        }
      } catch (err) { /* keep trying */ }
      await new Promise((r) => setTimeout(r, 250));
    }
  })();
}
