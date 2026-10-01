// Entry point: initialise each module in dependency order and wire
// global keyboard shortcuts.

import { initProjects } from './projects.js';
import { initTimer, isRunning, stopTimer } from './timer.js';
import { initLog } from './log.js';
import { initTaskForm, isFormOpen, closeForm, openForm } from './task-form.js';
import { initConfirm, isConfirmOpen } from './confirm.js';
import { initSettings, isSettingsOpen, closeSettings } from './settings.js';
import { initExport, isExportOpen, closeExport } from './export.js';

function initShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (isConfirmOpen()) return; // handled by the confirm dialog
    if (isExportOpen()) {
      if (e.key === 'Escape') closeExport();
      return;
    }
    if (isFormOpen()) {
      if (e.key === 'Escape') closeForm();
      return;
    }
    if (isSettingsOpen()) {
      if (e.key === 'Escape') closeSettings();
      return;
    }
    // Leave Space to focused controls: inputs take text, buttons activate.
    const tag = document.activeElement?.tagName;
    if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(tag)) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (isRunning()) stopTimer();
      else openForm(null);
    }
  });
}

async function main() {
  initConfirm();
  await initProjects();
  await initTimer();
  initTaskForm();
  initSettings();
  initExport();
  await initLog();
  initShortcuts();
}

main().catch((err) => console.error('Failed to start', err));
