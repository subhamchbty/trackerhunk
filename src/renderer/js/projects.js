// The project dropdown: which project is in view and new tasks go to.
// Creating, renaming and deleting projects lives in settings.js.

import { api } from './api.js';
import { emit } from './events.js';

const LAST_PROJECT_KEY = 'lastProjectId';

const select = document.getElementById('project');

let projects = [];
let currentId = null;

export function getProjects() {
  return projects;
}

export function projectName(id) {
  return projects.find((p) => p.id === id)?.name ?? null;
}

/** The project in view. There is always at least one project. */
export function currentProjectId() {
  return currentId;
}

export function matchesView(projectId) {
  return projectId === currentId;
}

/** Option elements for every project. */
export function projectOptions() {
  const frag = document.createDocumentFragment();
  for (const p of projects) frag.appendChild(new Option(p.name, String(p.id)));
  return frag;
}

/** Bring a project into view if it is not already. */
export function showProject(id) {
  if (id == null || id === currentId || !projects.some((p) => p.id === id)) return;
  applySelection(id);
  emit('project:changed');
}

function applySelection(id) {
  currentId = id;
  select.value = String(id);
  try {
    localStorage.setItem(LAST_PROJECT_KEY, String(id));
  } catch {
    // Storage may be unavailable; the selection just won't persist.
  }
}

/** Reload the list, keeping the selection when the project still exists. */
export async function reloadProjects(preferredId) {
  projects = await api.listProjects();
  select.replaceChildren(projectOptions());
  const wanted = preferredId ?? currentId;
  const id = projects.some((p) => p.id === wanted) ? wanted : projects[0]?.id ?? null;
  const changed = id !== currentId;
  if (id != null) applySelection(id);
  if (changed) emit('project:changed');
}

// ---- init ----

export async function initProjects() {
  let last = null;
  try {
    last = Number(localStorage.getItem(LAST_PROJECT_KEY));
  } catch {
    // Fall back to the first project.
  }
  await reloadProjects(Number.isInteger(last) && last > 0 ? last : null);

  select.addEventListener('change', () => {
    applySelection(Number(select.value));
    emit('project:changed');
  });
}
