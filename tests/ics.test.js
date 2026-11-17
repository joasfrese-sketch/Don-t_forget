import { describe, it, expect } from 'vitest';
import { buildIcs } from '../src/lib/ics.js';

const n = (o) => ({ id: 'a1', text: 'Reifen wechseln', remind_at: '2026-11-18T16:00:00.000Z', status: 'open', ...o });

describe('Kalender-Export (.ics)', () => {
  it('erzeugt je offener Notiz einen Termin mit Alarm zur Erinnerungszeit', () => {
    const ics = buildIcs([n()], new Date('2026-11-17T10:00:00Z'));
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('SUMMARY:Reifen wechseln');
    expect(ics).toContain('DTSTART:20261118T160000Z');
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics).toContain('TRIGGER;VALUE=DATE-TIME:20261118T160000Z');
    expect(ics).toContain('UID:a1@dontforget.app');
    expect(ics.split('\r\n').length).toBeGreaterThan(10);
  });
  it('lässt erledigte und vergangene Notizen weg', () => {
    const ics = buildIcs([n({ status: 'done' }), n({ id: 'b', remind_at: '2026-11-16T10:00:00.000Z' })], new Date('2026-11-17T10:00:00Z'));
    expect(ics).not.toContain('BEGIN:VEVENT');
  });
  it('maskiert Sonderzeichen und Zeilenumbrüche', () => {
    const ics = buildIcs([n({ text: 'a, b; c\\d\ne' })], new Date('2026-11-17T10:00:00Z'));
    expect(ics).toContain('SUMMARY:a\\, b\; c\\\\d\\ne');
  });
});
