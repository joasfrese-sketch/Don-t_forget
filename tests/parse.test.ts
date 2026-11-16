import { describe, it, expect } from 'vitest';
import { describeNow, buildSystemPrompt, extractToolInput, validateParsed, validateRequest, TOOL } from '../supabase/functions/_shared/parse.ts';

describe('describeNow', () => {
  it('Wochentag, Datum, Uhrzeit und Zone auf Deutsch', () => {
    expect(describeNow('2026-11-16T17:43:00Z', 'Europe/Berlin')).toBe('Montag, 16.11.2026, 18:43 Uhr (Europe/Berlin)');
  });
  it('Ortszeit, nicht UTC-Datum (00:30 Berlin)', () => {
    expect(describeNow('2026-11-16T23:30:00Z', 'Europe/Berlin')).toBe('Dienstag, 17.11.2026, 00:30 Uhr (Europe/Berlin)');
  });
});

describe('buildSystemPrompt', () => {
  const p = buildSystemPrompt('Montag, 16.11.2026, 18:43 Uhr (Europe/Berlin)', '17:00');
  it('enthält Jetzt-Zeit und Standardzeit', () => {
    expect(p).toContain('Montag, 16.11.2026, 18:43 Uhr (Europe/Berlin)');
    expect(p).toContain('17:00');
  });
  it('sagt, keine Uhrzeit zu raten', () => expect(p.toLowerCase()).toContain('keine uhrzeit'));
});

describe('TOOL', () => {
  it('heißt create_notes und erlaubt 1 bis 10 Einträge', () => {
    expect(TOOL.name).toBe('create_notes');
    const notes = (TOOL.input_schema as any).properties.notes;
    expect(notes.minItems).toBe(1);
    expect(notes.maxItems).toBe(10);
  });
});

describe('extractToolInput', () => {
  const input = { notes: [{ text: 'x', date: null, time: null }] };
  it('findet den Werkzeugblock zwischen anderen Blöcken', () => {
    const resp = { content: [{ type: 'text', text: 'ok' }, { type: 'tool_use', name: 'create_notes', input }] };
    expect(extractToolInput(resp)).toEqual(input);
  });
  it('null ohne passenden Block', () => {
    expect(extractToolInput({ content: [{ type: 'text', text: 'hm' }] })).toBeNull();
    expect(extractToolInput({ content: [{ type: 'tool_use', name: 'anderes', input }] })).toBeNull();
    expect(extractToolInput(null)).toBeNull();
    expect(extractToolInput({})).toBeNull();
  });
});

describe('validateParsed', () => {
  const n = (o: object = {}) => ({ text: 'Reifen wechseln', date: '2026-11-20', time: '09:00', ...o });
  it('gültiger Eintrag bleibt', () => {
    expect(validateParsed({ notes: [n()] })).toEqual([{ text: 'Reifen wechseln', date: '2026-11-20', time: '09:00' }]);
  });
  it('kein echtes Kalenderdatum → date null', () => {
    expect(validateParsed({ notes: [n({ date: '2026-02-30' })] })[0].date).toBeNull();
  });
  it('falsches Datumsformat → date null', () => {
    expect(validateParsed({ notes: [n({ date: 'morgen' })] })[0].date).toBeNull();
  });
  it('ungültige Uhrzeit → time null', () => {
    expect(validateParsed({ notes: [n({ time: '25:00' })] })[0].time).toBeNull();
    expect(validateParsed({ notes: [n({ time: '9:00' })] })[0].time).toBeNull();
  });
  it('Zeit ohne Datum bleibt erhalten (die App entscheidet über „heute/morgen“)', () => {
    expect(validateParsed({ notes: [n({ date: null })] })[0]).toEqual({ text: 'Reifen wechseln', date: null, time: '09:00' });
  });
  it('Text wird getrimmt und auf 200 Zeichen gekürzt', () => {
    expect(validateParsed({ notes: [n({ text: '  ' + 'x'.repeat(300) + '  ' })] })[0].text).toHaveLength(200);
  });
  it('leerer Text wird verworfen', () => {
    expect(validateParsed({ notes: [n({ text: '   ' }), n()] })).toHaveLength(1);
  });
  it('höchstens 10 Einträge', () => {
    expect(validateParsed({ notes: Array.from({ length: 11 }, () => n()) })).toHaveLength(10);
  });
  it('unbrauchbare Eingaben ergeben eine leere Liste', () => {
    for (const bad of [null, undefined, {}, { notes: 'x' }, { notes: [] }, { notes: [null, 5, 'a'] }, 'text', 42]) {
      expect(validateParsed(bad)).toEqual([]);
    }
  });
  it('Felder mit falschem Typ werden null statt Absturz', () => {
    expect(validateParsed({ notes: [n({ date: 5, time: {} })] })[0]).toEqual({ text: 'Reifen wechseln', date: null, time: null });
  });
});

describe('validateRequest', () => {
  const ok = { text: 'morgen Zahnarzt anrufen', now: '2026-11-16T17:43:00Z', timezone: 'Europe/Berlin', defaultTime: '17:00' };
  it('gültig (Text wird getrimmt)', () => {
    expect(validateRequest({ ...ok, text: '  morgen Zahnarzt anrufen ' })).toEqual(ok);
  });
  it('Text länger als 1000 Zeichen', () => expect(validateRequest({ ...ok, text: 'x'.repeat(1001) })).toBeNull());
  it('genau 1000 Zeichen sind erlaubt', () => expect(validateRequest({ ...ok, text: 'x'.repeat(1000) })).not.toBeNull());
  it('leerer Text', () => { expect(validateRequest({ ...ok, text: '   ' })).toBeNull(); expect(validateRequest({ ...ok, text: '' })).toBeNull(); });
  it('unbekannte Zeitzone', () => expect(validateRequest({ ...ok, timezone: 'Mars/Base' })).toBeNull());
  it('ungültige Standardzeit', () => expect(validateRequest({ ...ok, defaultTime: '5pm' })).toBeNull());
  it('ungültiges Jetzt', () => expect(validateRequest({ ...ok, now: 'gestern' })).toBeNull());
  it('kein Objekt', () => { expect(validateRequest(null)).toBeNull(); expect(validateRequest('x')).toBeNull(); });
});
