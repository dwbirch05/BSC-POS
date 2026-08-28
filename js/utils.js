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

/**
 * Reads an image File, downscales it to a max dimension and re-encodes it as
 * a compressed JPEG data URL. Keeps photos small enough to store in
 * localStorage (demo mode) and quick to upload (live mode) without asking
 * the user to resize anything themselves first.
 */
export function resizeImageFile(file, { maxDim = 1280, quality = 0.82 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width >= height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
        else { width = Math.round(width * (maxDim / height)); height = maxDim; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that image file")); };
    img.src = url;
  });
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
