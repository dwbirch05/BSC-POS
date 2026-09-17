// ---------------------------------------------------------------------------
// Home screen: the icon-tile launcher shown right after login. Replaces POS
// as the landing screen -- POS is just one tile among several here. Reporting
// is deliberately NOT in the shared top nav (see app.js) -- it only lives as
// a tile here, so which roles can even reach it is entirely controlled by
// which tiles this screen renders (see the `roles` note on each tile below,
// used once the admin/manager/staff role model exists).
// ---------------------------------------------------------------------------
import { qs } from "../ui.js";
import { isCardAiAllowed } from "../config.js";

const TILES = [
  { routeId: "pos", label: "POS", icon: "🛒" },
  { routeId: "inventory-search", label: "Inventory", icon: "📦" },
  { routeId: "customers", label: "Customers", icon: "👥" },
  { routeId: "events", label: "Events", icon: "🎪" },
  { routeId: "reporting-sales", label: "Reporting", icon: "📊" },
  { routeId: "settings", label: "Settings", icon: "⚙️" },
];

// Card Intake is restricted to specific accounts (CARD_AI_ALLOWED_EMAILS in
// config.js) -- rather than a `roles` list like the comment above mentions
// for the future role model, it's gated by that allowlist for now, so the
// tile itself only appears for allowed accounts (same "hidden unless
// reachable" pattern already used for the Reporting tile/route).
export function renderHome(container, { navigate, currentUser } = {}) {
  const tiles = isCardAiAllowed(currentUser)
    ? [...TILES, { routeId: "card-intake", label: "Card Intake", icon: "🃏" }]
    : TILES;

  container.innerHTML = `
    <div class="card">
      <h2 style="margin-top:0">Big Screen Collectables</h2>
      <p class="text-dim" style="margin-top:-6px">Pick where you'd like to go.</p>
      <div class="home-grid">
        ${tiles.map((t) => `
          <button type="button" class="home-tile" data-home-tile="${t.routeId}">
            <span class="icon">${t.icon}</span>
            <span>${t.label}</span>
          </button>
        `).join("")}
      </div>
    </div>
  `;

  qs(".home-grid", container).addEventListener("click", (e) => {
    const btn = e.target.closest("[data-home-tile]");
    if (btn && navigate) navigate(btn.dataset.homeTile);
  });
}
