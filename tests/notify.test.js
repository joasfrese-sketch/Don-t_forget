import { describe, it, expect, vi, afterEach } from 'vitest';
import { createStore } from '../src/lib/store.js';
import { memoryStorage } from '../src/lib/storage.js';
import { createNotifier, attachSync, routeAction, browserPlatform, capacitorPlatform, desktopPlatform, defaultPlatform, noticeFor } from '../src/lib/notify.js';

const NOW = new Date('2026-11-16T09:00:00Z');
const settings = { default_time: '17:00', timezone: 'Europe/Berlin', followup_enabled: false, followup_hours: 5, evening_from: '18:00', morning_at: '08:00' };
const note = (nid, text, remind_at, o = {}) => ({ id: 'id' + nid, nid, text, remind_at, custom_time: false, status: 'open', ...o });

function fakePlatform(over = {}) {
  const p = {
    isNative: true, calls: [], perm: 'granted', slow: 0, failSchedule: false,
    async checkPermission() { return this.perm; },
    async requestPermission() { this.perm = 'granted'; return this.perm; },
    async schedule(list) {
      this.calls.push(['schedule:start']);
      if (this.slow) await new Promise((r) => setTimeout(r, this.slow));
      if (this.failSchedule) throw new Error('Plattform kaputt');
      this.calls.push(['schedule', list]);
    },
    async cancelAll() { this.calls.push(['cancel']); },
    onAction(h) { this.handler = h; },
    async exactAlarmAllowed() { return true; },
    async openExactAlarmSettings() {},
    ...over,
  };
  return p;
}
const kinds = (p) => p.calls.map((c) => c[0]);

describe('sync', () => {
  it('entfernt alte Alarme und plant den neuen Plan', async () => {
    const p = fakePlatform();
    const n = createNotifier(p);
    const r = await n.sync([note(1, 'Mama', '2026-11-16T16:00:00.000Z')], settings, NOW);
    expect(r).toEqual({ scheduled: 1 });
    expect(kinds(p)).toEqual(['cancel', 'schedule:start', 'schedule']);
    expect(p.calls.at(-1)[1][0]).toMatchObject({ id: 1, body: 'Mama', kind: 'reminder' });
  });
  it('ohne Berechtigung wird nichts geplant, Grund wird gemeldet', async () => {
    const p = fakePlatform({ perm: 'denied' });
    const r = await createNotifier(p).sync([note(1, 'x', '2026-11-16T16:00:00.000Z')], settings, NOW);
    expect(r).toEqual({ scheduled: 0, reason: 'no-permission', permission: 'denied' });
    expect(p.calls).toEqual([]);
  });
  it('Plattformfehler wirft nicht', async () => {
    const p = fakePlatform({ failSchedule: true });
    const r = await createNotifier(p).sync([note(1, 'x', '2026-11-16T16:00:00.000Z')], settings, NOW);
    expect(r.scheduled).toBe(0);
    expect(r.reason).toBe('error');
  });
  it('wiederholtes sync erzeugt keine Dubletten (immer erst alles entfernen)', async () => {
    const p = fakePlatform();
    const n = createNotifier(p);
    const list = [note(1, 'x', '2026-11-16T16:00:00.000Z')];
    await n.sync(list, settings, NOW); await n.sync(list, settings, NOW);
    expect(kinds(p)).toEqual(['cancel', 'schedule:start', 'schedule', 'cancel', 'schedule:start', 'schedule']);
  });
  it('überlappende Aufrufe laufen nacheinander', async () => {
    const p = fakePlatform({ slow: 20 });
    const n = createNotifier(p);
    const list = [note(1, 'x', '2026-11-16T16:00:00.000Z')];
    await Promise.all([n.sync(list, settings, NOW), n.sync(list, settings, NOW)]);
    expect(kinds(p)).toEqual(['cancel', 'schedule:start', 'schedule', 'cancel', 'schedule:start', 'schedule']);
  });
  it('leerer Plan: alles entfernt, nichts geplant', async () => {
    const p = fakePlatform();
    const r = await createNotifier(p).sync([note(1, 'vorbei', '2026-11-16T08:00:00.000Z')], settings, NOW);
    expect(r).toEqual({ scheduled: 0 });
    expect(kinds(p)).toEqual(['cancel']);
  });
});

describe('status', () => {
  it('Berechtigung und exakte Alarme', async () => {
    const p = fakePlatform({ exactAlarmAllowed: async () => false });
    expect(await createNotifier(p).status()).toEqual({ permission: 'granted', exactAlarm: false });
  });
});

describe('attachSync (Änderungen im Speicher planen automatisch neu)', () => {
  it('Anlegen, Erledigen, Verschieben und Löschen berechnen den Plan neu', async () => {
    const p = fakePlatform();
    const store = createStore(memoryStorage(), { now: () => NOW });
    await store.saveSettings({ followup_enabled: false }); // sonst käme zu jeder Erinnerung ein Nachfass-Hinweis dazu
    const sync = attachSync(store, createNotifier(p), { now: () => NOW });
    const lastPlan = () => [...p.calls].reverse().find((c) => c[0] === 'schedule')?.[1] ?? [];

    const a = await store.createNote('Mama', new Date('2026-11-16T16:00:00Z'), false);
    await sync.idle();
    expect(lastPlan().map((x) => x.body)).toEqual(['Mama']);

    await store.snooze(a.id); // jetzt + 1 Std. = 10:00Z
    await sync.idle();
    expect(lastPlan()[0].at.toISOString()).toBe('2026-11-16T10:00:00.000Z');

    await store.markDone(a.id);
    await sync.idle();
    expect(p.calls.at(-1)).toEqual(['cancel']); // nichts mehr geplant, alte Alarme weg

    sync.off();
    const before = p.calls.length;
    await store.createNote('später', new Date('2026-11-17T16:00:00Z'), false);
    await sync.idle();
    expect(p.calls.length).toBe(before);
  });
  it('syncNow plant sofort aus dem aktuellen Speicherstand', async () => {
    const p = fakePlatform();
    const store = createStore(memoryStorage(), { now: () => NOW });
    await store.saveSettings({ followup_enabled: false });
    await store.createNote('x', new Date('2026-11-16T16:00:00Z'), false);
    const sync = attachSync(store, createNotifier(p), { now: () => NOW });
    await sync.syncNow();
    expect(p.calls.at(-1)[1]).toHaveLength(1);
  });
});

describe('routeAction', () => {
  const setup = async () => {
    const store = createStore(memoryStorage(), { now: () => NOW });
    const n = await store.createNote('x', new Date('2026-11-16T08:00:00Z'), false);
    const nav = vi.fn();
    return { store, n, nav };
  };
  it('Erledigt', async () => {
    const { store, n, nav } = await setup();
    await routeAction('done', { noteId: n.id, kind: 'reminder' }, { store, navigate: nav });
    expect((await store.listNotes())[0].status).toBe('done');
    expect(nav).not.toHaveBeenCalled();
  });
  it('Später = jetzt + 1 Stunde', async () => {
    const { store, n, nav } = await setup();
    await routeAction('snooze', { noteId: n.id }, { store, navigate: nav });
    expect((await store.listNotes())[0].remind_at).toBe('2026-11-16T10:00:00.000Z');
  });
  it('Tipp auf Erinnerung öffnet die Notiz, Tipp auf Sammelhinweis die Hauptansicht', async () => {
    const { store, n, nav } = await setup();
    await routeAction('tap', { noteId: n.id, kind: 'reminder' }, { store, navigate: nav });
    expect(nav).toHaveBeenLastCalledWith('#/n/' + n.id);
    await routeAction('tap', { noteId: null, kind: 'digest' }, { store, navigate: nav });
    expect(nav).toHaveBeenLastCalledWith('#/');
  });
  it('unbekannte Notiz oder fehlende Daten: kein Absturz', async () => {
    const { store, nav } = await setup();
    await expect(routeAction('done', { noteId: 'gibt-es-nicht' }, { store, navigate: nav })).resolves.not.toThrow();
    await expect(routeAction('done', undefined, { store, navigate: nav })).resolves.not.toThrow();
    await expect(routeAction('komisch', {}, { store, navigate: nav })).resolves.not.toThrow();
    expect((await store.listNotes())[0].status).toBe('open');
  });
});

describe('browserPlatform (Entwicklung/Test, nur solange die Seite offen ist)', () => {
  afterEach(() => { vi.useRealTimers(); delete globalThis.Notification; });
  it('plant nur Meldungen der nächsten 24 Stunden und löst sie zur Zeit aus; cancelAll stoppt sie', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const shown = [];
    globalThis.Notification = class { static permission = 'granted'; constructor(t, o) { shown.push([t, o.body]); } };
    const p = browserPlatform();
    await p.schedule([
      { id: 1, at: new Date(NOW.getTime() + 60_000), title: "Don't forget", body: 'bald' },
      { id: 2, at: new Date(NOW.getTime() + 25 * 3600e3), title: "Don't forget", body: 'zu weit weg' },
    ]);
    vi.advanceTimersByTime(61_000);
    expect(shown).toEqual([["Don't forget", 'bald']]);
    await p.schedule([{ id: 3, at: new Date(Date.now() + 60_000), title: 't', body: 'wird gestoppt' }]);
    await p.cancelAll();
    vi.advanceTimersByTime(120_000);
    expect(shown).toHaveLength(1);
  });
  it('ohne Notification-Unterstützung: Berechtigung „denied“, kein Absturz', async () => {
    delete globalThis.Notification;
    const p = browserPlatform();
    expect(await p.checkPermission()).toBe('denied');
    await expect(p.schedule([])).resolves.not.toThrow();
  });
});

describe('attachSync meldet das Ergebnis (damit die Oberfläche „Erinnerungen sind aus“ zeigen kann)', () => {
  const mkStore = async () => {
    const store = createStore(memoryStorage(), { now: () => NOW });
    await store.saveSettings({ followup_enabled: false });
    return store;
  };
  it('onResult bekommt bei jedem Planen das Ergebnis, lastResult den letzten Stand', async () => {
    const p = fakePlatform({ perm: 'denied' });
    const store = await mkStore();
    const sync = attachSync(store, createNotifier(p), { now: () => NOW });
    const seen = [];
    sync.onResult((r) => seen.push(r));
    await store.createNote('x', new Date('2026-11-16T16:00:00Z'), false);
    await sync.idle();
    expect(seen.at(-1)).toMatchObject({ scheduled: 0, reason: 'no-permission', permission: 'denied' });
    expect(sync.lastResult()).toMatchObject({ reason: 'no-permission' });
    p.perm = 'granted';
    await sync.syncNow();
    expect(seen.at(-1)).toEqual({ scheduled: 1 });
  });
  it('onResult lässt sich abmelden; ein werfender Zuhörer stört nichts', async () => {
    const p = fakePlatform();
    const store = await mkStore();
    const sync = attachSync(store, createNotifier(p), { now: () => NOW });
    let calls = 0;
    const off = sync.onResult(() => { calls++; throw new Error('Zuhörer kaputt'); });
    await sync.syncNow();
    expect(calls).toBe(1);
    off();
    await sync.syncNow();
    expect(calls).toBe(1);
  });
  it('Fehler beim Planen wird als reason „error“ gemeldet', async () => {
    const p = fakePlatform({ failSchedule: true });
    const store = await mkStore();
    await store.createNote('x', new Date('2026-11-16T16:00:00Z'), false);
    const sync = attachSync(store, createNotifier(p), { now: () => NOW });
    await sync.syncNow();
    expect(sync.lastResult()).toMatchObject({ scheduled: 0, reason: 'error' });
  });
});

describe('capacitorPlatform: exakte Alarme (Android 12 darf keine Einstellungsseite in Endlosschleife öffnen)', () => {
  const fakeLN = (exact) => {
    const l = { scheduled: [], checkExactNotificationSetting: async () => ({ exact_alarm: exact }), schedule: async (o) => { l.scheduled.push(o); } };
    return l;
  };
  const entry = { id: 1, at: new Date('2026-11-16T16:00:00Z'), title: "Don't forget", body: 'x', kind: 'reminder', noteId: 'a' };
  it('Erlaubnis für exakte Alarme fehlt → ungenau planen (isExactNotification false), nichts öffnen', async () => {
    const ln = fakeLN('denied');
    await capacitorPlatform(ln).schedule([entry]);
    expect(ln.scheduled[0].notifications[0].isExactNotification).toBe(false);
  });
  it('Erlaubnis liegt vor → exakt', async () => {
    const ln = fakeLN('granted');
    await capacitorPlatform(ln).schedule([entry]);
    expect(ln.scheduled[0].notifications[0].isExactNotification).toBe(true);
  });
  it('Prüfung nicht verfügbar (z. B. iOS) → wie bisher exakt, kein Absturz', async () => {
    const ln = fakeLN('granted');
    ln.checkExactNotificationSetting = async () => { throw new Error('nicht verfügbar'); };
    await expect(capacitorPlatform(ln).schedule([entry])).resolves.not.toThrow();
    expect(ln.scheduled[0].notifications[0].isExactNotification).toBe(true);
  });
  it('Eintrag: Kanal, Zeit, allowWhileIdle, Aktionstyp nur bei Erinnerungen, Extras', async () => {
    const ln = fakeLN('granted');
    await capacitorPlatform(ln).schedule([entry, { ...entry, id: 1_000_000_001, kind: 'digest', noteId: undefined }]);
    const [a, b] = ln.scheduled[0].notifications;
    expect(a).toMatchObject({ id: 1, channelId: 'reminders', actionTypeId: 'reminder', extra: { noteId: 'a', kind: 'reminder' }, schedule: { allowWhileIdle: true } });
    expect(b.actionTypeId).toBeUndefined();
    expect(b.extra).toEqual({ noteId: null, kind: 'digest' });
  });
});

describe('noticeFor (Hinweis in der Hauptansicht)', () => {
  it('alles in Ordnung → kein Hinweis', () => {
    expect(noticeFor({ scheduled: 3 })).toBeNull();
    expect(noticeFor({ scheduled: 0 })).toBeNull();
    expect(noticeFor(null)).toBeNull();
    expect(noticeFor(undefined)).toBeNull();
  });
  it('blockiert', () => expect(noticeFor({ scheduled: 0, reason: 'no-permission', permission: 'denied' })).toBe('Erinnerungen sind aus: Benachrichtigungen sind blockiert.'));
  it('noch nicht erlaubt', () => {
    expect(noticeFor({ scheduled: 0, reason: 'no-permission', permission: 'prompt' })).toBe('Erinnerungen sind noch nicht erlaubt.');
    expect(noticeFor({ scheduled: 0, reason: 'no-permission' })).toBe('Erinnerungen sind noch nicht erlaubt.');
  });
  it('Planungsfehler', () => expect(noticeFor({ scheduled: 0, reason: 'error' })).toBe('Erinnerungen konnten nicht geplant werden.'));
});

describe('desktopPlatform (Windows-App: der Hauptprozess zeigt die Nachrichten)', () => {
  const fakeBridge = () => {
    const b = { calls: [], cb: null,
      schedule: async (l) => { b.calls.push(['schedule', l]); }, cancelAll: async () => { b.calls.push(['cancelAll']); },
      onAction: (cb) => { b.cb = cb; } };
    return b;
  };
  it('Berechtigung ist immer erteilt, exakte Zeiten sind kein Thema', async () => {
    const p = desktopPlatform(fakeBridge());
    expect(await p.checkPermission()).toBe('granted');
    expect(await p.requestPermission()).toBe('granted');
    expect(await p.exactAlarmAllowed()).toBe(true);
    expect(p.isNative).toBe(true);
  });
  it('schedule gibt Zeitpunkte als Millisekunden und nur die nötigen Felder weiter', async () => {
    const b = fakeBridge();
    await desktopPlatform(b).schedule([{ id: 7, at: new Date('2026-11-16T16:00:00Z'), title: "Don't forget", body: 'Mama', kind: 'reminder', noteId: 'a' },
      { id: 1_000_000_001, at: new Date('2026-11-17T07:00:00Z'), title: "Don't forget", body: 'Du hast noch 2 offene Erinnerungen.', kind: 'digest' }]);
    expect(b.calls[0][1]).toEqual([
      { id: 7, atMs: Date.parse('2026-11-16T16:00:00Z'), title: "Don't forget", body: 'Mama', kind: 'reminder', noteId: 'a' },
      { id: 1_000_000_001, atMs: Date.parse('2026-11-17T07:00:00Z'), title: "Don't forget", body: 'Du hast noch 2 offene Erinnerungen.', kind: 'digest', noteId: null },
    ]);
  });
  it('cancelAll und Aktionen werden durchgereicht', async () => {
    const b = fakeBridge();
    const p = desktopPlatform(b);
    await p.cancelAll();
    expect(b.calls).toEqual([['cancelAll']]);
    const seen = [];
    p.onAction((id, extra) => seen.push([id, extra]));
    b.cb('tap', { noteId: 'a', kind: 'reminder' });
    expect(seen).toEqual([['tap', { noteId: 'a', kind: 'reminder' }]]);
  });
  it('mit dem Notifier: Plan landet beim Hauptprozess, ohne Berechtigungsabfrage', async () => {
    const b = fakeBridge();
    const n = createNotifier(desktopPlatform(b));
    const r = await n.sync([note(1, 'Mama', '2026-11-16T16:00:00.000Z')], settings, NOW);
    expect(r).toEqual({ scheduled: 1 });
    expect(kinds({ calls: b.calls })).toEqual(['cancelAll', 'schedule']);
  });
  it('defaultPlatform nimmt die Desktop-Brücke, wenn es sie gibt', async () => {
    const b = fakeBridge();
    globalThis.dtfDesktop = b;
    try {
      const p = defaultPlatform();
      await p.cancelAll();
      expect(b.calls).toEqual([['cancelAll']]);
    } finally { delete globalThis.dtfDesktop; }
  });
});

describe('Nachholfenster der Plattform', () => {
  it('Plattform mit catchUpMs bekommt auch überfällige Erinnerungen, andere nicht', async () => {
    const overdue = [note(1, 'verpasst', '2026-11-16T07:00:00.000Z')]; // 2 h vor NOW
    const withWindow = fakePlatform({ catchUpMs: 6 * 3600e3 });
    await createNotifier(withWindow).sync(overdue, settings, NOW);
    expect(withWindow.calls.at(-1)[1].map((x) => x.body)).toEqual(['verpasst']);
    const without = fakePlatform();
    const r = await createNotifier(without).sync(overdue, settings, NOW);
    expect(r).toEqual({ scheduled: 0 });
  });
  it('die Windows-Plattform hat ein Fenster von 6 Stunden', () => {
    expect(desktopPlatform({ schedule: async () => {}, cancelAll: async () => {}, onAction: () => {} }).catchUpMs).toBe(6 * 3600e3);
  });
});
