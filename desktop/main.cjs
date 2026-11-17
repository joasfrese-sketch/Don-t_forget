'use strict';
// Windows-App (Electron): zeigt die App in einem Fenster, läuft im Hintergrund (Tray) und zeigt Erinnerungen zur Zeit an.
const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, protocol, net, nativeImage, session, powerMonitor } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { createScheduler } = require('./scheduler.cjs');
const { resolveAppPath, isAllowedFetchUrl, sanitizeFetchInit } = require('./paths.cjs');
const { readJson, writeJsonAtomic } = require('./files.cjs');

const APP_ID = 'de.dontforget.app';
const SCHEME = 'dtf';
const ORIGIN = `${SCHEME}://app/`;
const DIST = path.join(__dirname, '..', 'dist');
const ICON = path.join(__dirname, 'icon.png');
const HIDDEN = process.argv.includes('--hidden'); // Start mit Windows: nur ins Tray
const TICK_MS = Number(process.env.DTF_TICK_MS) || 5000;
const TEST_LOG = process.env.DTF_TEST_LOG || null; // nur Tests: Nachrichten in eine Datei schreiben statt anzuzeigen

if (process.env.DTF_USER_DATA) app.setPath('userData', process.env.DTF_USER_DATA); // nur Tests

protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }]);


let win = null;
let tray = null;
let quitting = false;
let scheduler = null;
const activeToasts = new Set(); // Windows lässt Klicks auf Nachrichten verfallen, wenn das Objekt aufgeräumt wird

const fromApp = (event) => typeof event.senderFrame?.url === 'string' && event.senderFrame.url.startsWith(ORIGIN);

function showWindow() {
  if (!win || win.isDestroyed()) createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function sendAction(actionId, extra) {
  showWindow();
  const send = () => win.webContents.send('dtf:action', actionId, extra);
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send); else send();
}

function showNotification(e) {
  if (TEST_LOG) {
    fs.appendFileSync(TEST_LOG, JSON.stringify({ id: e.id, title: e.title, body: e.body, kind: e.kind, noteId: e.noteId, at: Date.now() }) + '\n');
    return;
  }
  const n = new Notification({ title: e.title, body: e.body, icon: ICON });
  activeToasts.add(n);
  if (activeToasts.size > 50) activeToasts.delete(activeToasts.values().next().value); // nicht unbegrenzt wachsen
  const release = () => activeToasts.delete(n);
  n.on('click', () => { release(); sendAction('tap', { noteId: e.noteId ?? null, kind: e.kind }); });
  n.on('close', release);
  n.show();
}

function createWindow() {
  win = new BrowserWindow({
    width: 480, height: 800, minWidth: 360, minHeight: 520,
    show: !HIDDEN, title: "Don't forget", icon: ICON, backgroundColor: '#1b2430', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  win.removeMenu();
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => { if (!url.startsWith(ORIGIN)) event.preventDefault(); });
  // Schließen = ins Tray; die App läuft weiter und erinnert (Beenden nur über das Tray-Menü)
  win.on('close', (event) => { if (!quitting) { event.preventDefault(); win.hide(); } });
  // Windows meldet Abmelden/Herunterfahren als „session-end“: dann nicht verstecken, sonst blockiert die App das Herunterfahren
  win.on('session-end', () => { quitting = true; });
  win.loadURL(`${ORIGIN}index.html`);
}

function createTray() {
  try {
    tray = new Tray(nativeImage.createFromPath(ICON));
    tray.setToolTip("Don't forget");
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: "Don't forget öffnen", click: showWindow },
      { type: 'separator' },
      { label: 'Beenden', click: () => { quitting = true; app.quit(); } },
    ]));
    tray.on('click', showWindow);
  } catch (e) { console.warn('Tray nicht verfügbar:', e.message); }
}

function registerIpc(userData) {
  ipcMain.handle('dtf:schedule', (event, list) => { if (!fromApp(event)) return; scheduler.set(Array.isArray(list) ? list : []); scheduler.tick(); });
  ipcMain.handle('dtf:cancelAll', (event) => { if (fromApp(event)) scheduler.cancelAll(); });
  ipcMain.handle('dtf:getAutostart', (event) => (fromApp(event) ? app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin : false));
  ipcMain.handle('dtf:setAutostart', (event, on) => { if (fromApp(event)) app.setLoginItemSettings({ openAtLogin: !!on, args: ['--hidden'] }); });
  ipcMain.handle('dtf:fetch', async (event, url, init) => {
    if (!fromApp(event)) throw new Error('nicht erlaubt');
    if (!isAllowedFetchUrl(url)) throw new Error('Adresse nicht erlaubt');
    const res = await net.fetch(url, { ...sanitizeFetchInit(init), signal: AbortSignal.timeout(30_000) });
    return { status: res.status, body: await res.text() };
  });
}

function main() {
  if (!app.requestSingleInstanceLock()) { app.quit(); return; }
  app.on('second-instance', () => showWindow()); // zweiter Start öffnet nur das vorhandene Fenster
  app.on('before-quit', () => { quitting = true; });
  app.on('window-all-closed', () => { /* läuft im Hintergrund weiter */ });

  app.whenReady().then(() => {
    app.setAppUserModelId(APP_ID); // nötig für Windows-Nachrichten
    const userData = app.getPath('userData');
    const prefsFile = path.join(userData, 'prefs.json');
    const shownFile = path.join(userData, 'shown.json');

    // Die App braucht keine Berechtigungen des Fensters (Kamera, Mikrofon, Standort …): alles verweigern, auch bei der reinen Abfrage
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    protocol.handle(SCHEME, (request) => {
      const url = new URL(request.url);
      if (url.host !== 'app') return new Response('Nicht gefunden', { status: 404 });
      const file = resolveAppPath(DIST, url.pathname);
      if (!file) return new Response('Verboten', { status: 403 });
      try { if (!fs.statSync(file).isFile()) return new Response('Nicht gefunden', { status: 404 }); } catch { return new Response('Nicht gefunden', { status: 404 }); }
      return net.fetch(pathToFileURL(file).toString());
    });

    scheduler = createScheduler({
      show: showNotification,
      loadShown: () => readJson(shownFile, []),
      saveShown: (keys) => writeJsonAtomic(shownFile, keys),
    });
    setInterval(() => scheduler.tick(), TICK_MS);
    powerMonitor.on('resume', () => scheduler.tick()); // nach dem Ruhezustand sofort Verpasstes nachholen

    registerIpc(userData);
    createWindow();
    createTray();

    // Erster Start unter Windows: mit Windows starten (nur ins Tray), sonst kommen Erinnerungen nicht, wenn die App nicht läuft.
    // In den Einstellungen abschaltbar.
    const prefs = readJson(prefsFile, {});
    if (!prefs.initialized) {
      if (process.platform === 'win32') app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] });
      writeJsonAtomic(prefsFile, { ...prefs, initialized: true });
    }

    if (TEST_LOG) global.__dtfTest = { click: (extra) => sendAction('tap', extra), tick: () => scheduler.tick() };
  });
}

main();
