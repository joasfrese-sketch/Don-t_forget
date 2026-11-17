import './style.css';
import { store, getSettings } from './lib/data.js';
import { createApp } from './ui/app.js';
import { openEdit } from './ui/edit.js';
import { openSettings } from './ui/settings.js';
import { toast } from './ui/util.js';
import { initTheme } from './lib/theme.js';
import { createNotifier, attachSync, routeAction, defaultPlatform, noticeFor } from './lib/notify.js';

import { registerServiceWorker } from './lib/pwa.js';

initTheme();
registerServiceWorker();

const root = document.getElementById('app');
let app = null;
let settings = null;
let notifier = null;
let sync = null;

function route() {
  if (!app) return;
  const h = location.hash;
  const m = h.match(/^#\/n\/([\w-]+)/);
  if (m) {
    const note = app.getNote(m[1]);
    if (note) openEdit(note, settings, () => app.reload());
    else history.replaceState(null, '', '#/');
  } else if (h === '#/einstellungen') {
    openSettings(settings, (s) => { settings = s; app.setSettings(s); sync?.syncNow(); }, notifier, () => sync?.syncNow());
  }
}

async function setupNotifications() {
  notifier = createNotifier(defaultPlatform());
  try { await notifier.init(); } catch (e) { console.warn('Benachrichtigungen:', e); }
  // Aktionen aus Benachrichtigungen (Erledigt, Später, Antippen)
  notifier.platform.onAction((actionId, extra) => routeAction(actionId, extra, { store, navigate: (hash) => { location.hash = hash; } }));
  // Auf dem Handy gleich beim Start fragen (Android 13+ braucht die Erlaubnis zur Laufzeit)
  try {
    const { permission } = await notifier.status();
    if (notifier.platform.isNative && permission !== 'granted' && permission !== 'denied') await notifier.requestPermission();
  } catch (e) { console.warn('Berechtigung:', e); }
  sync = attachSync(store, notifier);
  sync.onResult((result) => app?.setNotice(noticeFor(result)));
  await sync.syncNow();
}

async function start() {
  settings = await getSettings();
  app = createApp(root, settings, {
    onOpenNote: (id) => { location.hash = '#/n/' + id; },
    onOpenSettings: () => { location.hash = '#/einstellungen'; },
  });
  await app.reload();
  store.onChange(() => app.reload()); // auch Änderungen aus Benachrichtigungen erscheinen sofort
  setInterval(() => app.tick(), 60_000);
  await setupNotifications();
  route();
}

window.addEventListener('hashchange', route);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && app) { app.reload(); sync?.syncNow(); }
});

start().catch((e) => {
  root.innerHTML = '<p class="p-6 text-center text-danger"></p>';
  root.firstChild.textContent = 'Fehler beim Start: ' + e.message;
  toast(e.message);
});
