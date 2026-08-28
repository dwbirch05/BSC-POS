import { store } from "./store.js";
import { APP_MODE, APP_NAME } from "./config.js";
import { qs, qsa, toast } from "./ui.js";
import { renderLogin } from "./views/login.js";
import { renderPos } from "./views/pos.js";
import { renderInventory } from "./views/inventory.js";
import { renderCustomers } from "./views/customers.js";
import { renderEvents } from "./views/events.js";
import { renderSales } from "./views/sales.js";
import { renderSettings } from "./views/settings.js";

const TABS = [
  { id: "pos", label: "POS", render: (main) => renderPos(main, { goToInventory: (barcode) => navigate("inventory", { prefillBarcode: barcode }) }) },
  { id: "inventory", label: "Inventory", render: (main, opts) => renderInventory(main, opts) },
  { id: "customers", label: "Customers", render: (main) => renderCustomers(main) },
  { id: "events", label: "Events", render: (main) => renderEvents(main) },
  { id: "sales", label: "Sales", render: (main) => renderSales(main) },
  { id: "settings", label: "Settings", render: (main) => renderSettings(main, { currentUser }) },
];

const app = qs("#app");
let currentTab = "pos";
let currentUser = null;

function shellTemplate() {
  return `
    <header class="topbar">
      <div class="brand"><span class="dot"></span> ${APP_NAME} <span class="badge-mode ${APP_MODE}">${APP_MODE}</span></div>
      <div style="display:flex; align-items:center; gap:10px;">
        <span id="online-pill" class="status-pill online"><span class="dot"></span> Online</span>
        <span class="text-dim" style="font-size:13px">${currentUser?.name || ""}</span>
        <button class="ghost" id="logout-btn">Log out</button>
      </div>
    </header>
    <nav class="tabs" id="tabs">
      ${TABS.map((t) => `<button data-tab="${t.id}" class="${t.id === currentTab ? "active" : ""}">${t.label}</button>`).join("")}
    </nav>
    <main id="main"></main>
  `;
}

function navigate(tabId, opts = {}) {
  currentTab = tabId;
  qsa("#tabs button", app).forEach((b) => b.classList.toggle("active", b.dataset.tab === tabId));
  const tab = TABS.find((t) => t.id === tabId);
  tab.render(qs("#main", app), opts);
}

function renderShell() {
  app.innerHTML = shellTemplate();
  qs("#tabs", app).addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tab]");
    if (btn) navigate(btn.dataset.tab);
  });
  qs("#logout-btn", app).addEventListener("click", async () => {
    await store.auth.logout();
  });
  updateOnlineStatus();
  navigate(currentTab);
}

function updateOnlineStatus() {
  const pill = qs("#online-pill", app);
  if (!pill) return;
  const online = navigator.onLine;
  pill.classList.toggle("online", online);
  pill.classList.toggle("offline", !online);
  pill.innerHTML = online
    ? `<span class="dot"></span> Online`
    : `<span class="dot"></span> Offline — sales are saved on this device and will sync when you're back online`;
}
window.addEventListener("online", updateOnlineStatus);
window.addEventListener("offline", updateOnlineStatus);

function boot() {
  store.auth.onAuthChange((user) => {
    currentUser = user;
    if (user) {
      renderShell();
    } else {
      app.innerHTML = "";
      renderLogin(app, () => {}); // onAuthChange fires again once login resolves
    }
  });
}

boot();

// Register the service worker for offline/PWA support (best-effort).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => console.warn("SW registration failed:", err));
  });
}
