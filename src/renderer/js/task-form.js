// The modal form for a task: create one and start its timer or log time,
// or edit an existing task and the sessions it has on the selected day.

import { api } from './api.js';
import { emit, on } from './events.js';
import {
  formatClock,
  formatDayLabel,
  fromTimeInput,
  normalizeUrl,
  toTimeInput,
  today,
  DAY_MS
} from './format.js';
import { currentProjectId, projectOptions, showProject } from './projects.js';
import { startTimer } from './timer.js';
import { getSelectedDay, sessionsForTask } from './log.js';

const HOUR_MS = 3600000;

const modal = document.getElementById('modal');
const form = document.getElementById('entry-form');
const titleEl = document.getElementById('form-title');
const dayEl = document.getElementById('form-day');
const f = {
  project: document.getElementById('f-project'),
  task: document.getElementById('f-task'),
  description: document.getElementById('f-description'),
  url: document.getElementById('f-url'),
  sessionsLabel: document.getElementById('f-sessions-label'),
  addSession: document.getElementById('f-add-session'),
  sessionList: document.getElementById('f-session-list'),
  duration: document.getElementById('f-duration'),
  error: document.getElementById('f-error'),
  cancel: document.getElementById('f-cancel'),
  log: document.getElementById('f-log'),
  save: document.getElementById('f-save')
};

// 'new' | 'edit' | 'running'
let mode = 'new';
let taskId = null;
let day = today();
let original = []; // sessions loaded for the day, to diff against on save

export function isFormOpen() {
  return !modal.classList.contains('hidden');
}

// ---- session rows ----

function sessionRow(session) {
  const li = document.createElement('li');
  li.className = 'session-row';
  if (session) li.dataset.id = String(session.id);

  const start = document.createElement('input');
  start.type = 'time';
  start.step = '1';
  start.className = 'field session-time';
  start.value = toTimeInput(session ? session.start : defaultStart());

  const sep = document.createElement('span');
  sep.className = 'session-sep';
  sep.textContent = '–';

  const end = document.createElement('input');
  end.type = 'time';
  end.step = '1';
  end.className = 'field session-time';
  end.value = toTimeInput(session ? session.end : defaultStart() + HOUR_MS);

  const dur = document.createElement('span');
  dur.className = 'session-dur';

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'entry-delete session-remove';
  remove.title = 'Remove session';
  remove.textContent = '×';
  remove.addEventListener('click', () => {
    li.remove();
    updateTotals();
  });

  start.addEventListener('input', updateTotals);
  end.addEventListener('input', updateTotals);
  li.append(start, sep, end, dur, remove);
  return li;
}

function defaultStart() {
  const end = day === today() ? Math.floor(Date.now() / 1000) * 1000 : day + 10 * HOUR_MS;
  return end - HOUR_MS;
}

/** Parse one row; an end earlier than the start means it ran past midnight. */
function readRow(li) {
  const [startInput, endInput] = li.querySelectorAll('input');
  const start = fromTimeInput(day, startInput.value);
  let end = fromTimeInput(day, endInput.value);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { error: 'Each session needs a start and an end time.' };
  if (end <= start) end += DAY_MS;
  return { id: li.dataset.id ? Number(li.dataset.id) : null, start, duration: end - start };
}

function readRows() {
  const rows = [];
  for (const li of f.sessionList.children) {
    const r = readRow(li);
    if (r.error) return { error: r.error };
    rows.push(r);
  }
  return { rows };
}

function updateTotals() {
  let total = 0;
  for (const li of f.sessionList.children) {
    const r = readRow(li);
    li.querySelector('.session-dur').textContent = r.error ? '' : formatClock(r.duration);
    if (!r.error) total += r.duration;
  }
  f.duration.textContent = f.sessionList.children.length > 1 ? `Total ${formatClock(total)}` : '';
}

// ---- open / close ----

/**
 * @param {object | null} target  null for a new task, or `{ task, running }`
 *   for an existing one (`running` when its timer is going right now).
 */
export function openForm(target) {
  mode = !target ? 'new' : target.running ? 'running' : 'edit';
  taskId = target ? target.task.id : null;
  day = getSelectedDay();
  const task = target?.task;

  titleEl.textContent = { new: 'New task', edit: 'Edit task', running: 'Running timer' }[mode];
  dayEl.textContent = formatDayLabel(day);
  f.save.textContent = { new: 'Start timer', edit: 'Save', running: 'Save' }[mode];
  f.log.classList.toggle('hidden', mode !== 'new');
  f.sessionsLabel.textContent = mode === 'new' ? 'Time to log' : 'Sessions on this day';
  f.error.textContent = '';

  f.project.replaceChildren(projectOptions());
  f.project.value = String(task ? task.projectId : currentProjectId());

  f.task.value = task?.name ?? '';
  f.description.value = task?.description ?? '';
  f.url.value = task?.url ?? '';

  original = mode === 'new' ? [] : sessionsForTask(taskId);
  const rows = mode === 'new' ? [sessionRow(null)] : original.map(sessionRow);
  f.sessionList.replaceChildren(...rows);
  updateTotals();

  modal.classList.remove('hidden');
  f.task.focus();
  f.task.select();
}

export function closeForm() {
  modal.classList.add('hidden');
  taskId = null;
}

// ---- helpers ----

function readTaskFields() {
  return {
    name: f.task.value,
    description: f.description.value,
    url: normalizeUrl(f.url.value),
    projectId: Number(f.project.value)
  };
}

function showError(err) {
  f.error.textContent = String(err?.message ?? err).replace(/^.*Error: /, '');
}

/** Apply session rows to a task: add new ones, update changed, delete removed. */
async function saveSessions(id, rows, keepTask) {
  const kept = new Set(rows.filter((r) => r.id != null).map((r) => r.id));
  for (const r of rows) {
    if (r.id == null) {
      await api.addSession({ taskId: id, start: r.start, duration: r.duration });
    } else {
      const before = original.find((s) => s.id === r.id);
      if (before && (before.start !== r.start || before.duration !== r.duration)) {
        await api.updateSession(r.id, { start: r.start, duration: r.duration });
      }
    }
  }
  for (const s of original) {
    if (!kept.has(s.id)) await api.deleteSession(s.id, keepTask);
  }
}

// ---- actions ----

/** New task: create it and log the listed time. */
async function logTime() {
  const read = readRows();
  if (read.error) {
    f.error.textContent = read.error;
    return;
  }
  if (read.rows.length === 0) {
    f.error.textContent = 'Add at least one session to log.';
    return;
  }

  const fields = readTaskFields();
  try {
    const task = await api.createTask(fields);
    await saveSessions(task.id, read.rows, false);
  } catch (err) {
    showError(err);
    return;
  }

  closeForm();
  showProject(fields.projectId);
  emit('data:changed', { day });
}

/** New task: create it and start its timer. */
async function startNew() {
  const fields = readTaskFields();
  let task;
  try {
    task = await api.createTask(fields);
  } catch (err) {
    showError(err);
    return;
  }
  closeForm();
  await startTimer(task.id);
}

/** Existing task: save its fields and the day's sessions. */
async function saveExisting() {
  const read = readRows();
  if (read.error) {
    f.error.textContent = read.error;
    return;
  }

  const fields = readTaskFields();
  try {
    await api.updateTask(taskId, fields);
    await saveSessions(taskId, read.rows, mode === 'running');
  } catch (err) {
    showError(err);
    return;
  }

  closeForm();
  showProject(fields.projectId);
  emit('data:changed', { day });
}

// ---- init ----

export function initTaskForm() {
  f.cancel.addEventListener('click', closeForm);
  f.log.addEventListener('click', logTime);
  f.addSession.addEventListener('click', () => {
    f.sessionList.appendChild(sessionRow(null));
    updateTotals();
    f.sessionList.lastElementChild.querySelector('input').focus();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (mode === 'new') startNew();
    else saveExisting();
  });

  modal.addEventListener('mousedown', (e) => {
    if (e.target === modal) closeForm();
  });

  on('form:open', openForm);
}
