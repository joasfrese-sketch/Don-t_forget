import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

function loadSw(search = '?fn=' + encodeURIComponent('https://x.supabase.co/functions/v1')) {
  const listeners = {};
  const self = { location: { search }, addEventListener: (t, f) => { listeners[t] = f; } };
  new Function('self', readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'))(self);
  return { self, listeners };
}

it('notificationOptions mit beiden Aktionen und tag = noteId', () => {
  const { self } = loadSw();
  const o = self.__test.notificationOptions({ title: "Don't forget", body: 'Mama', noteId: 'n1', token: 't', url: '/#/n/n1' });
  expect(o.body).toBe('Mama');
  expect(o.tag).toBe('n1');
  expect(o.data).toEqual({ noteId: 'n1', token: 't', url: '/#/n/n1' });
  expect(o.actions).toEqual([{ action: 'done', title: 'Erledigt' }, { action: 'snooze', title: 'Später' }]);
  expect(o.requireInteraction).toBe(true);
});

it('actionRequest baut den Aufruf an note-action', () => {
  const { self } = loadSw();
  expect(self.__test.actionRequest('snooze', { noteId: 'n1', token: 't' }, 'https://x/functions/v1')).toEqual({
    url: 'https://x/functions/v1/note-action', body: '{"id":"n1","token":"t","action":"snooze"}',
  });
});

it('functionsUrl kommt aus dem Query-Parameter', () => {
  const { self } = loadSw();
  expect(self.__test.functionsUrl).toBe('https://x.supabase.co/functions/v1');
});

it('registriert push und notificationclick', () => {
  const { listeners } = loadSw();
  expect(typeof listeners.push).toBe('function');
  expect(typeof listeners.notificationclick).toBe('function');
});

it('Nachfass-Hinweis: eigener tag, keine Aktionsknöpfe, Tipp öffnet die Hauptansicht', () => {
  const { self } = loadSw();
  const o = self.__test.notificationOptions({ kind: 'digest', title: "Don't forget", body: 'Du hast noch 2 offene Erinnerungen.', url: '/#/' });
  expect(o.tag).toBe('digest');
  expect(o.actions).toBeUndefined();
  expect(o.data).toEqual({ url: '/#/' });
  expect(o.body).toBe('Du hast noch 2 offene Erinnerungen.');
});

it('Nachricht ohne noteId wirft nicht und setzt kein tag', () => {
  const { self } = loadSw();
  const o = self.__test.notificationOptions({ title: 'x', body: 'y' });
  expect(o.tag).toBeUndefined();
  expect(o.renotify).toBeUndefined();
});
