// ---------------------------------------------------------------------------
// Tracks who has verified themselves on THIS device today, so the POS
// screen can offer a quick "who's serving" switcher without a full
// login/logout dance every time two people share one till during a show.
//
// This is deliberately device-local (localStorage) rather than synced data:
// it's about who's physically present at this device today, not a record
// that needs to travel anywhere. Whoever actually authenticates (the normal
// sign-in) is auto-marked checked-in; anyone else has to be verified once
// via checkInOther() (see store.auth.checkInOther in firebase-store.js)
// before they show up as a switch option.
// ---------------------------------------------------------------------------

const KEY = "bsc_checkins";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function loadAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function saveAll(all) {
  localStorage.setItem(KEY, JSON.stringify(all));
}

/** Array of user IDs verified on this device today. */
export function getCheckedInToday() {
  const all = loadAll();
  return all[todayStr()] || [];
}

export function isCheckedInToday(userId) {
  return getCheckedInToday().includes(userId);
}

export function markCheckedIn(userId) {
  if (!userId) return;
  const all = loadAll();
  const day = todayStr();
  const set = new Set(all[day] || []);
  set.add(userId);
  all[day] = [...set];
  saveAll(all);
}
