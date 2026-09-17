// ---------------------------------------------------------------------------
// "Demo mode" data layer: everything lives in this browser's localStorage.
// No setup, no network, works instantly -- great for trying the app out or
// for a single-device shop that doesn't need multi-device sync. Implements
// the same interface as firebase-store.js so views.js code doesn't care
// which backend is active (see store.js).
// ---------------------------------------------------------------------------
import { uid, nowIso, Emitter, normalizeBarcode } from "./utils.js";
import { DEFAULT_EVENT_NAME } from "./config.js";

const KEYS = {
  items: "bsc_items",
  customers: "bsc_customers",
  events: "bsc_events",
  sales: "bsc_sales",
  imports: "bsc_imports",
  users: "bsc_users",
  session: "bsc_session",
  counters: "bsc_counters",
};

function load(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function ensureSeed() {
  if (!load(KEYS.events)) {
    save(KEYS.events, [
      { id: uid(), name: DEFAULT_EVENT_NAME, location: "", startDate: null, endDate: null, notes: "", createdAt: nowIso() },
    ]);
  }
  if (!load(KEYS.items)) save(KEYS.items, []);
  if (!load(KEYS.customers)) save(KEYS.customers, []);
  if (!load(KEYS.sales)) save(KEYS.sales, []);
  if (!load(KEYS.imports)) save(KEYS.imports, []);
  if (!load(KEYS.counters)) save(KEYS.counters, { nextSku: 1 });
  if (!load(KEYS.users)) {
    save(KEYS.users, [
      { id: uid(), name: "Owner (demo)", email: "demo@bigscreencollectables.local", role: "owner", createdAt: nowIso() },
    ]);
  }
}
ensureSeed();

const emitters = {
  items: new Emitter(),
  customers: new Emitter(),
  events: new Emitter(),
  sales: new Emitter(),
  imports: new Emitter(),
};

function makeCollection(key, emitter) {
  return {
    list() {
      return [...(load(key) || [])].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    },
    get(id) {
      return (load(key) || []).find((x) => x.id === id) || null;
    },
    add(data) {
      const items = load(key) || [];
      const record = { id: uid(), createdAt: nowIso(), ...data };
      items.push(record);
      save(key, items);
      emitter.emit();
      return record;
    },
    update(id, patch) {
      const items = load(key) || [];
      const idx = items.findIndex((x) => x.id === id);
      if (idx === -1) throw new Error("Not found: " + id);
      items[idx] = { ...items[idx], ...patch, updatedAt: nowIso() };
      save(key, items);
      emitter.emit();
      return items[idx];
    },
    remove(id) {
      const items = (load(key) || []).filter((x) => x.id !== id);
      save(key, items);
      emitter.emit();
    },
    onChange(fn) {
      fn(); // fire once immediately, like a firestore snapshot listener
      return emitter.subscribe(fn);
    },
  };
}

// Condition-specific visual-detail phrasing for the demo mock, so the
// canned descriptions actually read differently depending on which
// condition the "staff" picked on the pairing-confirm screen -- mirroring
// what the real prompt asks the model to do with a given condition.
const CONDITION_DETAIL = {
  Mint: "Centering looks dead-on front and back, corners are sharp with no whitening, edges are clean, and the surface is flawless under a close look -- no scuffing, print lines, or scratches.",
  "Near Mint": "Centering is strong, corners are sharp with only the faintest hint of wear under close inspection, edges are clean, and the surface is bright with no visible scratches or print defects.",
  Excellent: "Centering is solid, corners show light wear with just a touch of softness, edges are mostly clean with maybe a hair of wear, and the surface still has good gloss with nothing major to note.",
  Good: "Centering is reasonable, corners show noticeable wear and some rounding, edges have visible wear along a few sides, and the surface has light scuffing but no major damage.",
  Fair: "Centering is off to one side, corners are rounded with visible whitening, edges show real wear, and the surface has scratching or scuffing that's easy to spot at a glance.",
  Poor: "Centering is noticeably off, corners are heavily rounded and worn, edges are rough in places, and the surface shows clear scratching, creasing, or other damage.",
};

function buildMockCopy(pick, condition) {
  const detail = CONDITION_DETAIL[condition] || CONDITION_DETAIL["Near Mint"];
  const parallelBit = pick.parallel && pick.parallel !== "Base" ? ` ${pick.parallel}` : "";
  // A few of the mock setNames already start with the year (e.g. "2021
  // Prizm") -- don't repeat it in that case.
  const setBit = pick.setName.startsWith(pick.year) ? pick.setName : `${pick.year} ${pick.setName}`;

  const title = `${setBit}${parallelBit} ${pick.player} #${pick.cardNumber} -- ${condition} (Raw/Ungraded)`.slice(0, 80);

  const description =
    `This is a ${setBit}${parallelBit} card featuring ${pick.player}, card number ${pick.cardNumber}. ` +
    `Graded here as ${condition}: ${detail} ` +
    `This card is raw and ungraded, sold exactly as photographed front and back so you can judge it for yourself. ` +
    `${pick.parallel && pick.parallel !== "Base" ? `The ${pick.parallel} parallel adds a nice bit of extra shelf appeal for ${pick.player} collectors. ` : ""}` +
    `A solid pickup for any ${pick.sport} collection or set build looking for this player and season.`;

  return { title, description };
}

export const localStore = {
  mode: "demo",

  items: {
    ...makeCollection(KEYS.items, emitters.items),
    findByBarcode(code) {
      const target = normalizeBarcode(code);
      if (!target) return null;
      return (load(KEYS.items) || []).find((x) => normalizeBarcode(x.barcode) === target) || null;
    },
    search(query) {
      const q = query.trim().toLowerCase();
      if (!q) return this.list();
      return this.list().filter((it) =>
        [it.name, it.barcode, it.category, it.description].filter(Boolean).some((f) => f.toLowerCase().includes(q))
      );
    },
    nextSkuNumber() {
      const c = load(KEYS.counters) || { nextSku: 1 };
      const n = c.nextSku;
      save(KEYS.counters, { ...c, nextSku: n + 1 });
      return n;
    },
    // Demo mode: no real file storage, so the resized data URL *is* the
    // stored image -- just hand it straight back so item.images can hold it.
    async uploadImage(dataUrl) {
      return dataUrl;
    },
    async deleteImage() {
      // nothing to clean up in demo mode
    },
  },

  customers: {
    ...makeCollection(KEYS.customers, emitters.customers),
    search(query) {
      const q = query.trim().toLowerCase();
      if (!q) return this.list();
      return this.list().filter((c) =>
        [c.name, c.email, c.phone].filter(Boolean).some((f) => f.toLowerCase().includes(q))
      );
    },
  },

  events: {
    ...makeCollection(KEYS.events, emitters.events),
  },

  sales: {
    ...makeCollection(KEYS.sales, emitters.sales),
    forEvent(eventId) {
      return this.list().filter((s) => s.eventId === eventId);
    },
    forCustomer(customerId) {
      return this.list().filter((s) => s.customerId === customerId);
    },
  },

  imports: {
    ...makeCollection(KEYS.imports, emitters.imports),
  },

  users: {
    ...makeCollection(KEYS.users, new Emitter()),
  },

  // Card Intake (AI card reading): demo mode has no real AI call, so this
  // hands back believable fake results after a short simulated delay --
  // enough to fully click through pairing, review and CSV export with zero
  // setup. Real card identification happens in firebase-store.js via a
  // Cloud Function once Darryl deploys one (see CARD_AI_SETUP.md).
  //
  // Condition is supplied by the caller (staff picked it on the
  // pairing-confirm screen), not invented here -- see the note at the top
  // of js/views/card-intake.js. The title/description are built to match
  // whatever condition was given, the same way the real prompt does.
  cardAI: {
    async identifyCard({ frontDataUrl, backDataUrl, condition } = {}) {
      await new Promise((resolve) => setTimeout(resolve, 400 + Math.random() * 700));

      const pool = [
        { sport: "Basketball", player: "Marcus Reid", setName: "2023 Hoops Prime", year: "2023", cardNumber: "PR-14", parallel: "Base", category: "Trading Cards - Sports" },
        { sport: "Baseball", player: "Tony Alvarez", setName: "2022 Topps Chrome", year: "2022", cardNumber: "112", parallel: "Refractor", category: "Trading Cards - Sports" },
        { sport: "Pokemon TCG", player: "Charhound ex", setName: "Scarlet Blaze", year: "2024", cardNumber: "034/198", parallel: "Holo Rare", category: "Trading Cards - TCG" },
        { sport: "Football", player: "Devon Ashe", setName: "2021 Prizm", year: "2021", cardNumber: "228", parallel: "Silver Prizm", category: "Trading Cards - Sports" },
        { sport: "Magic: The Gathering", player: "Shivan Hydra", setName: "Dominion Reprint", year: "2020", cardNumber: "142", parallel: "Foil", category: "Trading Cards - TCG" },
        { sport: "Basketball", player: "Elena Voss", setName: "2020 Select", year: "2020", cardNumber: "77", parallel: "Concourse", category: "Trading Cards - Sports" },
      ];

      const pick = pool[Math.floor(Math.random() * pool.length)];
      const flagged = Math.random() < 0.2;
      const usedCondition = condition || "Near Mint"; // fallback only if somehow called without one

      return {
        confident: !flagged,
        reason: flagged
          ? "Demo data: glare/angle made a couple of details hard to confirm -- please double-check before accepting."
          : "",
        ...pick,
        ...buildMockCopy(pick, usedCondition),
      };
    },
  },

  auth: {
    _emitter: new Emitter(),
    // Demo mode: no real password check, just a friendly local "login" so
    // the rest of the app can behave the same way it will in firebase mode.
    async login(email) {
      const users = load(KEYS.users) || [];
      let user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
      if (!user) {
        user = { id: uid(), name: email.split("@")[0], email, role: "owner", createdAt: nowIso() };
        users.push(user);
        save(KEYS.users, users);
      }
      save(KEYS.session, user);
      this._emitter.emit(user);
      return user;
    },
    async logout() {
      localStorage.removeItem(KEYS.session);
      this._emitter.emit(null);
    },
    currentUser() {
      return load(KEYS.session);
    },
    onAuthChange(fn) {
      fn(this.currentUser());
      return this._emitter.subscribe(fn);
    },
    // Demo mode: no real password to check, so this just looks the person
    // up by email so the "who's serving" switcher works the same way it
    // will in firebase mode (where the password is genuinely verified).
    async checkInOther(email) {
      const users = load(KEYS.users) || [];
      const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
      if (!user) throw new Error("No staff account found with that email.");
      return user;
    },
  },
};
