// A small in-app confirmation dialog. Resolves true when confirmed.

const modal = document.getElementById('confirm');
const titleEl = document.getElementById('confirm-title');
const messageEl = document.getElementById('confirm-message');
const okBtn = document.getElementById('confirm-ok');
const cancelBtn = document.getElementById('confirm-cancel');

let pending = null;

export function isConfirmOpen() {
  return pending !== null;
}

export function confirmDialog({ title, message, confirmLabel = 'Delete' }) {
  if (pending) pending(false);

  titleEl.textContent = title;
  messageEl.textContent = message;
  okBtn.textContent = confirmLabel;
  modal.classList.remove('hidden');
  okBtn.focus();

  return new Promise((resolve) => {
    pending = resolve;
  });
}

function settle(result) {
  if (!pending) return;
  const resolve = pending;
  pending = null;
  modal.classList.add('hidden');
  resolve(result);
}

export function initConfirm() {
  okBtn.addEventListener('click', () => settle(true));
  cancelBtn.addEventListener('click', () => settle(false));
  modal.addEventListener('mousedown', (e) => {
    if (e.target === modal) settle(false);
  });
  document.addEventListener('keydown', (e) => {
    if (!pending) return;
    if (e.key === 'Escape') settle(false);
    if (e.key === 'Enter') settle(true);
  });
}
