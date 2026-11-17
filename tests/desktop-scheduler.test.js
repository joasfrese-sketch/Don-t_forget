import { describe, it, expect } from 'vitest';
import { createScheduler } from '../desktop/scheduler.cjs';

const H = 3600e3;
const T0 = Date.UTC(2026, 10, 17, 12, 0, 0);
const entry = (id, atMs, o = {}) => ({ id, atMs, title: "Don't forget", body: 'b' + id, kind: 'reminder', noteId: 'n' + id, ...o });

function make({ shown = [], now = T0, catchUpMs } = {}) {
  const st = { now, shown: [...shown], saved: [], displayed: [] };
  const s = createScheduler({
    now: () => st.now,
    show: (e) => st.displayed.push(e.id),
    loadShown: () => st.shown,
    saveShown: (keys) => { st.shown = [...keys]; st.saved.push([...keys]); },
    ...(catchUpMs ? { catchUpMs } : {}),
  });
  return { s, st };
}

describe('Planung und Auslösen', () => {
  it('zeigt eine fällige Erinnerung genau einmal', () => {
    const { s, st } = make();
    s.set([entry(1, T0 + 60_000)]);
    s.tick();
    expect(st.displayed).toEqual([]);
    st.now = T0 + 61_000;
    s.tick(); s.tick(); s.tick();
    expect(st.displayed).toEqual([1]);
  });
  it('zeigt Zukünftiges nicht', () => {
    const { s, st } = make();
    s.set([entry(1, T0 + 2 * H)]);
    s.tick();
    expect(st.displayed).toEqual([]);
  });
  it('Reihenfolge nach Zeit', () => {
    const { s, st } = make();
    s.set([entry(2, T0 + 20_000), entry(1, T0 + 10_000)]);
    st.now = T0 + 30_000;
    s.tick();
    expect(st.displayed).toEqual([1, 2]);
  });
  it('set ersetzt den Plan: Entferntes (erledigt/gelöscht) erscheint nie', () => {
    const { s, st } = make();
    s.set([entry(1, T0 + 60_000), entry(2, T0 + 60_000)]);
    s.set([entry(2, T0 + 60_000)]); // Erinnerung 1 wurde in der App erledigt
    st.now = T0 + 61_000;
    s.tick();
    expect(st.displayed).toEqual([2]);
  });
  it('cancelAll entfernt alles', () => {
    const { s, st } = make();
    s.set([entry(1, T0 + 60_000)]);
    s.cancelAll();
    st.now = T0 + 61_000;
    s.tick();
    expect(st.displayed).toEqual([]);
  });
  it('verschobene Erinnerung (gleiche ID, neue Zeit) kommt zur neuen Zeit, nicht zur alten', () => {
    const { s, st } = make();
    s.set([entry(1, T0 + 60_000)]);
    s.set([entry(1, T0 + 3_600_000)]);
    st.now = T0 + 120_000;
    s.tick();
    expect(st.displayed).toEqual([]);
    st.now = T0 + 3_601_000;
    s.tick();
    expect(st.displayed).toEqual([1]);
  });
});

describe('Verpasstes nach Ruhezustand', () => {
  it('Erinnerung bis 6 Stunden zurück kommt nach, einmal', () => {
    const { s, st } = make();
    s.set([entry(1, T0 - 5 * H)]);
    s.tick(); s.tick();
    expect(st.displayed).toEqual([1]);
  });
  it('ältere als 6 Stunden werden still verworfen', () => {
    const { s, st } = make();
    s.set([entry(1, T0 - 7 * H), entry(2, T0 - 5 * H)]);
    s.tick();
    expect(st.displayed).toEqual([2]);
  });
  it('PC war 2 Stunden im Ruhezustand: alles Verpasste kommt, in zeitlicher Reihenfolge', () => {
    const { s, st } = make();
    s.set([entry(1, T0 + 10 * 60_000), entry(2, T0 + 30 * 60_000), entry(3, T0 + 5 * H)]);
    st.now = T0 + 2 * H;
    s.tick();
    expect(st.displayed).toEqual([1, 2]);
  });
  it('eigene Grenze', () => {
    const { s, st } = make({ catchUpMs: 60_000 });
    s.set([entry(1, T0 - 2 * 60_000), entry(2, T0 - 30_000)]);
    s.tick();
    expect(st.displayed).toEqual([2]);
  });
});

describe('Gemerktes (nach Neustart der App nichts doppelt)', () => {
  it('Angezeigtes wird gespeichert', () => {
    const { s, st } = make();
    s.set([entry(1, T0 - 1000)]);
    s.tick();
    expect(st.shown).toContain(`1@${T0 - 1000}`);
  });
  it('neuer Planer mit gespeicherten Schlüsseln zeigt es nicht noch einmal', () => {
    const first = make();
    first.s.set([entry(1, T0 - 1000)]);
    first.s.tick();
    const second = make({ shown: first.st.shown });
    second.s.set([entry(1, T0 - 1000)]);
    second.s.tick();
    expect(second.st.displayed).toEqual([]);
  });
  it('gleiche ID mit anderer Zeit gilt als neue Erinnerung', () => {
    const first = make();
    first.s.set([entry(1, T0 - 1000)]);
    first.s.tick();
    const second = make({ shown: first.st.shown });
    second.s.set([entry(1, T0 - 500)]);
    second.s.tick();
    expect(second.st.displayed).toEqual([1]);
  });
  it('Gemerktes wird aufgeräumt: alte Schlüssel (älter als die Nachhol-Grenze) fliegen raus', () => {
    const old = `9@${T0 - 10 * H}`;
    const { s, st } = make({ shown: [old] });
    s.set([entry(1, T0 + 60_000)]);
    expect(st.shown).not.toContain(old);
  });
  it('Kaputtes Gemerktes (kein Array, falsche Typen) führt nicht zum Absturz', () => {
    for (const bad of [null, undefined, 'x', 5, { a: 1 }, [1, null, {}]]) {
      const st = { displayed: [] };
      const s = createScheduler({ now: () => T0, show: (e) => st.displayed.push(e.id), loadShown: () => bad, saveShown: () => {} });
      s.set([entry(1, T0 - 1000)]);
      expect(() => s.tick()).not.toThrow();
      expect(st.displayed).toEqual([1]);
    }
  });
  it('werfendes Laden/Speichern/Zeigen stört nicht', () => {
    const shownCalls = [];
    const s = createScheduler({
      now: () => T0, show: (e) => { shownCalls.push(e.id); if (e.id === 1) throw new Error('Toast kaputt'); },
      loadShown: () => { throw new Error('Datei kaputt'); }, saveShown: () => { throw new Error('Platte voll'); },
    });
    s.set([entry(1, T0 - 1000), entry(2, T0 - 500)]);
    expect(() => s.tick()).not.toThrow();
    expect(shownCalls).toEqual([1, 2]); // ein Fehler bei einer Nachricht verhindert die nächste nicht
  });
});

describe('Eingaben', () => {
  it('ungültige Einträge werden ignoriert', () => {
    const { s, st } = make();
    s.set([null, {}, { id: 1 }, { id: 2, atMs: 'bald' }, entry(3, T0 - 1000), 'x']);
    s.tick();
    expect(st.displayed).toEqual([3]);
  });
  it('set mit Nicht-Liste: leerer Plan', () => {
    const { s, st } = make();
    s.set(undefined); s.set(null); s.set('x');
    s.tick();
    expect(st.displayed).toEqual([]);
  });
});
