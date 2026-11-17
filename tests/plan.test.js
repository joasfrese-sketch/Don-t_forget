import { describe, it, expect } from 'vitest';
import { followupTime } from '../src/lib/time.js';
import { planNotifications } from '../src/lib/plan.js';

const B = 'Europe/Berlin';
const ft = (iso, o = {}) => followupTime(new Date(iso), o.tz ?? B, o.evening ?? '18:00', o.morning ?? '08:00', o.hours ?? 5).toISOString();

describe('followupTime (gleiche Regeln wie früher in der Datenbank)', () => {
  it('14:00 Berlin → 19:00 Berlin', () => expect(ft('2026-11-16T13:00:00Z')).toBe('2026-11-16T18:00:00.000Z'));
  it('18:00 und 22:00 → nächster Tag 08:00', () => {
    expect(ft('2026-11-16T17:00:00Z')).toBe('2026-11-17T07:00:00.000Z');
    expect(ft('2026-11-16T21:00:00Z')).toBe('2026-11-17T07:00:00.000Z');
  });
  it('00:30 und 03:00 → selber Tag 08:00', () => {
    expect(ft('2026-11-16T23:30:00Z')).toBe('2026-11-17T07:00:00.000Z');
    expect(ft('2026-11-17T02:00:00Z')).toBe('2026-11-17T07:00:00.000Z');
  });
  it('genau 08:00 zählt als Tag (+ Stunden)', () => expect(ft('2026-11-16T07:00:00Z')).toBe('2026-11-16T12:00:00.000Z'));
  it('Ergebnis nach Mitternacht (12 h) → 08:00; 24 h bleibt; 20 h bleibt', () => {
    expect(ft('2026-11-16T13:00:00Z', { hours: 12 })).toBe('2026-11-17T07:00:00.000Z');
    expect(ft('2026-11-16T13:00:00Z', { hours: 24 })).toBe('2026-11-17T13:00:00.000Z');
    expect(ft('2026-11-16T13:00:00Z', { hours: 20 })).toBe('2026-11-17T09:00:00.000Z');
  });
  it('Zeitumstellung: 22:00 Berlin (MESZ) → 08:00 am nächsten Tag (MEZ)', () => {
    expect(ft('2026-10-24T20:00:00Z')).toBe('2026-10-25T07:00:00.000Z');
  });
  it('eigene Werte: 3 Stunden, abends ab 20:00, morgens 07:30', () => {
    const o = { hours: 3, evening: '20:00', morning: '07:30' };
    expect(ft('2026-11-16T13:00:00Z', o)).toBe('2026-11-16T16:00:00.000Z');
    expect(ft('2026-11-16T19:30:00Z', o)).toBe('2026-11-17T06:30:00.000Z');
  });
  it('andere Zeitzone (UTC)', () => {
    expect(ft('2026-11-16T14:00:00Z', { tz: 'UTC' })).toBe('2026-11-16T19:00:00.000Z');
  });
});

const settings = { default_time: '17:00', timezone: B, followup_enabled: true, followup_hours: 5, evening_from: '18:00', morning_at: '08:00' };
const NOW = new Date('2026-11-16T09:00:00Z'); // 10:00 Berlin
let nidCounter = 0;
const note = (text, remind_at, o = {}) => ({ id: 'id-' + text, nid: ++nidCounter, text, remind_at, custom_time: false, status: 'open', ...o });
const plan = (notes, s = settings, now = NOW) => planNotifications(notes, s, now);
const reminders = (p) => p.filter((x) => x.kind === 'reminder');
const digests = (p) => p.filter((x) => x.kind === 'digest');

describe('planNotifications – Erinnerungen', () => {
  it('eine Meldung pro offener Notiz in der Zukunft, mit nid als ID und noteId', () => {
    const n = note('Mama anrufen', '2026-11-16T16:00:00.000Z');
    const r = reminders(plan([n]));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: n.nid, kind: 'reminder', title: "Don't forget", body: 'Mama anrufen', noteId: n.id });
    expect(r[0].at.toISOString()).toBe('2026-11-16T16:00:00.000Z');
  });
  it('vergangene Erinnerung wird nicht erneut geplant (Nachfassen schon), erledigte entfallen ganz', () => {
    const p = plan([note('alt', '2026-11-16T08:00:00.000Z'), note('fertig', '2026-11-16T16:00:00.000Z', { status: 'done' })]);
    expect(reminders(p)).toEqual([]);                  // weder die vergangene noch die erledigte Notiz bekommt eine Erinnerung
    expect(digests(p).map((d) => d.body)).toEqual(['Du hast noch 1 offene Erinnerung. Schau in die App, was wann dran ist.']); // nur „alt“ wird nachgefasst
  });
  it('langer Text wird auf 180 Zeichen gekürzt', () => {
    const r = reminders(plan([note('x'.repeat(300), '2026-11-16T16:00:00.000Z')]))[0];
    expect(r.body).toHaveLength(180);
    expect(r.body.endsWith('…')).toBe(true);
  });
});

describe('planNotifications – Nachfassen', () => {
  it('Erinnerung um 14:00 Berlin → Hinweis um 19:00 mit Anzahl 1', () => {
    const n = note('a', '2026-11-16T13:00:00.000Z');
    const d = digests(plan([n]));
    expect(d).toHaveLength(1);
    expect(d[0].at.toISOString()).toBe('2026-11-16T18:00:00.000Z');
    expect(d[0].body).toBe('Du hast noch 1 offene Erinnerung. Schau in die App, was wann dran ist.');
  });
  it('schon gekommene Erinnerung, Nachfassen liegt noch vor uns → wird geplant', () => {
    const n = note('a', '2026-11-16T07:30:00.000Z'); // 08:30 Berlin, vorbei; Nachfassen 13:30 Berlin = 12:30Z
    const d = digests(plan([n]));
    expect(d.map((x) => x.at.toISOString())).toEqual(['2026-11-16T12:30:00.000Z']);
  });
  it('Nachfass-Zeitpunkt schon vorbei → nichts', () => {
    expect(digests(plan([note('a', '2026-11-15T10:00:00.000Z')]))).toEqual([]);
  });
  it('mehrere Notizen mit gleichem Zeitpunkt ergeben einen gemeinsamen Hinweis (Mehrzahl)', () => {
    const d = digests(plan([note('a', '2026-11-16T13:00:00.000Z'), note('b', '2026-11-16T13:00:20.000Z'), note('c', '2026-11-16T13:00:40.000Z')]));
    expect(d).toHaveLength(1);
    expect(d[0].body).toBe('Du hast noch 3 offene Erinnerungen. Schau in die App, was wann dran ist.');
  });
  it('eine später fällige Notiz bekommt ihren eigenen Hinweis; Zähler zählt nur, was bis dahin fällig ist', () => {
    const early = note('früh', '2026-11-16T13:00:00.000Z'); // Hinweis 18:00Z
    const late = note('spät', '2026-11-16T14:00:00.000Z'); // 15:00 Berlin, Hinweis 20:00 Berlin = 19:00Z
    const future = note('zukunft', '2026-11-16T19:30:00.000Z'); // erst nach beiden Hinweisen fällig
    const d = digests(plan([early, late, future]));
    expect(d.map((x) => [x.at.toISOString(), x.body.match(/\d+/)[0]])).toEqual([
      ['2026-11-16T18:00:00.000Z', '2'], // früh und spät sind um 18:00Z beide schon gekommen und offen
      ['2026-11-16T19:00:00.000Z', '2'],
      ['2026-11-17T07:00:00.000Z', '3'],
    ]);
  });
  it('Nachfassen ausgeschaltet → keine Hinweise', () => {
    expect(digests(plan([note('a', '2026-11-16T13:00:00.000Z')], { ...settings, followup_enabled: false }))).toEqual([]);
  });
  it('nach „Erledigt“ entfällt der Hinweis (Neuberechnung statt Merker)', () => {
    const n = note('a', '2026-11-16T13:00:00.000Z');
    expect(digests(plan([n]))).toHaveLength(1);
    expect(plan([{ ...n, status: 'done' }])).toEqual([]);
  });
  it('nach „Später“ wandert Erinnerung und Hinweis mit', () => {
    const n = note('a', '2026-11-16T13:00:00.000Z');
    const later = { ...n, remind_at: '2026-11-16T14:00:00.000Z' };
    expect(reminders(plan([later]))[0].at.toISOString()).toBe('2026-11-16T14:00:00.000Z');
    expect(digests(plan([later]))[0].at.toISOString()).toBe('2026-11-16T19:00:00.000Z');
  });
  it('nur offene zählen, erledigte nicht', () => {
    const d = digests(plan([note('a', '2026-11-16T13:00:00.000Z'), note('b', '2026-11-16T13:00:00.000Z', { status: 'done' })]));
    expect(d[0].body).toContain('1 offene Erinnerung.');
  });
  it('eigene Nachfass-Werte (3 Stunden)', () => {
    const d = digests(plan([note('a', '2026-11-16T10:00:00.000Z')], { ...settings, followup_hours: 3 })); // 11:00 Berlin → 14:00
    expect(d[0].at.toISOString()).toBe('2026-11-16T13:00:00.000Z');
  });
});

describe('planNotifications – nie in der Vergangenheit', () => {
  it('Hinweis, dessen Minute schon begonnen hat, wird nicht geplant (sonst feuert Android ihn sofort und doppelt)', () => {
    // Erinnerung 07:00:30Z (08:00:30 Berlin) → Nachfassen 12:00:30Z; jetzt ist 12:00:10Z → die Minute 12:00 ist schon da
    const n = note('Sekunden', '2026-11-16T07:00:30.000Z');
    const p = planNotifications([n], settings, new Date('2026-11-16T12:00:10Z'));
    expect(digests(p)).toEqual([]);
    expect(p.every((x) => x.at.getTime() > new Date('2026-11-16T12:00:10Z').getTime())).toBe(true);
  });
  it('Hinweis in der nächsten Minute wird geplant', () => {
    const n = note('Sekunden', '2026-11-16T07:01:30.000Z'); // Nachfassen 12:01:30Z → Minute 12:01
    const d = digests(planNotifications([n], settings, new Date('2026-11-16T12:00:10Z')));
    expect(d.map((x) => x.at.toISOString())).toEqual(['2026-11-16T12:01:00.000Z']);
  });
  it('nichts im Plan liegt jemals vor „jetzt“ (zufällige Sekunden)', () => {
    const notes = Array.from({ length: 40 }, (_, i) => note('n' + i, new Date(Date.UTC(2026, 10, 16, 6, i * 7, (i * 13) % 60)).toISOString()));
    for (const sec of [0, 1, 29, 30, 59]) {
      const nowT = new Date(Date.UTC(2026, 10, 16, 12, 0, sec));
      expect(planNotifications(notes, settings, nowT).every((x) => x.at.getTime() > nowT.getTime())).toBe(true);
    }
  });
});

describe('planNotifications – Nachholfenster (Windows-App: verpasste Erinnerungen nach Neustart des PCs)', () => {
  const SIX = 6 * 3600e3;
  const noFollowup = { ...settings, followup_enabled: false };
  it('ohne Fenster (Android, Browser) bleibt alles wie bisher: nichts aus der Vergangenheit', () => {
    expect(reminders(planNotifications([note('alt', '2026-11-16T08:00:00.000Z')], noFollowup, NOW))).toEqual([]);
    expect(reminders(planNotifications([note('alt', '2026-11-16T08:00:00.000Z')], noFollowup, NOW, { pastMs: 0 }))).toEqual([]);
  });
  it('mit Fenster: offene Erinnerung bis 6 Stunden zurück ist dabei, ältere nicht', () => {
    const p = planNotifications([note('vor 1 h', '2026-11-16T08:00:00.000Z'), note('vor 5 h', '2026-11-16T04:00:00.000Z'), note('vor 7 h', '2026-11-16T02:00:00.000Z')], noFollowup, NOW, { pastMs: SIX });
    expect(reminders(p).map((x) => x.body)).toEqual(['vor 5 h', 'vor 1 h']);
  });
  it('erledigte Notizen sind auch im Fenster nicht dabei', () => {
    const p = planNotifications([note('fertig', '2026-11-16T08:00:00.000Z', { status: 'done' })], noFollowup, NOW, { pastMs: SIX });
    expect(p).toEqual([]);
  });
  it('genau auf der Grenze (6 Stunden) zählt nicht mehr dazu', () => {
    const p = planNotifications([note('grenze', new Date(NOW.getTime() - SIX).toISOString())], noFollowup, NOW, { pastMs: SIX });
    expect(reminders(p)).toEqual([]);
  });
  it('auch ein verpasster Nachfass-Hinweis (Minute noch im Fenster) ist dabei, ein zu alter nicht', () => {
    // Erinnerung 08:00Z (09:00 Berlin) → Hinweis 14:00 Berlin = 13:00Z; jetzt 15:00Z → 2 h her
    const d = digests(planNotifications([note('a', '2026-11-16T08:00:00.000Z')], settings, new Date('2026-11-16T15:00:00Z'), { pastMs: SIX }));
    expect(d.map((x) => x.at.toISOString())).toEqual(['2026-11-16T13:00:00.000Z']);
    const old = digests(planNotifications([note('a', '2026-11-16T08:00:00.000Z')], settings, new Date('2026-11-16T20:30:00Z'), { pastMs: SIX }));
    expect(old).toEqual([]);
  });
  it('sortiert nach Zeit, Vergangenes zuerst', () => {
    const p = planNotifications([note('später', '2026-11-16T16:00:00.000Z'), note('früher', '2026-11-16T08:00:00.000Z')], noFollowup, NOW, { pastMs: SIX });
    expect(p.map((x) => x.body)).toEqual(['früher', 'später']);
  });
});

describe('planNotifications – Allgemeines', () => {
  it('IDs sind eindeutig, Hinweis-IDs liegen über 1 Milliarde, sortiert nach Zeit', () => {
    const p = plan([note('a', '2026-11-16T13:00:00.000Z'), note('b', '2026-11-17T13:00:00.000Z')]);
    expect(new Set(p.map((x) => x.id)).size).toBe(p.length);
    expect(digests(p).every((d) => d.id >= 1_000_000_000)).toBe(true);
    expect(reminders(p).every((r) => r.id < 1_000_000_000)).toBe(true);
    expect(p.map((x) => x.at.getTime())).toEqual([...p.map((x) => x.at.getTime())].sort((a, b) => a - b));
  });
  it('höchstens 60 Einträge, die frühesten bleiben', () => {
    const notes = Array.from({ length: 80 }, (_, i) => note('n' + i, new Date(Date.UTC(2026, 10, 17, 8, i)).toISOString()));
    const p = plan(notes, { ...settings, followup_enabled: false });
    expect(p).toHaveLength(60);
    expect(reminders(p)[0].body).toBe('n0');
    expect(reminders(p).at(-1).body).toBe('n59');
  });
  it('leere Liste', () => expect(plan([])).toEqual([]));
  it('ungültiges Datum einer Notiz bringt nichts zum Absturz', () => {
    expect(() => plan([note('kaputt', 'gestern')])).not.toThrow();
    expect(plan([note('kaputt', 'gestern')])).toEqual([]);
  });
});
