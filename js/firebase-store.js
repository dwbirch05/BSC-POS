// ---------------------------------------------------------------------------
// "Live mode" data layer: Firebase (Firestore + Auth), loaded straight from
// Google's CDN as ES modules -- no npm install / bundler needed. Firestore's
// offline persistence means reads/writes work even with no internet at a
// show, and sync back up automatically once the connection returns.
//
// Implements the same shape as local-store.js so the view code (pos.js,
// inventory.js, etc.) works identically no matter which backend is active.
// ---------------------------------------------------------------------------
import { FIREBASE_CONFIG } from "./config.js";
import { Emitter, uid, normalizeBarcode } from "./utils.js";

const SDK_VERSION = "10.13.0";
const BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;

const { initializeApp } = await import(`${BASE}/firebase-app.js`);
const {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, getDoc,
  onSnapshot, enableIndexedDbPersistence, serverTimestamp, setDoc, runTransaction,
} = await import(`${BASE}/firebase-firestore.js`);
const {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword,
} = await import(`${BASE}/firebase-auth.js`);
const { deleteApp } = await import(`${BASE}/firebase-app.js`);
const {
  getStorage, ref: storageRef, uploadString, getDownloadURL, deleteObject,
} = await import(`${BASE}/firebase-storage.js`);

const app = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

try {
  await enableIndexedDbPersistence(db);
} catch (err) {
  // Fails if multiple tabs are open, or an old/unsupported browser -- the
  // app still works, it just won't cache for offline use in that tab.
  console.warn("Offline persistence not enabled:", err.code || err);
}

const caches = { items: [], customers: [], events: [], sales: [], imports: [], users: [] };
const emitters = { items: new Emitter(), customers: new Emitter(), events: new Emitter(), sales: new Emitter(), imports: new Emitter(), users: new Emitter() };

function watch(name) {
  onSnapshot(collection(db, name), (snap) => {
    caches[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    caches[name].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    emitters[name].emit();
  }, (err) => console.error(`onSnapshot(${name}) failed:`, err));
}
["items", "customers", "events", "sales", "imports", "users"].forEach(watch);

function makeCollection(name) {
  const emitter = emitters[name];
  return {
    list() {
      return caches[name];
    },
    get(id) {
      return caches[name].find((x) => x.id === id) || null;
    },
    async add(data) {
      const ref = await addDoc(collection(db, name), { ...data, createdAt: new Date().toISOString() });
      return { id: ref.id, ...data };
    },
    async update(id, patch) {
      await updateDoc(doc(db, name, id), { ...patch, updatedAt: new Date().toISOString() });
      return { ...this.get(id), ...patch };
    },
    async remove(id) {
      await deleteDoc(doc(db, name, id));
    },
    onChange(fn) {
      return emitter.subscribe(fn);
    },
  };
}

export const firebaseStore = {
  mode: "firebase",

  items: {
    ...makeCollection("items"),
    findByBarcode(code) {
      const target = normalizeBarcode(code);
      if (!target) return null;
      return caches.items.find((x) => normalizeBarcode(x.barcode) === target) || null;
    },
    search(query) {
      const q = query.trim().toLowerCase();
      if (!q) return this.list();
      return this.list().filter((it) =>
        [it.name, it.barcode, it.category, it.description].filter(Boolean).some((f) => f.toLowerCase().includes(q))
      );
    },
    async nextSkuNumber() {
      const counterRef = doc(db, "meta", "counters");
      return runTransaction(db, async (tx) => {
        const snap = await tx.get(counterRef);
        const current = snap.exists() ? (snap.data().nextSku || 1) : 1;
        tx.set(counterRef, { nextSku: current + 1 }, { merge: true });
        return current;
      });
    },
    // Live mode: actually upload the (already-resized) image to Firebase
    // Storage and hand back its public download URL for item.images.
    async uploadImage(dataUrl) {
      const path = `items/${uid()}.jpg`;
      const ref = storageRef(storage, path);
      await uploadString(ref, dataUrl, "data_url");
      return getDownloadURL(ref);
    },
    async deleteImage(url) {
      try {
        await deleteObject(storageRef(storage, url));
      } catch (err) {
        console.warn("Couldn't delete image from Storage:", err);
      }
    },
  },

  customers: {
    ...makeCollection("customers"),
    search(query) {
      const q = query.trim().toLowerCase();
      if (!q) return this.list();
      return this.list().filter((c) =>
        [c.name, c.email, c.phone].filter(Boolean).some((f) => f.toLowerCase().includes(q))
      );
    },
  },

  events: {
    ...makeCollection("events"),
  },

  sales: {
    ...makeCollection("sales"),
    forEvent(eventId) {
      return this.list().filter((s) => s.eventId === eventId);
    },
    forCustomer(customerId) {
      return this.list().filter((s) => s.customerId === customerId);
    },
  },

  imports: {
    ...makeCollection("imports"),
  },

  users: {
    list() { return caches.users || []; },
    onChange(fn) { return emitters.users.subscribe(fn); },
    async add(data) {
      // Adding a staff member creates a real Firebase Auth login for them
      // via a *second*, throwaway app instance so it doesn't sign out the
      // person currently logged in (Firebase's documented workaround for
      // "admin creates a user" from client-only code).
      const secondaryApp = initializeApp(FIREBASE_CONFIG, "secondary-" + Date.now());
      const secondaryAuth = getAuth(secondaryApp);
      const cred = await createUserWithEmailAndPassword(secondaryAuth, data.email, data.tempPassword);
      await setDoc(doc(db, "users", cred.user.uid), {
        name: data.name, email: data.email, role: data.role || "staff",
        createdAt: new Date().toISOString(),
      });
      await signOut(secondaryAuth);
      return { id: cred.user.uid, ...data };
    },
  },

  auth: {
    async login(email, password) {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      return ensureUserDoc(cred.user);
    },
    async logout() {
      await signOut(auth);
    },
    currentUser() {
      return auth.currentUser;
    },
    onAuthChange(fn) {
      return onAuthStateChanged(auth, async (user) => {
        if (!user) return fn(null);
        const profile = await ensureUserDoc(user);
        fn(profile);
      });
    },
    // Verify a staff member's password on THIS device to "check them in"
    // for the POS switcher, without disturbing whoever is currently signed
    // in. Uses a second, throwaway Firebase app instance to run the sign-in
    // check, then immediately signs it out and tears it down again.
    async checkInOther(email, password) {
      const secondaryApp = initializeApp(FIREBASE_CONFIG, "checkin-" + Date.now());
      const secondaryAuth = getAuth(secondaryApp);
      try {
        const cred = await signInWithEmailAndPassword(secondaryAuth, email, password);
        const snap = await getDoc(doc(db, "users", cred.user.uid));
        if (!snap.exists()) throw new Error("No profile found for this account.");
        return { id: cred.user.uid, ...snap.data() };
      } finally {
        try { await signOut(secondaryAuth); } catch {}
        try { await deleteApp(secondaryApp); } catch {}
      }
    },
  },
};

async function ensureUserDoc(fbUser) {
  const ref = doc(db, "users", fbUser.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return { id: fbUser.uid, ...snap.data() };
  // First person ever to sign in to a fresh project becomes the owner.
  const profile = {
    name: fbUser.displayName || fbUser.email.split("@")[0],
    email: fbUser.email,
    role: "owner",
    createdAt: new Date().toISOString(),
  };
  await setDoc(ref, profile);
  return { id: fbUser.uid, ...profile };
}
