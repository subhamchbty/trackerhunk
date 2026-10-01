// Smoke test for CI: start Electron headless with a throwaway data folder,
// exercise the database and the page, and exit non-zero on any problem.
// Run with:  node scripts/ci-smoke.js
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trackerhunk-smoke-'));
const script = path.join(tmp, 'smoke-main.js');

fs.writeFileSync(
  script,
  `
  const { app, BrowserWindow } = require('electron');
  const path = require('path');
  app.setPath('userData', ${JSON.stringify(tmp)});
  app.disableHardwareAcceleration();
  const { TrackerDb } = require(${JSON.stringify(path.join(ROOT, 'src/main/db'))});
  const { registerIpc } = require(${JSON.stringify(path.join(ROOT, 'src/main/ipc'))});
  const fail = (msg) => { console.error('SMOKE FAIL: ' + msg); app.exit(1); };
  app.whenReady().then(async () => {
    try {
      const db = new TrackerDb(path.join(${JSON.stringify(tmp)}, 'tracker.db'));
      const project = db.listProjects()[0];
      const task = db.createTask({ name: 'Smoke', description: '', url: '', projectId: project.id });
      db.addSession({ taskId: task.id, start: Date.now() - 60000, duration: 60000 });
      if (db.listSessionsForExport({}).length !== 1) return fail('session not stored');
      registerIpc(db);

      const win = new BrowserWindow({ show: false, webPreferences: {
        preload: path.join(${JSON.stringify(ROOT)}, 'src', 'preload.js'), contextIsolation: true, sandbox: true } });
      const errors = [];
      win.webContents.on('console-message', (_e, level, msg) => { if (level >= 2) errors.push(msg); });
      await win.loadFile(path.join(${JSON.stringify(ROOT)}, 'src', 'renderer', 'index.html'));
      await new Promise((r) => setTimeout(r, 800));
      const rows = await win.webContents.executeJavaScript("document.querySelectorAll('.entry').length");
      if (rows !== 1) return fail('expected 1 task row, saw ' + rows);
      if (errors.length) return fail('renderer errors: ' + errors.join(' | '));
      db.close();
      console.log('SMOKE OK');
      app.exit(0);
    } catch (err) { fail(err.stack || String(err)); }
  });
  `
);

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ELECTRON_NO_ATTACH_CONSOLE;

const electron = require('electron');
const child = spawn(electron, [script], { stdio: 'inherit', env, cwd: ROOT });
const timer = setTimeout(() => {
  console.error('SMOKE FAIL: timed out');
  child.kill();
  process.exit(1);
}, 60000);
child.on('exit', (code) => {
  clearTimeout(timer);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(code ?? 1);
});
