// The day log: navigation between days and the list of tasks worked on
// that day in the selected project, each with its total and sessions.

import { api } from './api.js';
import { emit, on } from './events.js';
import { addDays, formatDayLabel, formatShort, fromDateInput, startOfDay, toDateInput, today } from './format.js';
import { matchesView } from './projects.js';
import { getRunning, startTimer, stopTimer } from './timer.js';
import { createTaskItem } from './task-item.js';
import { confirmDialog } from './confirm.js';

const prevBtn = document.getElementById('day-prev');
const nextBtn = document.getElementById('day-next');
const dayLabel = document.getElementById('day-label');
const dayPicker = document.getElementById('day-picker');
const todayBtn = document.getElementById('day-today');
const totalEl = document.getElementById('total');
const addBtn = document.getElementById('add-entry');
const listEl = document.getElementById('entries');
const emptyEl = document.getElementById('empty');

let sessions = []; // the day's sessions, each carrying its task fields
let selectedDay = today();
let runningRow = null; // { setElapsed } while the running task is listed

export function getSelectedDay() {
  return selectedDay;
}

/** Sessions of one task on the selected day, oldest first. */
export function sessionsForTask(taskId) {
  return sessions.filter((s) => s.taskId === taskId).sort((a, b) => a.start - b.start);
}

export async function goToDay(day) {
  selectedDay = startOfDay(day);
  await reload();
}

async function reload() {
  sessions = await api.loadRange(selectedDay, addDays(selectedDay, 1));
  render();
}

// ---- grouping ----

function taskOf(session) {
  const { taskId, task, description, url, projectId, project } = session;
  return { id: taskId, name: task, description, url, projectId, project };
}

/** One row per task, newest activity first. */
function groupByTask() {
  const rows = new Map();
  for (const s of sessions) {
    let row = rows.get(s.taskId);
    if (!row) {
      row = { task: taskOf(s), sessions: [], total: 0, latest: 0 };
      rows.set(s.taskId, row);
    }
    row.sessions.push(s);
    row.total += s.duration;
    row.latest = Math.max(row.latest, s.start);
  }
  return [...rows.values()].sort((a, b) => b.latest - a.latest);
}

// ---- actions ----

async function deleteTaskDay(row) {
  const name = row.task.name || 'Untitled';
  const n = row.sessions.length;
  const ok = await confirmDialog({
    title: 'Delete task?',
    message: `"${name}" and its ${n === 1 ? 'session' : `${n} sessions`} on this day (${formatShort(row.total)}) will be removed. This cannot be undone.`
  });
  if (!ok) return;

  await api.removeTaskDay(row.task.id, selectedDay, addDays(selectedDay, 1), false);
  emit('data:changed');
}

// ---- rendering ----

function render() {
  const running = getRunning();
  const rows = groupByTask().filter((r) => matchesView(r.task.projectId));

  // The running task belongs in today's list even before its first session.
  const runningHere = running && startOfDay(running.startedAt) === selectedDay && matchesView(running.task?.projectId);
  if (runningHere && !rows.some((r) => r.task.id === running.taskId)) {
    rows.unshift({ task: running.task, sessions: [], total: 0, latest: Infinity });
  }

  runningRow = null;
  const frag = document.createDocumentFragment();
  for (const row of rows) {
    const isRunning = runningHere && row.task.id === running.taskId;
    const item = createTaskItem(row, {
      running: isRunning ? running : null,
      elapsed: isRunning ? Date.now() - running.startedAt : 0,
      onStart: () => startTimer(row.task.id),
      onStop: stopTimer,
      onEdit: () => emit('form:open', { task: row.task, running: isRunning }),
      onDelete: () => deleteTaskDay(row),
      onOpenLink: () => api.openUrl(row.task.url)
    });
    if (isRunning) runningRow = item;
    frag.appendChild(item.element);
  }
  listEl.replaceChildren(frag);

  emptyEl.classList.toggle('hidden', rows.length > 0);
  totalEl.textContent = formatShort(rows.reduce((sum, r) => sum + r.total, 0));

  const isToday = selectedDay === today();
  dayLabel.textContent = formatDayLabel(selectedDay);
  dayLabel.classList.toggle('today', isToday);
  dayPicker.value = toDateInput(selectedDay);
  nextBtn.disabled = isToday;
  todayBtn.classList.toggle('hidden', isToday);
}

// ---- init ----

export function initLog() {
  prevBtn.addEventListener('click', () => goToDay(addDays(selectedDay, -1)));
  nextBtn.addEventListener('click', () => goToDay(addDays(selectedDay, 1)));
  todayBtn.addEventListener('click', () => goToDay(today()));
  addBtn.addEventListener('click', () => emit('form:open', null));

  // The label opens a native date picker for jumping further back.
  dayLabel.addEventListener('click', () => {
    try {
      dayPicker.showPicker();
    } catch {
      dayPicker.focus();
    }
  });
  dayPicker.addEventListener('change', () => {
    const day = fromDateInput(dayPicker.value);
    if (Number.isFinite(day) && day <= today()) goToDay(day);
    else dayPicker.value = toDateInput(selectedDay);
  });

  on('project:changed', render);
  on('timer:changed', render);
  on('timer:tick', (ms) => runningRow?.setElapsed(ms));
  on('data:changed', (detail) => {
    const day = detail?.day;
    if (day != null && day !== selectedDay) goToDay(day);
    else reload();
  });

  return reload();
}
