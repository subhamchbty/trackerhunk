'use strict';

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { TrackerDb } = require('./db');
const { registerIpc } = require('./ipc');
const { initUpdater } = require('./updater');

const APP_NAME = 'TrackerHunk';
const DB_FILE = 'tracker.db';
const LEGACY_DATA_DIR = 'time-tracker'; // user data folder before the rename

app.setName(APP_NAME);
app.setAppUserModelId('com.trackerhunk.app');

// A static UI gains nothing from the GPU process; skipping it saves memory.
app.disableHardwareAcceleration();

let db = null;
let mainWindow = null;

/** Carry the database over from the folder the app used before it was renamed. */
function migrateLegacyData() {
  const target = path.join(app.getPath('userData'), DB_FILE);
  if (fs.existsSync(target)) return;
  const legacyDir = path.join(app.getPath('appData'), LEGACY_DATA_DIR);
  if (!fs.existsSync(path.join(legacyDir, DB_FILE))) return;
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) {
    const src = path.join(legacyDir, DB_FILE + suffix);
    if (fs.existsSync(src)) fs.copyFileSync(src, target + suffix);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 440,
    height: 640,
    minWidth: 380,
    minHeight: 480,
    title: APP_NAME,
    icon: path.join(__dirname, '..', '..', 'assets', 'icons', 'icon.ico'),
    backgroundColor: '#0f1115',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0f1115', symbolColor: '#8b8f98', height: 36 },
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  win.removeMenu();
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow = win;
}

app.whenReady().then(() => {
  migrateLegacyData();
  db = new TrackerDb(path.join(app.getPath('userData'), DB_FILE));
  registerIpc(db);
  createWindow();
  initUpdater(() => mainWindow, db);
});

app.on('window-all-closed', () => {
  if (db) db.close();
  app.quit();
});
