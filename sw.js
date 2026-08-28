// Minimal service worker: caches the app shell so the POS UI itself loads
// with no internet at a show. Firebase/EmailJS network calls are left
// alone -- Firestore manages its own offline cache internally.

const CACHE_NAME = "bsc-pos-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./js/app.js",
  "./js/config.js",
  "./js/store.js",
  "./js/local-store.js",
  "./js/firebase-store.js",
  "./js/utils.js",
  "./js/ui.js",
  "./js/csv.js",
  "./js/checkin.js",
  "./js/barcode.js",
  "./js/receipt.js",
  "./js/views/login.js",
  "./js/views/pos.js",
  "./js/views/inventory.js",
  "./js/views/import-products.js",
  "./js/views/import-stock.js",
  "./js/views/import-history.js",
  "./js/views/customers.js",
  "./js/views/events.js",
  "./js/views/sales.js",
  "./js/views/product-history.js",
  "./js/views/settings.js",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) {
    return; // let cross-origin (Firebase, EmailJS, gstatic) requests pass through untouched
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
