// Service Worker: zeigt Erinnerungen an und verarbeitet „Erledigt“/„Später“ direkt aus der Nachricht.
const functionsUrl = new URLSearchParams(self.location.search).get('fn') || '';

function notificationOptions(p) {
  const base = { body: p.body || '', icon: '/icon-192.png', badge: '/badge-96.png' };
  if (p.kind === 'digest') {
    // Sammelhinweis: kein Erledigt/Später, ein Tipp öffnet die Hauptansicht
    return { ...base, tag: 'digest', renotify: true, data: { url: p.url || '/#/' } };
  }
  const o = {
    ...base,
    requireInteraction: true,
    data: { noteId: p.noteId, token: p.token, url: p.url || '/' },
    actions: [{ action: 'done', title: 'Erledigt' }, { action: 'snooze', title: 'Später' }],
  };
  if (p.noteId) { o.tag = p.noteId; o.renotify = true; }
  return o;
}

function actionRequest(action, data, fnUrl) {
  return { url: fnUrl + '/note-action', body: JSON.stringify({ id: data.noteId, token: data.token, action }) };
}

async function openApp(url) {
  const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const c of list) {
    if ('focus' in c) { await c.focus(); return c.navigate ? c.navigate(url) : undefined; }
  }
  return self.clients.openWindow(url);
}

self.__test = { notificationOptions, actionRequest, functionsUrl };

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let p = {};
  try { p = event.data ? event.data.json() : {}; } catch { p = { body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(p.title || "Don't forget", notificationOptions(p)));
});

self.addEventListener('notificationclick', (event) => {
  const n = event.notification;
  n.close();
  const data = n.data || {};
  if ((event.action === 'done' || event.action === 'snooze') && functionsUrl) {
    const r = actionRequest(event.action, data, functionsUrl);
    event.waitUntil(
      fetch(r.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: r.body })
        .then((res) => { if (!res.ok) throw new Error(res.status); })
        .catch(() => openApp(data.url || '/')),
    );
    return;
  }
  event.waitUntil(openApp(data.url || '/'));
});
