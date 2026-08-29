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
