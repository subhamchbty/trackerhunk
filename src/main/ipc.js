'use strict';

const { ipcMain, shell, BrowserWindow } = require('electron');
const v = require('./validate');
const { exportCsv } = require('./csv');
const { version } = require('../../package.json');

/** Wire every renderer request to the database, validating inputs first. */
function registerIpc(db) {
  ipcMain.handle('app:version', () => version);

  ipcMain.handle('projects:list', () => db.listProjects());
  ipcMain.handle('projects:add', (_e, name) => db.addProject(v.projectName(name)));
  ipcMain.handle('projects:rename', (_e, id, name) => db.renameProject(v.id(id), v.projectName(name)));
  ipcMain.handle('projects:stats', (_e, id) => db.projectStats(v.id(id)));
  ipcMain.handle('projects:delete', (_e, id) => db.deleteProject(v.id(id)));

  ipcMain.handle('tasks:get', (_e, id) => db.getTask(v.id(id)));
  ipcMain.handle('tasks:create', (_e, fields) => db.createTask(v.taskFields(fields)));
  ipcMain.handle('tasks:update', (_e, id, fields) => db.updateTask(v.id(id), v.taskFields(fields)));
  ipcMain.handle('tasks:removeDay', (_e, id, from, to, keep) =>
    db.removeTaskDay(v.id(id), v.timestamp(from), v.timestamp(to), v.bool(keep))
  );

  ipcMain.handle('sessions:loadRange', (_e, from, to) => db.loadRange(v.timestamp(from), v.timestamp(to)));
  ipcMain.handle('sessions:add', (_e, fields) => db.addSession(v.sessionFields(fields, true)));
  ipcMain.handle('sessions:update', (_e, id, fields) => db.updateSession(v.id(id), v.sessionFields(fields, false)));
  ipcMain.handle('sessions:delete', (_e, id, keep) => db.deleteSession(v.id(id), v.bool(keep)));
  ipcMain.handle('sessions:export', (e, options) => {
    const opts = v.exportOptions(options);
    const project = opts.projectId != null ? db.listProjects().find((p) => p.id === opts.projectId) : null;
    return exportCsv(BrowserWindow.fromWebContents(e.sender), db.listSessionsForExport(opts), {
      from: opts.from,
      to: opts.to,
      project: project?.name ?? null
    });
  });

  ipcMain.handle('settings:get', (_e, key) => db.getSetting(v.settingKey(key)));
  ipcMain.handle('settings:set', (_e, key, value) => db.setSetting(v.settingKey(key), v.settingValue(value)));

  // Only web links may leave the app.
  ipcMain.handle('shell:openUrl', (_e, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) return shell.openExternal(url);
    return false;
  });
}

module.exports = { registerIpc };
