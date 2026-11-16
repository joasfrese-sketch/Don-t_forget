import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/lib/supabase.js', () => ({ supabase: { functions: { invoke: vi.fn() } }, unwrap: (r) => r.data }));
import { supabase } from '../src/lib/supabase.js';
import { aiErrorMessage, parseNotes } from '../src/lib/ai.js';

const settings = { default_time: '17:00', timezone: 'Europe/Berlin' };

describe('aiErrorMessage', () => {
  it('not_configured', () => expect(aiErrorMessage('not_configured')).toBe('Claude ist noch nicht eingerichtet.'));
  it('limit', () => expect(aiErrorMessage('limit')).toBe('Tageslimit für die KI erreicht. Bitte tippen.'));
  it('invalid', () => expect(aiErrorMessage('invalid')).toBe('Das konnte ich nicht verarbeiten.'));
  it('unavailable und unbekannt', () => {
    expect(aiErrorMessage('unavailable')).toBe('Claude ist gerade nicht erreichbar. Bitte tippen.');
    expect(aiErrorMessage(undefined)).toBe('Claude ist gerade nicht erreichbar. Bitte tippen.');
  });
});

describe('parseNotes', () => {
  it('sendet Text, Zeit, Zone und Standardzeit und gibt die Notizen zurück', async () => {
    supabase.functions.invoke.mockResolvedValueOnce({ data: { notes: [{ text: 'a', date: null, time: null }] }, error: null });
    const out = await parseNotes('Zahnarzt anrufen', settings);
    expect(out).toEqual([{ text: 'a', date: null, time: null }]);
    const [name, opts] = supabase.functions.invoke.mock.calls.at(-1);
    expect(name).toBe('parse-note');
    expect(opts.body).toMatchObject({ text: 'Zahnarzt anrufen', timezone: 'Europe/Berlin', defaultTime: '17:00' });
    expect(Number.isNaN(new Date(opts.body.now).getTime())).toBe(false);
  });

  // supabase-js liefert bei Statuscodes ≠ 2xx einen Fehler mit der Antwort in error.context
  const httpError = (body) => ({ data: null, error: { context: { json: async () => body } } });

  it('übersetzt Fehlercodes der Funktion in deutsche Meldungen', async () => {
    supabase.functions.invoke.mockResolvedValueOnce(httpError({ error: 'limit' }));
    await expect(parseNotes('x', settings)).rejects.toThrow('Tageslimit für die KI erreicht. Bitte tippen.');
    supabase.functions.invoke.mockResolvedValueOnce(httpError({ error: 'not_configured' }));
    await expect(parseNotes('x', settings)).rejects.toThrow('Claude ist noch nicht eingerichtet.');
  });

  it('Netzfehler ohne lesbare Antwort → „nicht erreichbar“', async () => {
    supabase.functions.invoke.mockResolvedValueOnce({ data: null, error: new Error('Failed to fetch') });
    await expect(parseNotes('x', settings)).rejects.toThrow('Claude ist gerade nicht erreichbar. Bitte tippen.');
    supabase.functions.invoke.mockRejectedValueOnce(new Error('offline'));
    await expect(parseNotes('x', settings)).rejects.toThrow('Claude ist gerade nicht erreichbar. Bitte tippen.');
  });

  it('leere Antwort ergibt eine leere Liste', async () => {
    supabase.functions.invoke.mockResolvedValueOnce({ data: { notes: [] }, error: null });
    expect(await parseNotes('x', settings)).toEqual([]);
    supabase.functions.invoke.mockResolvedValueOnce({ data: null, error: null });
    expect(await parseNotes('x', settings)).toEqual([]);
  });
});
