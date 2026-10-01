'use strict';

const fs = require('fs');
const { dialog } = require('electron');

const pad = (n) => String(n).padStart(2, '0');

function localDate(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function localTime(ms) {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function clock(ms) {
  const s = Math.floor(ms / 1000);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

function cell(value) {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Entries as CSV with one row per entry, local times, hours as a decimal. */
function toCsv(entries) {
  const header = ['Date', 'Start', 'End', 'Duration', 'Hours', 'Project', 'Task', 'Description', 'Link'];
  const lines = [header.join(',')];
  for (const e of entries) {
    lines.push(
      [
        localDate(e.start),
        localTime(e.start),
        localTime(e.end),
        clock(e.duration),
        (e.duration / 3600000).toFixed(2),
        e.project ?? '',
        e.task,
        e.description,
        e.url
      ]
        .map(cell)
        .join(',')
    );
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** "acme-corp" from "Acme Corp", for file names. */
function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** A file name that says what the export covers. `to` is exclusive. */
function suggestedName({ from, to, project }) {
  const parts = ['trackerhunk'];
  if (project) parts.push(slug(project));
  if (from != null && to != null) parts.push(`${localDate(from)}_to_${localDate(to - 1)}`);
  else if (from != null) parts.push(`from-${localDate(from)}`);
  else if (to != null) parts.push(`until-${localDate(to - 1)}`);
  else parts.push('all-time');
  return `${parts.join('-')}.csv`;
}

/**
 * Ask where to save, then write. Resolves to the path, or null if cancelled.
 * `scope` describes the range and project for the default file name.
 */
async function exportCsv(win, entries, scope = {}) {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Export sessions',
    defaultPath: suggestedName(scope),
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  });
  if (canceled || !filePath) return null;
  fs.writeFileSync(filePath, toCsv(entries), 'utf8');
  return filePath;
}

module.exports = { toCsv, exportCsv, suggestedName };
