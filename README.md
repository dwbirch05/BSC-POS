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
2. Click "Sign in" (any email works in demo mode). You'll land on the **Home**
   screen — click any tile to get to that section, and the **⌂ Home** button
   in the top-right takes you back to this screen from anywhere.
3. Add an item in **Inventory &rsaquo; Search Inventory** (try "Generate SKU"
   to get a printable barcode), then go to **POS** and type/scan that
   barcode to try a sale.

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

## Putting it online

The app is just static files, so there are a couple of free, simple ways
to host it once you're ready to open it from more than one device:

- **`GITHUB_HOSTING.md`** — GitHub Pages, all done through a website, no
  command line. Recommended if you don't already use developer tools.
- **`FIREBASE_SETUP.md` (step 8)** — Firebase Hosting via the command
  line. A good option if you're already following that guide for the
  database.

Either way, the database setup in `FIREBASE_SETUP.md` is separate and
still needed for real (non-demo) data.

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
js/app.js                   Navigation shell (incl. the Inventory dropdown,
                              the Home button), login gate, offline indicator
js/checkin.js                Tracks who's verified themselves on this device today
                              (powers the POS "Serving" switcher)
js/views/*.js                One file per screen: Home, POS, Inventory (Search /
                              Import Stock / Import History), Customers, Events,
                              Reporting (Sales History / Product History),
                              Settings, Login
icons/                       PWA icons
test/                        Playwright checks used to verify the app (incl.
                              home-screen-check.mjs — the Home launcher and
                              Reporting access; queued-features-check.mjs —
                              thumbnails, barcode normalization, Sales History
                              reporting; optional, needs `npm install playwright`
                              — not required to run the app itself)
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

## Home screen

Signing in takes you to **Home** — a grid of icons, one per section (POS,
Inventory, Customers, Events, Reporting, Settings). Click a tile to go there;
the **⌂ Home** button at the top of every screen brings you back to this grid
from anywhere. Reporting is only reachable from here (it's not one of the
tabs across the top like the others) — from **Sales History** or **Product
History** there are two small buttons at the top of the screen to flip
between them without needing to go back to Home first.

## Events on the POS screen

There's no event picker on the POS screen — it's automatic. In the
**Events** tab, when you add or edit an event you set its dates and who's
running it. When that person is signed in on those dates, their sales are
tagged to that event with nothing to select at checkout (you'll see which
event it resolved to in the "Selling at" pill on the POS screen). If no
dated event matches today, sales fall back to whichever event is left
unassigned (Home Store, by default).

## Who's serving (POS staff switcher)

Under the event pill on the POS screen there's a **Serving** dropdown. It
lists everyone who has verified themselves on *this device today* — normally
just whoever signed in this morning. If two people are working the same
till, the second person doesn't need to log out and back in: pick
**"+ Check in someone else…"**, choose their name, and (in live/Firebase
mode) enter their password once. After that they stay in the switcher for
the rest of the day on that device, and every sale records who was actually
serving. Demo mode skips the password since there's no real login to check.

## Inventory: Search, Import Stock, Import History

The **Inventory** tab is a dropdown:
- **Search Inventory** — the existing add/edit/view stock screen.
- **Import Stock** — log a delivery: pick the date, scan or type each
  product's code, and enter the cost and quantity you received. Add as many
  products as the order contains, then **Complete import**. This updates
  the item's quantity on hand; the cost you log is kept for your records
  only and never overwrites the item's stored cost or price.
- **Import History** — every past import batch, with the products, quantities
  and cost logged at the time.

## Reporting: Sales History, Product History

Open **Reporting** from the Home screen (see above) — it's not one of the
top tabs:
- **Sales History** — every individual sale, filterable by event, staff
  member, and date. Use **Group by** to switch from a list of individual
  sales to a totals report — one row per event or per staff member, with
  sale count and total revenue for whatever's currently filtered — handy
  for "how did this show do" or "how much has each staff member sold"
  without adding anything up by hand.
- **Product History** — an aggregate table: for every product, total units
  sold, total revenue, and current stock on hand, so you can see what's
  actually moving.

## Customer delivery addresses

When adding or editing a customer you can record a delivery address (street,
suburb, state, postcode) for anything you need to post or drop off — it
shows on the customer's detail view alongside their purchase history.

## Product photos, tags, and bulk CSV import

Each item can now have tags (comma-separated in the item form) and multiple
photos. The first photo also shows as a small thumbnail next to the name in
the Search Inventory list, so you can spot an item at a glance. Photos are resized in the browser before saving, so a phone photo
doesn't bloat storage — in demo mode they're stored right in the browser; in
live (Firebase) mode they're uploaded to Firebase Storage (see step 3 of
`FIREBASE_SETUP.md`). These aren't used anywhere in the app yet beyond the
item form and detail view — they're groundwork for a possible future Shopify
integration (see the "Roadmap" notes kept in the project) so products won't
need re-entering later.

For loading a lot of products at once (e.g. an initial catalog), use
**Inventory &rsaquo; Import Products (CSV)**: download the template, fill it
in (or export one from a spreadsheet with matching column names), upload it,
and review the preview — new products, updates to existing ones (matched by
barcode), and any skipped rows are all shown before anything is saved. Safe
to re-run later with an updated file; a barcode that already exists gets
updated rather than duplicated.

## Barcodes

- **Case and punctuation don't matter for lookups** — scanning or typing
  `bsc000001`, `BSC-000001`, or `Bsc 000001` all find the same item.
- **No duplicates** — the app won't let you save two items with the same
  barcode (comparing the same case/punctuation-insensitive way), and tells
  you which existing item it clashes with. An item with no barcode at all is
  always fine, including having several of those.
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
