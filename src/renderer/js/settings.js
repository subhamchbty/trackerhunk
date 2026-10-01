// The settings screen: manage projects and export data.

import { api } from './api.js';
import { emit } from './events.js';
import { formatShort } from './format.js';
import { getProjects, reloadProjects } from './projects.js';
import { confirmDialog } from './confirm.js';

const mainEl = document.getElementById('main');
const panel = document.getElementById('settings');
const openBtn = document.getElementById('open-settings');
const backBtn = document.getElementById('settings-back');
const listEl = document.getElementById('settings-projects');
const addForm = document.getElementById('settings-add');
const addInput = document.getElementById('settings-add-name');
const autoUpdateToggle = document.getElementById('settings-auto-update');
const checkUpdateBtn = document.getElementById('settings-check-update');
const updateStatus = document.getElementById('settings-update-status');
const versionEl = document.getElementById('settings-version');

export function isSettingsOpen() {
  return !panel.classList.contains('hidden');
}

export function openSettings() {
  panel.classList.remove('hidden');
  mainEl.classList.add('hidden');
  render();
  addInput.focus();
}

export function closeSettings() {
  panel.classList.add('hidden');
  mainEl.classList.remove('hidden');
}

// ---- projects ----

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

async function rename(project, input) {
  const name = input.value.trim();
  if (!name || name === project.name) {
    input.value = project.name;
    return;
  }
  try {
    await api.renameProject(project.id, name);
    await refresh();
    emit('data:changed');
  } catch (err) {
    input.value = project.name;
    showError(err);
  }
}

async function remove(project) {
  const stats = await api.projectStats(project.id);
  const detail =
    stats.sessions === 0
      ? 'It has no tracked time.'
      : `All of its tracked time goes with it: ${stats.tasks} ${stats.tasks === 1 ? 'task' : 'tasks'}, ${formatShort(stats.total)}.`;
  const ok = await confirmDialog({
    title: `Delete "${project.name}"?`,
    message: `${detail} This cannot be undone.`
  });
  if (!ok) return;
  try {
    await api.deleteProject(project.id);
    await refresh();
    emit('data:changed');
  } catch (err) {
    showError(err);
  }
}

function showError(err) {
  const msg = String(err?.message ?? err).replace(/^.*Error: /, '');
  errorEl.textContent = msg;
}

const errorEl = el('p', 'settings-error');

function projectRow(project, canDelete) {
  const li = el('li', 'settings-project');

  const name = document.createElement('input');
  name.className = 'settings-project-name';
  name.type = 'text';
  name.value = project.name;
  name.title = 'Click to rename';
  name.spellcheck = false;
  name.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') name.blur();
    if (e.key === 'Escape') {
      name.value = project.name;
      name.blur();
    }
  });
  name.addEventListener('blur', () => rename(project, name));

  const stats = el('span', 'settings-project-stats', '');
  api.projectStats(project.id).then((s) => {
    stats.textContent = s.sessions === 0 ? 'no time yet' : formatShort(s.total);
  });

  const del = el('button', 'entry-delete', '×');
  del.type = 'button';
  del.title = canDelete ? 'Delete project' : 'Keep at least one project';
  del.disabled = !canDelete;
  del.addEventListener('click', () => remove(project));

  li.append(name, stats, del);
  return li;
}

/** Reload the shared project list, then redraw this screen from it. */
async function refresh() {
  await reloadProjects();
  render();
}

function render() {
  const projects = getProjects();
  const frag = document.createDocumentFragment();
  for (const p of projects) frag.appendChild(projectRow(p, projects.length > 1));
  listEl.replaceChildren(frag);
  errorEl.textContent = '';
}

async function addProject() {
  const name = addInput.value.trim();
  if (!name) return;
  try {
    await api.addProject(name);
    addInput.value = '';
    await refresh();
  } catch (err) {
    showError(err);
  }
}

// ---- updates ----

async function loadUpdatePrefs() {
  try {
    autoUpdateToggle.checked = (await api.getSetting('autoUpdate')) !== '0';
    versionEl.textContent = `TrackerHunk ${await api.getVersion()}`;
  } catch (err) {
    console.error(err);
  }
}

async function checkNow() {
  checkUpdateBtn.disabled = true;
  updateStatus.textContent = 'Checking…';
  try {
    const r = await api.checkForUpdate();
    if (r.unsupported) updateStatus.textContent = 'Updates apply to the installed app only.';
    else if (r.available) updateStatus.textContent = `${r.latest} is downloading.`;
    else updateStatus.textContent = `You have the latest version (${r.current}).`;
  } catch (err) {
    updateStatus.textContent = 'Could not reach GitHub.';
    console.error(err);
  } finally {
    checkUpdateBtn.disabled = false;
  }
}

// ---- init ----

export function initSettings() {
  addForm.after(errorEl);
  loadUpdatePrefs();
  autoUpdateToggle.addEventListener('change', () => api.setSetting('autoUpdate', autoUpdateToggle.checked ? '1' : '0'));
  checkUpdateBtn.addEventListener('click', checkNow);

  openBtn.addEventListener('click', () => (isSettingsOpen() ? closeSettings() : openSettings()));
  backBtn.addEventListener('click', closeSettings);
  addForm.addEventListener('submit', (e) => {
    e.preventDefault();
    addProject();
  });
}
