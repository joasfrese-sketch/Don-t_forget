import { describe, it, expect } from 'vitest';
import { memoryStorage } from '../src/lib/storage.js';
import { createStore } from '../src/lib/store.js';

const T0 = new Date('2026-11-16T09:00:00Z');
const mk = (storage = memoryStorage(), now = () => T0) => ({ storage, store: createStore(storage, { now }) });

describe('Einstellungen', () => {
  it('Vorgaben bei leerem Speicher', async () => {
    const { store } = mk();
    expect(await store.getSettings()).toMatchObject({
      default_time: '17:00', followup_enabled: true, followup_hours: 5, evening_from: '18:00', morning_at: '08:00', ai_key: '',
    });
    expect((await store.getSettings()).timezone).toBeTruthy();
  });
  it('speichern und lesen', async () => {
    const { store, storage } = mk();
    await store.saveSettings({ default_time: '16:30', followup_hours: 3, ai_key: 'sk-test' });
    const s = await createStore(storage).getSettings();
    expect([s.default_time, s.followup_hours, s.ai_key]).toEqual(['16:30', 3, 'sk-test']);
  });
  it('unbekannte Felder werden ignoriert, Zeiten auf HH:MM gekürzt', async () => {
    const { store } = mk();
    const s = await store.saveSettings({ hacker: 1, default_time: '17:00:00' });
    expect(s.hacker).toBeUndefined();
    expect(s.default_time).toBe('17:00');
  });
  it('kaputtes JSON → Vorgaben statt Absturz', async () => {
    const storage = memoryStorage({ 'dtf.settings': '{kaputt', 'dtf.notes': 'nein' });
    const { store } = mk(storage);
    expect((await store.getSettings()).default_time).toBe('17:00');
    expect(await store.listNotes()).toEqual([]);
  });
  it('falsche Typen → Vorgaben für das jeweilige Feld', async () => {
    const storage = memoryStorage({ 'dtf.settings': JSON.stringify({ followup_hours: 'viele', followup_enabled: 'ja', default_time: 5 }), 'dtf.notes': JSON.stringify({ a: 1 }) });
    const { store } = mk(storage);
    const s = await store.getSettings();
    expect([s.followup_hours, s.followup_enabled, s.default_time]).toEqual([5, true, '17:00']);
    expect(await store.listNotes()).toEqual([]);
  });
});

describe('Zeitzone folgt immer dem Gerät', () => {
  it('eine früher gespeicherte Zone wird ignoriert (nach einer Reise)', async () => {
    const storage = memoryStorage({ 'dtf.settings': JSON.stringify({ timezone: 'Europe/Berlin', default_time: '16:00' }) });
    const store = createStore(storage, { tz: 'Asia/Tokyo' });
    const s = await store.getSettings();
    expect([s.timezone, s.default_time]).toEqual(['Asia/Tokyo', '16:00']);
  });
  it('saveSettings speichert keine Zone und gibt die Gerätezone zurück', async () => {
    const storage = memoryStorage();
    const store = createStore(storage, { tz: 'Asia/Tokyo' });
    const s = await store.saveSettings({ timezone: 'UTC', default_time: '18:00' });
    expect(s.timezone).toBe('Asia/Tokyo');
    expect(JSON.parse(await storage.get('dtf.settings')).timezone).toBeUndefined();
    expect((await createStore(storage, { tz: 'America/New_York' }).getSettings()).timezone).toBe('America/New_York');
  });
});

describe('Notizen', () => {
  it('anlegen: getrimmter Text, nid zählt hoch, Status offen', async () => {
    const { store } = mk();
    const a = await store.createNote('  Mama anrufen ', new Date('2026-11-16T16:00:00Z'), false);
    const b = await store.createNote('Reifen', new Date('2026-11-17T16:00:00Z'), true);
    expect([a.text, a.status, a.custom_time, a.remind_at]).toEqual(['Mama anrufen', 'open', false, '2026-11-16T16:00:00.000Z']);
    expect([a.nid, b.nid]).toEqual([1, 2]);
    expect(a.id).not.toBe(b.id);
    expect(b.custom_time).toBe(true);
  });
  it('leerer Text wird abgelehnt', async () => {
    const { store } = mk();
    await expect(store.createNote('   ', T0, false)).rejects.toThrow('Text darf nicht leer sein');
    expect(await store.listNotes()).toEqual([]);
  });
  it('Liste nach Erinnerungszeit sortiert', async () => {
    const { store } = mk();
    await store.createNote('spät', new Date('2026-11-20T10:00:00Z'), false);
    await store.createNote('früh', new Date('2026-11-17T10:00:00Z'), false);
    expect((await store.listNotes()).map((n) => n.text)).toEqual(['früh', 'spät']);
  });
  it('markDone und reopen', async () => {
    const { store } = mk();
    const n = await store.createNote('x', new Date('2026-11-16T16:00:00Z'), false);
    await store.markDone(n.id);
    expect((await store.listNotes())[0].status).toBe('done');
    await store.reopen(n.id, new Date('2026-11-18T16:00:00Z'));
    const r = (await store.listNotes())[0];
    expect([r.status, r.remind_at]).toEqual(['open', '2026-11-18T16:00:00.000Z']);
  });
  it('snooze = jetzt + 1 Stunde (mit eigener Uhr)', async () => {
    const { store } = mk();
    const n = await store.createNote('x', new Date('2026-11-16T08:00:00Z'), false);
    await store.snooze(n.id);
    expect((await store.listNotes())[0].remind_at).toBe('2026-11-16T10:00:00.000Z');
  });
  it('updateNote ändert Text und Zeit, leerer Text wird abgelehnt', async () => {
    const { store } = mk();
    const n = await store.createNote('alt', T0, false);
    await store.updateNote(n.id, { text: ' neu ', remind_at: '2026-11-19T10:00:00.000Z', custom_time: true });
    const u = (await store.listNotes())[0];
    expect([u.text, u.remind_at, u.custom_time]).toEqual(['neu', '2026-11-19T10:00:00.000Z', true]);
    await expect(store.updateNote(n.id, { text: ' ' })).rejects.toThrow('Text darf nicht leer sein');
  });
  it('löschen; nid wird nie wiederverwendet', async () => {
    const { store } = mk();
    const a = await store.createNote('a', T0, false);
    await store.deleteNote(a.id);
    const b = await store.createNote('b', T0, false);
    expect(b.nid).toBe(2);
    expect((await store.listNotes()).map((n) => n.text)).toEqual(['b']);
  });
  it('unbekannte ID: kein Absturz, nichts ändert sich', async () => {
    const { store } = mk();
    await store.createNote('a', T0, false);
    await expect(store.markDone('gibt-es-nicht')).resolves.toBeUndefined();
    await expect(store.deleteNote('gibt-es-nicht')).resolves.toBeUndefined();
    expect(await store.listNotes()).toHaveLength(1);
  });
  it('zwei Stores auf demselben Speicher sehen dieselben Daten', async () => {
    const { store, storage } = mk();
    await store.createNote('geteilt', T0, false);
    expect((await createStore(storage).listNotes()).map((n) => n.text)).toEqual(['geteilt']);
  });
  it('gleichzeitige Anlegen verlieren nichts', async () => {
    const { store } = mk();
    await Promise.all(['a', 'b', 'c', 'd'].map((t) => store.createNote(t, T0, false)));
    const list = await store.listNotes();
    expect(list.map((n) => n.text).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(new Set(list.map((n) => n.nid)).size).toBe(4);
  });
});

describe('onChange', () => {
  it('meldet jede Änderung und lässt sich abmelden', async () => {
    const { store } = mk();
    let calls = 0;
    const off = store.onChange(() => { calls++; });
    const n = await store.createNote('x', T0, false);
    await store.markDone(n.id);
    await store.saveSettings({ default_time: '18:00' });
    expect(calls).toBe(3);
    off();
    await store.deleteNote(n.id);
    expect(calls).toBe(3);
  });
});
