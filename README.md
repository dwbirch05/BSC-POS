# Big Screen Collectables — POS

A point-of-sale, inventory, customer and event-tracking app built for Big Screen
Collectables. Runs entirely in the browser, works offline at shows, and installs
like an app on a laptop or tablet (PWA).

## Try it right now (no setup)

The app ships in **demo mode**: everything is stored in your browser
(`localStorage`), so you can click around immediately with no account, no
internet dependency, no setup.

1. Open `index.html` in a modern browser (Chrome or Edge recommended — see
   *Browser support* below), either by double-clicking it or serving the
   folder with any static file server, e.g.:
   ```
   npx serve .
   # or
   python3 -m http.server 8080
   ```
   (Barcode camera scanning and the installable-app/offline features need
   it to be served over `http://` or `https://`, not opened as a bare
   `file://` path.)
2. Click "Sign in" (any email works in demo mode).
3. Add an item in **Inventory** (try "Generate SKU" to get a printable
   barcode), then go to **POS** and type/scan that barcode to try a sale.

Demo-mode data only lives in that one browser — it won't show up on your
phone, and clearing your browser data clears it. That's fine for trying
things out, but for actual day-to-day use (and anything with staff or
multiple devices) you'll want **live mode**, below.

## Switching to live mode (real cloud database)

Live mode uses Firebase so your data is backed up, syncs across every
device, works offline at a show and syncs back up once you're online, and
supports real staff logins. It's free for a shop this size.

Follow **`FIREBASE_SETUP.md`** for the exact step-by-step — it takes about
15 minutes and doesn't require any coding.

## Project structure

```
index.html              App shell / entry point
manifest.webmanifest     PWA install metadata
sw.js                     Service worker (offline app-shell caching)
css/styles.css            All styling
js/config.js              Mode switch (demo/firebase) + your Firebase & EmailJS keys
js/store.js                Picks the active backend
js/local-store.js          Demo-mode backend (localStorage)
js/firebase-store.js       Live-mode backend (Firestore + Auth)
js/barcode.js               Code 39 barcode generator (no external library)
js/receipt.js               Receipt rendering, printing, emailing
js/app.js                   Navigation shell, login gate, offline indicator
js/views/*.js                One file per screen (POS, Inventory, Customers,
                              Events, Sales, Settings, Login)
icons/                       PWA icons
test/                        Playwright checks used to verify the app (optional,
                              needs `npm install playwright` — not required to
                              run the app itself)
```

There is **no build step**. Every file is plain HTML/CSS/JavaScript
(ES modules) — edit and reload, nothing to compile.

## How the offline support works

- **Demo mode**: `localStorage` is inherently local/offline — there's
  nothing to sync.
- **Live mode**: Firestore (Google's database) caches everything it reads
  and writes in the browser automatically. Scan items, ring up sales, add
  customers — all of that works with zero internet, and the moment the
  device reconnects, everything quietly syncs to the cloud and to every
  other device signed in. The pill in the top-right corner tells you
  whether you're currently online or offline.
- The app itself (the screens, not the data) is cached by the service
  worker (`sw.js`) so it opens even with no signal at all, once you've
  loaded it at least once.

## Barcodes

- **Existing barcodes** (movie merch, packaged collectables) — just scan
  them; the item is looked up by that exact code.
- **One-off / signed pieces with no barcode** — click "Generate SKU" when
  adding the item to get an internal code (`BSC-000123`) and a printable
  Code 39 barcode label.
- **Scanning**: a USB barcode scanner works immediately — it just "types"
  the code into the scan box and presses Enter, no setup needed. There's
  also a camera-scan button for phones/tablets or when there's no USB
  scanner handy (uses the browser's built-in scanner — see browser support
  below).
- Every label also prints the code as plain text, and you can always type a
  code into the POS box by hand, so a sale is never blocked by a scan
  that doesn't take.

## Browser support

Built with plain web standards, so it runs in any modern browser. Two
optional features rely on newer browser APIs and quietly fall back to a
manual option if unavailable:
- **Camera barcode scanning** uses `BarcodeDetector`, supported in Chrome,
  Edge and Chrome-based Android browsers. On Safari/Firefox you'll see a
  message to use a USB scanner or type the code instead.
- **Install as an app / offline caching** (PWA) works in all major
  browsers.

## Staff accounts

Go to **Settings** (owner login only) to add staff. In demo mode this is
just a label (no real password). In live mode, adding a staff member
creates them a real login with a temporary password you set — have them
sign in once and, if you'd like, walk them through Firebase's own
"forgot password" reset flow to set their own.

## Payments

The app records which payment method was used (Cash / Card / Other) and
the amount — actual card processing happens on your existing card
terminal, this app doesn't touch payment details at all.
