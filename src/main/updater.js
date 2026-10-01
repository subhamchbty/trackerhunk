'use strict';

const { app, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');

const FIRST_CHECK_MS = 10 * 1000;
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const AUTO_UPDATE_KEY = 'autoUpdate'; // '0' turns automatic checks off

/**
 * In-app updates from GitHub Releases. The installed app checks for a newer
 * release, downloads it quietly, then tells the page so it can offer a
 * restart. Automatic checks can be switched off in Settings; "Check now"
 * still works. Only the installed (NSIS) build can update itself: the
 * portable exe and a dev run report that updates are unsupported.
 *
 * Set TRACKERHUNK_FAKE_UPDATE=1 to see the banner without a real release.
 */
function initUpdater(getWindow, db) {
  const send = (channel, payload) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };

  const fake = process.env.TRACKERHUNK_FAKE_UPDATE === '1';
  const supported = app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR;
  const autoEnabled = () => db.getSetting(AUTO_UPDATE_KEY) !== '0';

  // The update that has been downloaded and is waiting for a restart. The
  // page asks for it on load in case it was ready before the page listened.
  let ready = null;
  const announce = (info) => {
    ready = { version: info.version };
    send('update:ready', ready);
  };

  ipcMain.handle('update:state', () => ready);

  ipcMain.handle('update:install', () => {
    if (fake || !supported) return false;
    setImmediate(() => autoUpdater.quitAndInstall());
    return true;
  });

  /** Manual check. Resolves to { current, latest, available, unsupported }. */
  ipcMain.handle('update:check', async () => {
    const current = app.getVersion();
    if (fake) {
      setTimeout(() => announce({ version: '9.9.9' }), 500);
      return { current, latest: '9.9.9', available: true };
    }
    if (!supported) return { current, latest: null, available: false, unsupported: true };
    const result = await autoUpdater.checkForUpdates();
    const latest = result?.updateInfo?.version ?? null;
    return { current, latest, available: Boolean(result?.isUpdateAvailable) };
  });

  if (fake) {
    setTimeout(() => announce({ version: '9.9.9' }), 2000);
    return;
  }
  if (!supported) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;
  autoUpdater.on('update-downloaded', announce);
  autoUpdater.on('error', (err) => console.error('Updater:', err?.message ?? err));

  const scheduledCheck = () => {
    if (autoEnabled()) autoUpdater.checkForUpdates().catch(() => {});
  };
  setTimeout(scheduledCheck, FIRST_CHECK_MS);
  setInterval(scheduledCheck, CHECK_INTERVAL_MS);
}

module.exports = { initUpdater };
