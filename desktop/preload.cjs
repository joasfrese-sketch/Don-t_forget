'use strict';
// Brücke zwischen Fenster und Hauptprozess. Das Fenster hat keinen Zugriff auf Node, nur auf diese wenigen Funktionen.
const { contextBridge, ipcRenderer } = require('electron');

let handler = null;
const pending = []; // Aktionen, die kommen, bevor die Seite fertig geladen ist (z. B. Klick auf eine Nachricht beim Start)

ipcRenderer.on('dtf:action', (_event, actionId, extra) => {
  if (handler) handler(actionId, extra);
  else pending.push([actionId, extra]);
});

contextBridge.exposeInMainWorld('dtfDesktop', {
  schedule: (list) => ipcRenderer.invoke('dtf:schedule', list),
  cancelAll: () => ipcRenderer.invoke('dtf:cancelAll'),
  onAction: (cb) => {
    handler = cb;
    while (pending.length) { const [a, e] = pending.shift(); cb(a, e); }
  },
  getAutostart: () => ipcRenderer.invoke('dtf:getAutostart'),
  setAutostart: (on) => ipcRenderer.invoke('dtf:setAutostart', !!on),
  // Nur zum Claude-Aufruf; der Hauptprozess erlaubt ausschließlich https://api.anthropic.com/
  fetch: (url, init) => ipcRenderer.invoke('dtf:fetch', String(url), { method: init?.method, headers: init?.headers, body: init?.body }),
});
