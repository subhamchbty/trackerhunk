// The export dialog: pick a project and a date range, then save a CSV.

import { api } from './api.js';
import { addDays, fromDateInput, startOfDay, toDateInput, today } from './format.js';
import { currentProjectId, projectOptions } from './projects.js';

const ALL = 'all';

const modal = document.getElementById('export-modal');
const form = document.getElementById('export-form');
const countEl = document.getElementById('export-count');
const x = {
  project: document.getElementById('x-project'),
  preset: document.getElementById('x-preset'),
  from: document.getElementById('x-from'),
  to: document.getElementById('x-to'),
  error: document.getElementById('x-error'),
  cancel: document.getElementById('x-cancel'),
  save: document.getElementById('x-save')
};

export function isExportOpen() {
  return !modal.classList.contains('hidden');
}

// ---- presets ----

/** Inclusive [from, to] days for a preset, or null for all time. */
function presetRange(preset) {
  const t = today();
  const d = new Date(t);
  switch (preset) {
    case 'week': {
      const offset = (d.getDay() + 6) % 7; // Monday = 0
      return { from: addDays(t, -offset), to: t };
    }
    case 'month':
      return { from: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), to: t };
    case 'last-month':
      return {
        from: new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(),
        to: addDays(new Date(d.getFullYear(), d.getMonth(), 1).getTime(), -1)
      };
    case '30':
      return { from: addDays(t, -29), to: t };
    default:
      return null;
  }
}

function applyPreset() {
  const range = presetRange(x.preset.value);
  const custom = x.preset.value === 'custom';
  x.from.disabled = !custom && !range;
  x.to.disabled = !custom && !range;
  if (range) {
    x.from.value = toDateInput(range.from);
    x.to.value = toDateInput(range.to);
  } else if (!custom) {
    x.from.value = '';
    x.to.value = '';
  }
  if (!custom) {
    x.from.disabled = x.preset.value === ALL;
    x.to.disabled = x.preset.value === ALL;
  }
  updateCount();
}

// ---- reading ----

/** Options for the main process, or { error }. */
function readOptions() {
  const projectId = x.project.value === ALL ? null : Number(x.project.value);
  if (x.preset.value === ALL) return { from: null, to: null, projectId };

  const from = fromDateInput(x.from.value);
  const to = fromDateInput(x.to.value);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return { error: 'Pick both a from and a to date.' };
  if (to < from) return { error: 'The to date must not be before the from date.' };
  return { from: startOfDay(from), to: addDays(to, 1), projectId };
}

async function updateCount() {
  const opts = readOptions();
  if (opts.error) {
    countEl.textContent = '';
    return;
  }
  const rows = await api.loadRange(opts.from ?? 0, opts.to ?? Number.MAX_SAFE_INTEGER);
  const n = rows.filter((s) => opts.projectId == null || s.projectId === opts.projectId).length;
  countEl.textContent = `${n} ${n === 1 ? 'session' : 'sessions'}`;
}

// ---- open / close / submit ----

export function openExport() {
  x.error.textContent = '';
  const frag = projectOptions();
  frag.prepend(new Option('All projects', ALL));
  x.project.replaceChildren(frag);
  x.project.value = String(currentProjectId());
  x.preset.value = 'month';
  applyPreset();
  modal.classList.remove('hidden');
  x.preset.focus();
}

export function closeExport() {
  modal.classList.add('hidden');
}

async function submit() {
  const opts = readOptions();
  if (opts.error) {
    x.error.textContent = opts.error;
    return;
  }
  x.save.disabled = true;
  try {
    await api.exportSessions(opts);
    closeExport();
  } catch (err) {
    x.error.textContent = String(err?.message ?? err).replace(/^.*Error: /, '');
  } finally {
    x.save.disabled = false;
  }
}

// ---- init ----

export function initExport() {
  for (const id of ['export', 'settings-export']) {
    document.getElementById(id).addEventListener('click', openExport);
  }
  x.cancel.addEventListener('click', closeExport);
  x.preset.addEventListener('change', applyPreset);
  x.project.addEventListener('change', updateCount);
  for (const input of [x.from, x.to]) {
    input.addEventListener('change', () => {
      x.preset.value = 'custom';
      updateCount();
    });
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit();
  });
  modal.addEventListener('mousedown', (e) => {
    if (e.target === modal) closeExport();
  });
}
