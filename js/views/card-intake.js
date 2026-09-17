// ---------------------------------------------------------------------------
// Card Intake (AI card reading): upload paired front/back photos of raw
// trading cards, let AI identify each card, judge its condition, and draft
// a title/description, review the results, then export a CSV that goes
// straight into the *existing* Inventory > Import Products (CSV) screen --
// this view deliberately never writes to inventory directly, so every card
// still passes through that already-tested review-before-commit importer.
// Price/cost are intentionally left blank in the export (pricing lookup is
// a separate, not-yet-built feature).
//
// Restricted to the accounts listed in CARD_AI_ALLOWED_EMAILS (config.js) --
// both the Home tile and this view are gated, so this check is defense in
// depth in case the route is ever reached another way.
//
// Photo pairing: card photos don't have a reliable naming convention, so
// pairing is based on the order files are selected -- every 2 consecutive
// photos = one card's front + back. A visual confirm-pairing step (with
// swap/remove per pair) runs before anything is sent to the AI, since
// browser multi-file-select order isn't always perfectly preserved.
//
// AI result contract (same shape returned by both local-store.js's demo
// mock and firebase-store.js's real Cloud Function call):
//   { confident, reason, sport, player, setName, year, cardNumber,
//     parallel, condition, title, description, category }
// ---------------------------------------------------------------------------
import { store } from "../store.js";
import { uid, resizeImageFile, escapeHtml } from "../utils.js";
import { generateSku } from "../barcode.js";
import { toCsv } from "../csv.js";
import { qs, toast } from "../ui.js";
import { isCardAiAllowed } from "../config.js";

// Must match CSV_HEADERS in views/import-products.js -- this is the contract
// that makes the exported file importable there with zero translation.
const CSV_HEADERS = ["name", "barcode", "category", "condition", "description", "cost", "price", "quantity", "tags", "images"];

let state = null;

export function renderCardIntake(container, { currentUser } = {}) {
  if (!isCardAiAllowed(currentUser)) {
    container.innerHTML = `
      <div class="card">
        <h2 style="margin-top:0">Card Intake</h2>
        <p class="text-dim">This feature isn't turned on for your account. Ask an owner to add your login email to Card Intake access.</p>
      </div>
    `;
    return;
  }

  state = freshState();
  container.innerHTML = template();
  wireUp(container);
}

function freshState() {
  return {
    phase: "upload", // "upload" | "pairing" | "processing" | "review"
    pairs: [],        // [{ front: dataUrl, back: dataUrl }]
    leftover: null,    // dataUrl of an unpaired trailing photo, if any
    queue: [],          // [{ id, front, back, confident, reason, name, category, condition, description, quantity, tagsStr }]
    accepted: [],         // CSV-ready row objects
    processedCount: 0,
    totalToProcess: 0,
  };
}

function template() {
  return `
    <div class="card" id="ci-intro">
      <h2 style="margin-top:0">Card Intake (AI)</h2>
      <p class="text-dim">Upload paired front/back photos of raw trading cards -- AI identifies the card, judges its condition, and drafts a title and description. Review the results, accept the ones that look right, then download a CSV to bring into <strong>Inventory &rsaquo; Import Products (CSV)</strong>. Price and cost are left blank for you to fill in.</p>
      <div class="field">
        <label>Card photos</label>
        <input id="ci-file-input" type="file" accept="image/*" multiple />
      </div>
      <p class="text-dim" style="font-size:12px" id="ci-upload-hint">Select photos two at a time per card, front then back -- as many cards as you like in one go. You'll confirm the pairing before anything is processed.</p>
    </div>

    <div class="card" id="ci-pairing-card" hidden>
      <h3>Confirm pairing</h3>
      <p class="text-dim" id="ci-pairing-desc"></p>
      <div id="ci-pair-grid" class="image-grid" style="align-items:flex-start"></div>
      <div id="ci-leftover-note" class="text-bad" style="margin-top:10px; font-size:13px"></div>
      <div class="modal-actions" style="justify-content:flex-start; margin-top:14px">
        <button class="primary" data-action="start-processing">Looks good -- start AI processing</button>
        <button class="ghost" data-action="cancel-pairing">Start over</button>
      </div>
    </div>

    <div class="card" id="ci-progress-card" hidden>
      <h3>Working…</h3>
      <p class="text-dim" id="ci-progress-text"></p>
    </div>

    <div class="card" id="ci-review-card" hidden>
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <h3 style="margin:0">Review</h3>
        <span class="text-dim" id="ci-review-summary" style="font-size:13px"></span>
      </div>
      <div style="margin:10px 0">
        <button class="primary" id="ci-accept-all-btn" data-action="accept-all-confident">Accept all confident</button>
      </div>
      <div id="ci-review-list"></div>
    </div>

    <div class="card" id="ci-export-card" hidden>
      <h3>Export</h3>
      <p class="text-dim" id="ci-export-summary"></p>
      <button class="primary" data-action="export-csv">Download CSV for Import Products</button>
      <button class="ghost" data-action="clear-accepted" style="margin-left:8px">Clear accepted list</button>
    </div>
  `;
}

function wireUp(container) {
  qs("#ci-file-input", container).addEventListener("change", (e) => handleFiles(container, e.target.files));

  container.addEventListener("click", (e) => {
    const target = e.target.closest("[data-action]");
    if (!target || !container.contains(target)) return;
    const action = target.dataset.action;
    if (action === "swap-pair") swapPair(container, Number(target.dataset.idx));
    else if (action === "remove-pair") removePair(container, Number(target.dataset.idx));
    else if (action === "start-processing") startProcessing(container);
    else if (action === "cancel-pairing") cancelPairing(container);
    else if (action === "accept-card") acceptCard(container, target.dataset.id);
    else if (action === "reject-card") rejectCard(container, target.dataset.id);
    else if (action === "accept-all-confident") acceptAllConfident(container);
    else if (action === "export-csv") exportCsv();
    else if (action === "clear-accepted") clearAccepted(container);
  });

  // Editable review fields update the in-memory queue entry directly -- no
  // re-render needed for typing, so this stays responsive with a big batch.
  container.addEventListener("input", (e) => {
    const field = e.target.dataset.field;
    const id = e.target.closest("[data-id]")?.dataset.id;
    if (!field || !id) return;
    const entry = state.queue.find((q) => q.id === id);
    if (!entry) return;
    entry[field] = e.target.value;
  });
}

async function handleFiles(container, fileList) {
  const files = Array.from(fileList || []);
  if (files.length === 0) return;
  if (state.phase === "pairing" || state.phase === "processing") {
    toast("Finish or cancel the current batch before uploading more", "error");
    qs("#ci-file-input", container).value = "";
    return;
  }

  toast(`Reading ${files.length} photo${files.length === 1 ? "" : "s"}…`, "info", 2000);
  let dataUrls;
  try {
    dataUrls = await Promise.all(files.map((f) => resizeImageFile(f)));
  } catch (err) {
    toast(err.message || "Couldn't read one of those photos", "error");
    qs("#ci-file-input", container).value = "";
    return;
  }

  const pairs = [];
  for (let i = 0; i + 1 < dataUrls.length; i += 2) {
    pairs.push({ front: dataUrls[i], back: dataUrls[i + 1] });
  }
  const leftover = dataUrls.length % 2 === 1 ? dataUrls[dataUrls.length - 1] : null;

  state.pairs = pairs;
  state.leftover = leftover;
  state.phase = "pairing";
  qs("#ci-file-input", container).value = "";
  renderPairing(container);
}

function renderPairing(container) {
  qs("#ci-pairing-card", container).hidden = false;
  qs("#ci-pairing-desc", container).textContent =
    `${state.pairs.length} card${state.pairs.length === 1 ? "" : "s"} paired by upload order (front, then back). Swap or remove any that look wrong.`;

  qs("#ci-pair-grid", container).innerHTML = state.pairs.map((p, i) => `
    <div class="image-thumb" style="width:auto; height:auto; padding:6px; display:flex; flex-direction:column; gap:6px; align-items:center; background:var(--panel-light)">
      <div style="display:flex; gap:4px;">
        <img src="${p.front}" style="width:70px; height:70px; object-fit:cover; border-radius:6px" title="Front">
        <img src="${p.back}" style="width:70px; height:70px; object-fit:cover; border-radius:6px" title="Back">
      </div>
      <span class="text-dim" style="font-size:11px">Card ${i + 1}</span>
      <div style="display:flex; gap:4px;">
        <button class="ghost" style="padding:4px 8px; font-size:11px" data-action="swap-pair" data-idx="${i}">Swap</button>
        <button class="danger" style="padding:4px 8px; font-size:11px" data-action="remove-pair" data-idx="${i}">Remove</button>
      </div>
    </div>
  `).join("");

  qs("#ci-leftover-note", container).textContent = state.leftover
    ? "One photo was left over with no pair (odd number selected) and was excluded -- reselect it together with its missing front/back."
    : "";
}

function swapPair(container, idx) {
  const p = state.pairs[idx];
  if (!p) return;
  state.pairs[idx] = { front: p.back, back: p.front };
  renderPairing(container);
}

function removePair(container, idx) {
  state.pairs.splice(idx, 1);
  if (state.pairs.length === 0) {
    cancelPairing(container);
    return;
  }
  renderPairing(container);
}

function cancelPairing(container) {
  state.pairs = [];
  state.leftover = null;
  state.phase = "upload";
  qs("#ci-pairing-card", container).hidden = true;
}

async function startProcessing(container) {
  if (state.pairs.length === 0) return;
  const pairs = state.pairs;
  state.phase = "processing";
  qs("#ci-pairing-card", container).hidden = true;
  qs("#ci-progress-card", container).hidden = false;
  state.processedCount = 0;
  state.totalToProcess = pairs.length;
  updateProgressText(container, "Processed");

  const results = await runWithConcurrency(pairs, 3, async (pair) => {
    let result;
    try {
      result = await store.cardAI.identifyCard({ frontDataUrl: pair.front, backDataUrl: pair.back });
    } catch (err) {
      console.warn("Card AI identify failed", err);
      result = { confident: false, reason: "Couldn't process this card automatically -- enter its details manually." };
    }
    state.processedCount++;
    updateProgressText(container, "Processed");
    return result;
  });

  const newEntries = pairs.map((pair, i) => {
    const r = results[i] || {};
    const tags = [r.sport, r.player, r.setName, r.year, r.cardNumber, r.parallel].filter(Boolean).join("; ");
    return {
      id: uid(),
      front: pair.front,
      back: pair.back,
      confident: !!r.confident,
      reason: r.reason || "",
      name: r.title || "",
      category: r.category || "Trading Cards",
      condition: r.condition || "",
      description: r.description || "",
      quantity: 1,
      tagsStr: tags,
    };
  });

  state.queue.push(...newEntries);
  state.pairs = [];
  state.leftover = null;
  state.phase = "review";
  qs("#ci-progress-card", container).hidden = true;
  renderReview(container);
}

function updateProgressText(container, verb) {
  qs("#ci-progress-text", container).textContent = `${verb} ${state.processedCount} / ${state.totalToProcess}…`;
}

async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function runOne() {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runOne));
  return results;
}

function renderReview(container) {
  const hasQueue = state.queue.length > 0;
  qs("#ci-review-card", container).hidden = !hasQueue;

  if (hasQueue) {
    const confident = state.queue.filter((q) => q.confident);
    const flagged = state.queue.filter((q) => !q.confident);
    qs("#ci-review-summary", container).textContent = `${confident.length} confident · ${flagged.length} need review`;
    const acceptAllBtn = qs("#ci-accept-all-btn", container);
    acceptAllBtn.disabled = confident.length === 0;
    acceptAllBtn.textContent = `Accept all confident (${confident.length})`;

    qs("#ci-review-list", container).innerHTML =
      flagged.map(renderReviewEntry).join("") + confident.map(renderReviewEntry).join("");
  }

  renderExport(container);
}

function renderReviewEntry(q) {
  return `
    <div class="card" style="background:var(--panel-light)" data-id="${q.id}">
      <div class="row" style="align-items:flex-start">
        <div style="display:flex; gap:6px; flex:0 0 auto;">
          <div class="image-thumb"><img src="${q.front}"></div>
          <div class="image-thumb"><img src="${q.back}"></div>
        </div>
        <div style="flex:1; min-width:240px">
          ${q.confident
            ? `<span class="pill" style="border-color:var(--good); color:var(--good)">Confident match</span>`
            : `<span class="pill" style="border-color:var(--warn); color:var(--warn)">Needs review${q.reason ? " — " + escapeHtml(q.reason) : ""}</span>`}
          <div class="field" style="margin-top:8px">
            <label>Name / title</label>
            <input data-field="name" value="${escapeHtml(q.name)}">
          </div>
          <div class="row">
            <div class="field"><label>Category</label><input data-field="category" value="${escapeHtml(q.category)}"></div>
            <div class="field"><label>Condition</label><input data-field="condition" value="${escapeHtml(q.condition)}"></div>
          </div>
          <div class="field"><label>Description</label><textarea data-field="description" rows="2">${escapeHtml(q.description)}</textarea></div>
          <div class="row">
            <div class="field"><label>Quantity</label><input data-field="quantity" type="number" min="1" value="${escapeHtml(String(q.quantity))}"></div>
            <div class="field"><label>Tags</label><input data-field="tagsStr" value="${escapeHtml(q.tagsStr)}"></div>
          </div>
          <div class="modal-actions" style="justify-content:flex-start">
            <button class="primary" data-action="accept-card" data-id="${q.id}">Accept</button>
            <button class="danger" data-action="reject-card" data-id="${q.id}">Reject</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function acceptCard(container, id) {
  const entry = state.queue.find((q) => q.id === id);
  if (!entry) return;
  if (!entry.name.trim()) {
    toast("Give this card a name before accepting", "error");
    return;
  }
  try {
    const row = await buildAcceptedRow(entry);
    state.accepted.push(row);
    state.queue = state.queue.filter((q) => q.id !== id);
    toast(`Accepted -- barcode ${row.barcode}`, "success");
    renderReview(container);
  } catch (err) {
    console.error(err);
    toast("Couldn't accept that card -- try again", "error");
  }
}

function rejectCard(container, id) {
  state.queue = state.queue.filter((q) => q.id !== id);
  toast("Card skipped", "info");
  renderReview(container);
}

async function acceptAllConfident(container) {
  const btn = qs("#ci-accept-all-btn", container);
  const confident = state.queue.filter((q) => q.confident && q.name.trim());
  if (confident.length === 0) return;
  btn.disabled = true;
  qs("#ci-progress-card", container).hidden = false;
  state.processedCount = 0;
  state.totalToProcess = confident.length;
  updateProgressText(container, "Accepting");

  for (const entry of confident) {
    try {
      const row = await buildAcceptedRow(entry);
      state.accepted.push(row);
      state.queue = state.queue.filter((q) => q.id !== entry.id);
    } catch (err) {
      console.error("Bulk accept failed for", entry.id, err);
    }
    state.processedCount++;
    updateProgressText(container, "Accepting");
  }

  qs("#ci-progress-card", container).hidden = true;
  toast(`Accepted ${state.processedCount} card${state.processedCount === 1 ? "" : "s"}`, "success");
  renderReview(container);
}

async function buildAcceptedRow(entry) {
  const skuNum = await store.items.nextSkuNumber();
  const barcode = generateSku(skuNum);
  const [frontUrl, backUrl] = await Promise.all([
    store.items.uploadImage(entry.front),
    store.items.uploadImage(entry.back),
  ]);
  return {
    name: entry.name.trim(),
    barcode,
    category: entry.category.trim(),
    condition: entry.condition.trim(),
    description: entry.description.trim(),
    cost: "",
    price: "",
    quantity: String(parseInt(entry.quantity, 10) || 1),
    tags: entry.tagsStr.split(";").map((t) => t.trim()).filter(Boolean).join(";"),
    images: [frontUrl, backUrl].filter(Boolean).join(";"),
  };
}

function renderExport(container) {
  const has = state.accepted.length > 0;
  qs("#ci-export-card", container).hidden = !has;
  if (has) {
    qs("#ci-export-summary", container).textContent =
      `${state.accepted.length} card${state.accepted.length === 1 ? "" : "s"} ready. Download the CSV, then bring it in through Inventory > Import Products (CSV) -- fill in cost and price there before it goes live.`;
  }
}

function exportCsv() {
  if (state.accepted.length === 0) return;
  const csv = toCsv(state.accepted, CSV_HEADERS);
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bsc-card-intake-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("CSV downloaded", "success");
}

function clearAccepted(container) {
  if (state.accepted.length === 0) return;
  if (!confirm(`Clear ${state.accepted.length} accepted card${state.accepted.length === 1 ? "" : "s"} from this list? (Already downloaded CSVs are unaffected.)`)) return;
  state.accepted = [];
  renderExport(container);
}
