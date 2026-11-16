import './style.css';
import { supabase } from './lib/supabase.js';
import { getSettings, subscribeNotes } from './lib/data.js';
import { renderLogin } from './ui/login.js';
import { createApp } from './ui/app.js';
import { openEdit } from './ui/edit.js';
import { openSettings } from './ui/settings.js';
import { toast } from './ui/util.js';
import { registerServiceWorker } from './lib/push.js';

registerServiceWorker();

const root = document.getElementById('app');
let app = null;
let settings = null;
let unsubscribe = null;
let timer = null;

function route() {
  if (!app) return;
  const h = location.hash;
  const m = h.match(/^#\/n\/([\w-]+)/);
  if (m) {
    const note = app.getNote(m[1]);
    if (note) openEdit(note, settings, () => app.reload());
    else history.replaceState(null, '', '#/');
  } else if (h === '#/einstellungen') {
    openSettings(settings, (s) => { settings = s; app.setSettings(s); });
  }
}

async function start() {
  try {
    settings = await getSettings();
  } catch (e) {
    root.innerHTML = `<p class="p-6 text-center text-red-600">Fehler beim Laden: ${e.message}</p>`;
    return;
  }
  app = createApp(root, settings, {
    onOpenNote: (id) => { location.hash = '#/n/' + id; },
    onOpenSettings: () => { location.hash = '#/einstellungen'; },
  });
  await app.reload();
  unsubscribe = await subscribeNotes(() => app.reload());
  timer = setInterval(() => app.tick(), 60_000);
  if (/access_token|error_description/.test(location.hash)) history.replaceState(null, '', '#/');
  route();
}

function stop() {
  unsubscribe?.();
  clearInterval(timer);
  document.querySelector('dialog[open]')?.close();
  app = null;
}

window.addEventListener('hashchange', route);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && app) app.reload();
});

let currentUser;
supabase.auth.onAuthStateChange((_event, session) => {
  const id = session?.user?.id ?? null;
  if (id === currentUser) return;
  currentUser = id;
  // außerhalb des Callbacks weiterarbeiten (supabase-js empfiehlt keine awaits im Callback)
  setTimeout(() => {
    stop();
    if (id) start().catch((e) => toast(e.message));
    else renderLogin(root);
  });
});
