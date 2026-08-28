// Small view helpers shared by every screen: toasts, modals, DOM shortcuts.

export function qs(sel, root = document) { return root.querySelector(sel); }
export function qsa(sel, root = document) { return [...root.querySelectorAll(sel)]; }

export function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

let toastWrap = null;
export function toast(message, type = "info", ms = 3500) {
  if (!toastWrap) {
    toastWrap = el(`<div class="toast-wrap"></div>`);
    document.body.appendChild(toastWrap);
  }
  const node = el(`<div class="toast ${type}">${message}</div>`);
  toastWrap.appendChild(node);
  setTimeout(() => node.remove(), ms);
}

let modalRoot = null;
export function openModal(innerHtml, { onMount } = {}) {
  closeModal();
  modalRoot = el(`
    <div class="modal-backdrop">
      <div class="modal">${innerHtml}</div>
    </div>
  `);
  modalRoot.addEventListener("click", (e) => {
    if (e.target === modalRoot) closeModal();
  });
  document.body.appendChild(modalRoot);
  if (onMount) onMount(qs(".modal", modalRoot));
  return qs(".modal", modalRoot);
}
export function closeModal() {
  if (modalRoot) { modalRoot.remove(); modalRoot = null; }
}

/** Attach one delegated listener for [data-action] clicks within `root`. */
export function onAction(root, handlers) {
  root.addEventListener("click", (e) => {
    const target = e.target.closest("[data-action]");
    if (!target || !root.contains(target)) return;
    const action = target.dataset.action;
    if (handlers[action]) handlers[action](target, e);
  });
}
