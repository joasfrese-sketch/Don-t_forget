import { describe, it, expect } from 'vitest';
import { resolveParsed } from '../src/lib/resolve-parsed.js';

const settings = { default_time: '17:00', timezone: 'Europe/Berlin' };
const NOW = new Date('2026-11-16T09:00:00Z'); // 10:00 Berlin, Montag
const one = (n, now = NOW) => resolveParsed([{ text: 'x', ...n }], now, settings)[0];
const iso = (r) => r.remindAt.toISOString();

describe('resolveParsed', () => {
  it('Datum und Uhrzeit', () => {
    const r = one({ date: '2026-11-20', time: '09:00' });
    expect([iso(r), r.custom, r.adjusted]).toEqual(['2026-11-20T08:00:00.000Z', true, false]);
  });
  it('nur Datum → Standardzeit an diesem Tag', () => {
    const r = one({ date: '2026-11-20', time: null });
    expect([iso(r), r.custom, r.adjusted]).toEqual(['2026-11-20T16:00:00.000Z', true, false]);
  });
  it('nur Uhrzeit, noch heute', () => {
    const r = one({ date: null, time: '18:30' });
    expect([iso(r), r.custom]).toEqual(['2026-11-16T17:30:00.000Z', true]);
  });
  it('nur Uhrzeit, schon vorbei → morgen', () => {
    const r = one({ date: null, time: '08:00' });
    expect([iso(r), r.custom, r.adjusted]).toEqual(['2026-11-17T07:00:00.000Z', true, false]);
  });
  it('weder Datum noch Uhrzeit → Standard-Erinnerung', () => {
    const r = one({ date: null, time: null });
    expect([iso(r), r.custom, r.adjusted]).toEqual(['2026-11-16T16:00:00.000Z', false, false]);
  });
  it('vergangenes Datum → nächste Standardzeit, markiert', () => {
    const r = one({ date: '2026-11-10', time: '09:00' });
    expect([iso(r), r.custom, r.adjusted]).toEqual(['2026-11-16T16:00:00.000Z', false, true]);
  });
  it('heute mit schon vergangener Uhrzeit → angepasst', () => {
    const r = one({ date: '2026-11-16', time: '08:00' });
    expect([iso(r), r.adjusted]).toEqual(['2026-11-16T16:00:00.000Z', true]);
  });
  it('nur Datum = heute, Standardzeit schon vorbei → nächste Standardzeit, markiert', () => {
    const r = one({ date: '2026-11-16', time: null }, new Date('2026-11-16T17:30:00Z'));
    expect([iso(r), r.adjusted]).toEqual(['2026-11-17T16:00:00.000Z', true]);
  });
  it('Zeitumstellung: 09:00 am 29.03.2026 (Sommerzeit beginnt) = 07:00Z', () => {
    expect(iso(one({ date: '2026-03-29', time: '09:00' }, new Date('2026-03-01T09:00:00Z')))).toBe('2026-03-29T07:00:00.000Z');
  });
  it('nur Uhrzeit, schon vorbei, über die Zeitumstellung: morgen 08:00 Ortszeit (Ende Sommerzeit)', () => {
    // Sa 24.10.2026 22:00 Berlin; 08:00 ist vorbei → So 25.10. 08:00 MEZ = 07:00Z (nicht 06:00Z)
    expect(iso(one({ date: null, time: '08:00' }, new Date('2026-10-24T20:00:00Z')))).toBe('2026-10-25T07:00:00.000Z');
  });
  it('Reihenfolge und Text bleiben erhalten', () => {
    const r = resolveParsed([{ text: 'a', date: null, time: null }, { text: 'b', date: '2026-11-20', time: null }], NOW, settings);
    expect(r.map((x) => x.text)).toEqual(['a', 'b']);
  });
  it('leere Liste', () => expect(resolveParsed([], NOW, settings)).toEqual([]));
});
