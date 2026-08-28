export function uid() {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  );
}

export function nowIso() {
  return new Date().toISOString();
}

export function formatMoney(cents) {
  return (cents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });
}

/** Parse a user-typed price string ("12.50", "$12.5") into integer cents. */
export function parseMoneyToCents(str) {
  const cleaned = String(str).replace(/[^0-9.-]/g, "");
  const val = parseFloat(cleaned);
  if (Number.isNaN(val)) return 0;
  return Math.round(val * 100);
}

export function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/** Tiny pub/sub used by the demo store to simulate live-update listeners. */
export class Emitter {
  constructor() { this._subs = new Set(); }
  subscribe(fn) { this._subs.add(fn); return () => this._subs.delete(fn); }
  emit(data) { for (const fn of this._subs) fn(data); }
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
