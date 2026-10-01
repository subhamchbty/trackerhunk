// The update bar: shown once a newer version has been downloaded.

import { api } from './api.js';

const bar = document.getElementById('update-bar');
const textEl = document.getElementById('update-text');
const restartBtn = document.getElementById('update-restart');
const laterBtn = document.getElementById('update-later');

function show({ version }) {
  textEl.textContent = `TrackerHunk ${version} is ready to install.`;
  bar.classList.remove('hidden');
}

export function initUpdate() {
  api.onUpdateReady(show);
  // An update may already be waiting if it finished before this page listened
  // (or before a reload); the smoke test and tests may run without an updater.
  api.getUpdateState().then((info) => info && show(info)).catch(() => {});

  restartBtn.addEventListener('click', () => {
    restartBtn.disabled = true;
    api.installUpdate();
  });
  laterBtn.addEventListener('click', () => bar.classList.add('hidden'));
}
