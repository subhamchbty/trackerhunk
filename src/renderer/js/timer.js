// The running timer and the day-total clock. A timer always belongs to a
// task; stopping it adds a session to that task. The running timer is
// saved to the database so closing the app does not lose it.

import { api } from './api.js';
import { emit, on } from './events.js';
import { addDays, formatClock, startOfDay, today } from './format.js';
import { currentProjectId, showProject } from './projects.js';

const RUNNING_KEY = 'running';
const BASE_TITLE = 'TrackerHunk';

const currentEl = document.getElementById('current');
const clockEl = document.getElementById('clock');
const sessionEl = document.getElementById('session');
const toggleBtn = document.getElementById('toggle');

/** @type {{ taskId: number, startedAt: number } | null} */
let running = null;
/** Snapshot of the running task for display. */
let runningTask = null;
let tickHandle = null;

// Baseline for the big clock: everything already logged today.
let todayTotal = 0;
let todayKey = today();

export function isRunning() {
  return running !== null;
}

export function runningTaskId() {
  return running?.taskId ?? null;
}

/** The running timer with its task, or null. */
export function getRunning() {
  return running ? { ...running, task: runningTask } : null;
}

export function elapsed() {
  return running ? Date.now() - running.startedAt : 0;
}

// ---- clock ----

async function refreshTodayTotal() {
  todayKey = today();
  const rows = await api.loadRange(todayKey, addDays(todayKey, 1));
  todayTotal = rows.reduce((sum, s) => sum + s.duration, 0);
  updateClock();
}

function updateClock() {
  const ms = elapsed();
  clockEl.textContent = formatClock(todayTotal + ms);
  sessionEl.textContent = running ? `Session ${formatClock(ms)}` : '';
  document.title = running ? `${formatClock(ms)} · ${taskName()}` : BASE_TITLE;
}

function taskName() {
  return runningTask?.name || 'Untitled';
}

function tick() {
  // Roll the baseline over if a session crosses midnight.
  if (today() !== todayKey) refreshTodayTotal();
  updateClock();
  emit('timer:tick', elapsed());
}

// Fire on whole seconds so the display never skips a digit.
function scheduleTick() {
  const delay = 1000 - (elapsed() % 1000);
  tickHandle = setTimeout(() => {
    tick();
    scheduleTick();
  }, delay);
}

function renderCard() {
  const active = running !== null;
  currentEl.textContent = active ? taskName() : '';
  currentEl.classList.toggle('hidden', !active);
  clockEl.classList.toggle('running', active);
  toggleBtn.classList.toggle('running', active);
  toggleBtn.textContent = active ? 'Stop' : 'Start a task';
}

function persist() {
  return api.setSetting(RUNNING_KEY, running ? JSON.stringify(running) : null);
}

/** Re-read the running task after it was edited elsewhere. */
async function refreshRunningTask() {
  if (!running) return;
  runningTask = await api.getTask(running.taskId);
  if (!runningTask) {
    // The task was deleted from under the timer; drop the timer too.
    clearTimeout(tickHandle);
    running = null;
    await persist();
    emit('timer:changed');
  }
  renderCard();
  updateClock();
}

// ---- control ----

/** Start timing the given task, stopping any timer already running. */
export async function startTimer(taskId) {
  if (running) await stopTimer();

  runningTask = await api.getTask(taskId);
  if (!runningTask) return;
  running = { taskId, startedAt: Date.now() };

  await persist();
  showProject(runningTask.projectId);
  renderCard();
  tick();
  scheduleTick();
  emit('timer:changed');
}

/** Stop the timer and save the time as a session on its task. */
export async function stopTimer() {
  if (!running) return;

  const r = running;
  try {
    await api.addSession({
      taskId: r.taskId,
      start: r.startedAt,
      duration: Math.max(Date.now() - r.startedAt, 1000)
    });
  } catch (err) {
    // Keep the timer running rather than silently losing the time.
    console.error('Could not save session', err);
    return;
  }

  clearTimeout(tickHandle);
  tickHandle = null;
  running = null;
  const task = runningTask;
  runningTask = null;
  await persist();

  renderCard();
  updateClock();
  showProject(task?.projectId ?? null);
  emit('timer:changed');
  emit('data:changed', { day: startOfDay(r.startedAt) });
}

/** Resume a timer that was running when the app last closed. */
async function restore() {
  let saved = null;
  try {
    const raw = await api.getSetting(RUNNING_KEY);
    saved = raw ? JSON.parse(raw) : null;
  } catch {
    saved = null;
  }
  if (!saved || !Number.isFinite(saved.startedAt) || saved.startedAt > Date.now()) {
    if (saved) await api.setSetting(RUNNING_KEY, null);
    return;
  }

  // Timers saved before tasks existed carry the task fields inline.
  let taskId = Number.isInteger(saved.taskId) ? saved.taskId : null;
  if (taskId == null && typeof saved.task === 'string') {
    const created = await api.createTask({
      name: saved.task,
      description: saved.description,
      url: saved.url,
      projectId: saved.projectId ?? currentProjectId()
    });
    taskId = created.id;
  }

  runningTask = taskId != null ? await api.getTask(taskId) : null;
  if (!runningTask) {
    await api.setSetting(RUNNING_KEY, null);
    return;
  }

  running = { taskId, startedAt: saved.startedAt };
  await persist();
  renderCard();
  tick();
  scheduleTick();
}

// ---- init ----

export async function initTimer() {
  toggleBtn.addEventListener('click', () => {
    if (running) stopTimer();
    else emit('form:open', null);
  });

  on('data:changed', () => {
    refreshTodayTotal();
    refreshRunningTask();
  });
  await restore();
  renderCard();
  await refreshTodayTotal();
}
