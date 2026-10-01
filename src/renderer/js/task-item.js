// Builds one row of the task list. Pure view: state comes in through the
// arguments, user intent goes out through the handlers.

import { formatClock, formatRange, formatTime, linkLabel } from './format.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function button(className, title, text, onClick) {
  const b = el('button', className, text);
  b.type = 'button';
  b.title = title;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

/** "09:12 – 09:37", "3 sessions · 09:12 – 11:30", "running since 22:57". */
function summary(sessions, running) {
  const parts = [];
  if (sessions.length === 1) parts.push(formatRange(sessions[0].start, sessions[0].end));
  if (sessions.length > 1) {
    const first = Math.min(...sessions.map((s) => s.start));
    const last = Math.max(...sessions.map((s) => s.end));
    parts.push(`${sessions.length} sessions · ${formatRange(first, last)}`);
  }
  if (running) parts.push(`running since ${formatTime(running.startedAt)}`);
  return parts.join(' · ');
}

/**
 * @param {{ task, sessions, total }} row  one task with its sessions on the day
 * @param {{ running, elapsed, onStart, onStop, onEdit, onDelete, onOpenLink }} opts
 *   `running` is the running timer when it belongs to this task.
 * Returns the element and a setter for the live total while running.
 */
export function createTaskItem(row, { running, elapsed, onStart, onStop, onEdit, onDelete, onOpenLink }) {
  const { task, sessions, total } = row;
  const active = Boolean(running);

  const li = el('li', 'entry' + (active ? ' running' : ''));
  li.title = 'Click to edit';
  li.addEventListener('click', onEdit);

  const play = active
    ? button('entry-play active', 'Stop timer', '■', onStop)
    : button('entry-play', 'Start timer for this task', '▶', onStart);

  const totalEl = el('span', 'entry-duration' + (active ? ' live' : ''), formatClock(total + (elapsed ?? 0)));

  const main = el('div', 'entry-main');
  main.append(el('span', 'entry-task' + (task.name ? '' : ' untitled'), task.name || 'Untitled'), totalEl);
  if (!active) main.appendChild(button('entry-delete', 'Delete', '×', onDelete));

  const meta = el('div', 'entry-meta');
  meta.appendChild(el('span', 'entry-range', summary(sessions, running)));
  const desc = el('span', 'entry-description', task.description || '');
  if (task.description) desc.title = task.description;
  meta.appendChild(desc);
  if (task.url) meta.appendChild(button('entry-link', task.url, linkLabel(task.url), onOpenLink));

  const body = el('div', 'entry-body');
  body.append(main, meta);
  li.append(play, body);

  return { element: li, setElapsed: (ms) => (totalEl.textContent = formatClock(total + ms)) };
}
