import { store } from "./store.js";
import { APP_MODE, APP_NAME } from "./config.js";
import { qs, qsa, toast } from "./ui.js";
import { markCheckedIn } from "./checkin.js";
import { renderLogin } from "./views/login.js";
import { renderHome } from "./views/home.js";
import { renderPos } from "./views/pos.js";
import { renderInventory } from "./views/inventory.js";
import { renderImportStock } from "./views/import-stock.js";
import { renderImportHistory } from "./views/import-history.js";
import { renderImportProducts } from "./views/import-products.js";
import { renderCustomers } from "./views/customers.js";
import { renderEvents } from "./views/events.js";
import { renderSales } from "./views/sales.js";
import { renderProductHistory } from "./views/product-history.js";
import { renderSettings } from "./views/settings.js";

// Each top-level nav entry either renders directly, or has `children` and
// becomes a dropdown menu (Inventory) — click the parent to open the menu,
// click a child to actually navigate. Entries marked `hidden: true` are
// still fully routable (navigate()/findRoute() work normally) but don't
// render as a button in the shared tab bar -- used for Home (it's reached
// via the dedicated Home button instead, see shellTemplate) and Reporting
// (deliberately NOT in the shared nav so it can only be reached from the
// Home screen's tiles -- see js/views/home.js and the "all-in-one business
// app" roadmap notes: this is what makes it straightforward to hide the
// Reporting tile for a given role later without also having to touch the
// shared nav bar).
const NAV = [
  {
    id: "home", label: "Home", hidden: true,
    render: (main) => renderHome(main, { navigate }),
  },
  {
    id: "pos", label: "POS",
    render: (main) => renderPos(main, { goToInventory: (barcode) => navigate("inventory-search", { prefillBarcode: barcode }) }),
  },
  {
    id: "inventory", label: "Inventory",
    children: [
      { id: "inventory-search", label: "Search Inventory", render: (main, opts) => renderInventory(main, opts) },
      { id: "inventory-import-products", label: "Import Products (CSV)", render: (main) => renderImportProducts(main) },
      { id: "inventory-import", label: "Import Stock", render: (main) => renderImportStock(main) },
      { id: "inventory-import-history", label: "Import History", render: (main) => renderImportHistory(main) },
    ],
  },
  { id: "customers", label: "Customers", render: (main) => renderCustomers(main) },
  { id: "events", label: "Events", render: (main) => renderEvents(main) },
  {
    id: "reporting-sales", label: "Sales History", hidden: true,
    render: (main) => renderSales(main, { navigate }),
  },
  {
    id: "reporting-products", label: "Product History", hidden: true,
    render: (main) => renderProductHistory(main, { navigate }),
  },
  { id: "settings", label: "Settings", render: (main) => renderSettings(main, { currentUser }) },
];

const app = qs("#app");
let currentRoute = "home";
let currentUser = null;
let openDropdownId = null;

function findRoute(routeId) {
  for (const item of NAV) {
    if (item.id === routeId) return item;
    if (item.children) {
      const child = item.children.find((c) => c.id === routeId);
      if (child) return child;
    }
  }
  return null;
}

function topLevelIdFor(routeId) {
  for (const item of NAV) {
    if (item.id === routeId) return item.id;
    if (item.children?.some((c) => c.id === routeId)) return item.id;
  }
  return null;
}

function shellTemplate() {
  return `
    <header class="topbar">
      <div class="brand"><span class="dot"></span> ${APP_NAME} <span class="badge-mode ${APP_MODE}">${APP_MODE}</span></div>
      <div style="display:flex; align-items:center; gap:10px;">
        <button class="ghost" id="home-btn" title="Home">⌂ Home</button>
        <span id="online-pill" class="status-pill online"><span class="dot"></span> Online</span>
        <span class="text-dim" style="font-size:13px">${currentUser?.name || ""}</span>
        <button class="ghost" id="logout-btn">Log out</button>
      </div>
    </header>
    <nav class="tabs" id="tabs">
      ${NAV.filter((item) => !item.hidden).map((item) => navItemHtml(item)).join("")}
    </nav>
    <main id="main"></main>
  `;
}

function navItemHtml(item) {
  const active = topLevelIdFor(currentRoute) === item.id;
  if (!item.children) {
    return `<button data-nav="${item.id}" class="${active ? "active" : ""}">${item.label}</button>`;
  }
  const open = openDropdownId === item.id;
  return `
    <div class="nav-dropdown">
      <button data-nav-toggle="${item.id}" class="${active ? "active" : ""}">${item.label} <span class="caret">▾</span></button>
      <div class="nav-dropdown-menu" ${open ? "" : "hidden"}>
        ${item.children.map((c) => `<button data-nav="${c.id}" class="${currentRoute === c.id ? "active" : ""}">${c.label}</button>`).join("")}
      </div>
    </div>
  `;
}

function navigate(routeId, opts = {}) {
  const route = findRoute(routeId);
  if (!route) return;
  currentRoute = routeId;
  openDropdownId = null;
  renderNav();
  route.render(qs("#main", app), opts);
}

function renderNav() {
  const nav = qs("#tabs", app);
  if (!nav) return;
  nav.innerHTML = NAV.filter((item) => !item.hidden).map((item) => navItemHtml(item)).join("");
}

function renderShell() {
  app.innerHTML = shellTemplate();
  qs("#tabs", app).addEventListener("click", (e) => {
    const navBtn = e.target.closest("[data-nav]");
    const toggleBtn = e.target.closest("[data-nav-toggle]");
    if (navBtn) {
      navigate(navBtn.dataset.nav);
      return;
    }
    if (toggleBtn) {
      openDropdownId = openDropdownId === toggleBtn.dataset.navToggle ? null : toggleBtn.dataset.navToggle;
      renderNav();
    }
  });
  document.addEventListener("click", (e) => {
    if (openDropdownId && !e.target.closest(".nav-dropdown")) {
      openDropdownId = null;
      renderNav();
    }
  });
  qs("#logout-btn", app).addEventListener("click", async () => {
    await store.auth.logout();
  });
  qs("#home-btn", app).addEventListener("click", () => navigate("home"));
  updateOnlineStatus();
  navigate(currentRoute);
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
      markCheckedIn(user.id); // signing in for real always counts as today's check-in
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
