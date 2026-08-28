import { formatMoney, formatDateTime, escapeHtml } from "./utils.js";
import { APP_NAME, EMAILJS_CONFIG } from "./config.js";
import { toast } from "./ui.js";

export function renderReceiptHtml(sale) {
  const lines = (sale.lineItems || []).map((li) => `
    <div class="line">
      <span>${escapeHtml(li.name)} ${li.qty > 1 ? `&times;${li.qty}` : ""}</span>
      <span>${formatMoney(li.priceAtSale * li.qty)}</span>
    </div>
  `).join("");

  return `
    <div class="receipt" id="receipt-content">
      <div style="text-align:center">
        <strong>${APP_NAME}</strong><br/>
        <span style="font-size:12px">${escapeHtml(sale.eventName || "")}</span>
      </div>
      <hr/>
      <div style="font-size:12px">${formatDateTime(sale.createdAt)}</div>
      ${sale.customerName ? `<div style="font-size:12px">Customer: ${escapeHtml(sale.customerName)}</div>` : ""}
      <hr/>
      ${lines}
      <hr/>
      <div class="line total"><span>Total</span><span>${formatMoney(sale.total)}</span></div>
      <div class="line" style="font-size:12px"><span>Paid via</span><span>${escapeHtml(sale.paymentMethod)}</span></div>
      <hr/>
      <div style="text-align:center;font-size:12px">Thank you!</div>
    </div>
  `;
}

export function printReceipt() {
  window.print();
}

let emailjsReady = null;
async function loadEmailJs() {
  if (emailjsReady) return emailjsReady;
  emailjsReady = (async () => {
    if (EMAILJS_CONFIG.publicKey === "REPLACE_ME") return null;
    const mod = await import("https://cdn.jsdelivr.net/npm/@emailjs/browser@4/+esm");
    mod.default.init({ publicKey: EMAILJS_CONFIG.publicKey });
    return mod.default;
  })();
  return emailjsReady;
}

/** Emails the receipt via EmailJS. Returns true on success, false otherwise. */
export async function emailReceipt(sale, customerEmail) {
  if (!customerEmail) {
    toast("This customer has no email on file", "error");
    return false;
  }
  const emailjs = await loadEmailJs();
  if (!emailjs) {
    toast("Email isn't set up yet (see FIREBASE_SETUP.md) — you can still print the receipt.", "error", 6000);
    return false;
  }
  try {
    const lines = (sale.lineItems || [])
      .map((li) => `${li.name}${li.qty > 1 ? ` x${li.qty}` : ""} - ${(li.priceAtSale * li.qty / 100).toFixed(2)}`)
      .join("\n");
    await emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.templateId, {
      to_email: customerEmail,
      order_lines: lines,
      total: (sale.total / 100).toFixed(2),
      event_name: sale.eventName || "",
      shop_name: APP_NAME,
    });
    toast("Receipt emailed", "success");
    return true;
  } catch (err) {
    console.error(err);
    toast("Couldn't send email: " + (err.text || err.message || "unknown error"), "error");
    return false;
  }
}
