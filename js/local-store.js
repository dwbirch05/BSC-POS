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
  cardAI: {
    async identifyCard({ frontDataUrl, backDataUrl } = {}) {
      await new Promise((resolve) => setTimeout(resolve, 400 + Math.random() * 700));

      const pool = [
        {
          sport: "Basketball", player: "Marcus Reid", setName: "2023 Hoops Prime", year: "2023",
          cardNumber: "PR-14", parallel: "Base", condition: "Near Mint",
          title: "2023 Hoops Prime Marcus Reid #PR-14 Basketball Card NM",
          description: "2023 Hoops Prime #PR-14 Marcus Reid, base parallel. This one's raw (ungraded) and grades out close to Near Mint in hand -- centering is close to 55/45 front and back, corners are sharp with no visible whitening, and the surface is clean with no scratches or print lines. Edges show only the faintest touch of wear consistent with careful handling, nothing that jumps out. A clean, well-kept copy of Reid's Prime base card that would slot straight into a set build or display without needing an upgrade.",
          category: "Trading Cards - Sports",
        },
        {
          sport: "Baseball", player: "Tony Alvarez", setName: "2022 Topps Chrome", year: "2022",
          cardNumber: "112", parallel: "Refractor", condition: "Mint",
          title: "2022 Topps Chrome Tony Alvarez #112 Refractor Baseball Mint",
          description: "2022 Topps Chrome #112 Tony Alvarez, Refractor parallel. Raw (ungraded) and about as clean as this issue comes -- corners are razor sharp on all four, centering is tight on both sides, and the chrome surface is free of the scuffing and fingerprint marks that plague a lot of Chrome product straight out of the pack. No print defects or refractor pattern flaws under close inspection. A strong, display-ready copy of a popular Chrome refractor that collectors of this set will want to grab.",
          category: "Trading Cards - Sports",
        },
        {
          sport: "Pokemon TCG", player: "Charhound ex", setName: "Scarlet Blaze", year: "2024",
          cardNumber: "034/198", parallel: "Holo Rare", condition: "Near Mint",
          title: "Charhound ex 034/198 Holo Rare Scarlet Blaze Pokemon Card NM",
          description: "Scarlet Blaze #034/198 Charhound ex, Holo Rare. This copy is raw (ungraded) and sits at Near Mint -- the holo pattern is bright and consistent with no visible scratching, corners are sharp, and the surface is clean aside from the faintest touch of edge wear from normal handling. Centering is solid front to back. A great-looking copy of a chase Holo Rare ex card for anyone building out this set or collecting the character.",
          category: "Trading Cards - TCG",
        },
        {
          sport: "Football", player: "Devon Ashe", setName: "2021 Prizm", year: "2021",
          cardNumber: "228", parallel: "Silver Prizm", condition: "Excellent",
          title: "2021 Prizm Devon Ashe #228 Silver Prizm Football Rookie",
          description: "2021 Prizm #228 Devon Ashe, Silver Prizm rookie card. Raw (ungraded) and grading out around Excellent -- there's some visible softening on two corners and light edge wear consistent with a card that's been handled and stored, but the surface and prizm shine are still clean with no major scratches. Centering is reasonably close to even. A budget-friendly way to add this rookie parallel to a collection without paying premium-condition pricing.",
          category: "Trading Cards - Sports",
        },
        {
          sport: "Magic: The Gathering", player: "Shivan Hydra", setName: "Dominion Reprint", year: "2020",
          cardNumber: "142", parallel: "Foil", condition: "Near Mint",
          title: "Shivan Hydra #142 Foil Dominion Reprint MTG Card NM",
          description: "Dominion Reprint #142 Shivan Hydra, Foil. Raw (ungraded), grading out at Near Mint -- corners are sharp, the foil surface has only minimal scratching visible at an angle under light, and there's no whitening on the edges. Centering is solid on both sides. A clean foil copy for players who want it on the table or collectors rounding out a foil playset.",
          category: "Trading Cards - TCG",
        },
        {
          sport: "Basketball", player: "Elena Voss", setName: "2020 Select", year: "2020",
          cardNumber: "77", parallel: "Concourse", condition: "Good",
          title: "2020 Select Elena Voss #77 Concourse Basketball Card",
          description: "2020 Select #77 Elena Voss, Concourse parallel. Raw (ungraded) and honestly graded at Good -- there's visible corner wear on multiple corners and light surface scuffing under close inspection, plus some edge softening consistent with real handling rather than fresh-from-the-pack condition. Nothing structural like creasing, just cosmetic wear. Priced and described accordingly for a set-builder or player-collector who doesn't need gem-mint condition.",
          category: "Trading Cards - Sports",
        },
      ];

      const pick = pool[Math.floor(Math.random() * pool.length)];
      const flagged = Math.random() < 0.2;

      return {
        confident: !flagged,
        reason: flagged
          ? "Demo data: glare/angle made a couple of details hard to confirm -- please double-check before accepting."
          : "",
        ...pick,
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
