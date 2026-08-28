export function uid() {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  );
}

export function nowIso() {
  return new Date().toISOString();
}

export function formatMoney(cents) {
  const amount = (cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `$${amount}`;
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

/**
 * The list of user IDs assigned to run an event. Reads the current
 * `assignedUserIds` array, falling back to the older single `assignedUserId`
 * field so events created before multi-select shipped still work.
 */
export function getAssignedUserIds(event) {
  if (Array.isArray(event.assignedUserIds)) return event.assignedUserIds;
  if (event.assignedUserId) return [event.assignedUserId];
  return [];
}

/**
 * Work out which event a sale should be tagged to, with no picker needed:
 * 1. An event assigned to the signed-in user (one of possibly several people
 *    on that event) whose date range covers today wins.
 * 2. Otherwise fall back to an unassigned event (preferring one named
 *    `defaultName`, e.g. "Home Store"), or just the first event that exists.
 */
export function resolveActiveEvent(events, currentUser, defaultName) {
  const today = new Date().toISOString().slice(0, 10);
  const isActiveToday = (ev) => {
    if (!ev.startDate) return false;
    const start = ev.startDate.slice(0, 10);
    const end = (ev.endDate || ev.startDate).slice(0, 10);
    return today >= start && today <= end;
  };

  if (currentUser) {
    const assigned = events.find((ev) => getAssignedUserIds(ev).includes(currentUser.id) && isActiveToday(ev));
    if (assigned) return assigned;
  }

  const unassigned = events.filter((ev) => getAssignedUserIds(ev).length === 0);
  return unassigned.find((ev) => ev.name === defaultName) || unassigned[0] || events[0] || null;
}
