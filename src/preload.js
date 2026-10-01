'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/** The only surface the renderer gets: a few typed calls, no Node access. */
contextBridge.exposeInMainWorld('tracker', {
  listProjects: () => ipcRenderer.invoke('projects:list'),
  addProject: (name) => ipcRenderer.invoke('projects:add', name),
  renameProject: (id, name) => ipcRenderer.invoke('projects:rename', id, name),
  projectStats: (id) => ipcRenderer.invoke('projects:stats', id),
  deleteProject: (id) => ipcRenderer.invoke('projects:delete', id),

  getTask: (id) => ipcRenderer.invoke('tasks:get', id),
  createTask: (fields) => ipcRenderer.invoke('tasks:create', fields),
  updateTask: (id, fields) => ipcRenderer.invoke('tasks:update', id, fields),
  removeTaskDay: (id, from, to, keepTask) => ipcRenderer.invoke('tasks:removeDay', id, from, to, keepTask),

  loadRange: (from, to) => ipcRenderer.invoke('sessions:loadRange', from, to),
  addSession: (fields) => ipcRenderer.invoke('sessions:add', fields),
  updateSession: (id, fields) => ipcRenderer.invoke('sessions:update', id, fields),
  deleteSession: (id, keepTask) => ipcRenderer.invoke('sessions:delete', id, keepTask),
  exportSessions: (options) => ipcRenderer.invoke('sessions:export', options),

  getSetting: (key) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),

  openUrl: (url) => ipcRenderer.invoke('shell:openUrl', url)
});
