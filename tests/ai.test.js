import { describe, it, expect, vi } from 'vitest';
import { parseNotes } from '../src/lib/ai.js';

const settings = { default_time: '17:00', timezone: 'Europe/Berlin', ai_key: 'sk-ant-test' };
const okResponse = (notes) => ({ ok: true, status: 200, json: async () => ({ content: [{ type: 'tool_use', name: 'create_notes', input: { notes } }] }) });
const failing = (status) => ({ ok: false, status, json: async () => ({}) , text: async () => 'fehler' });

describe('parseNotes', () => {
  it('ruft die Anthropic-API mit Schlüssel, Werkzeugzwang und Kontext auf und gibt Notizen zurück', async () => {
    const fetchImpl = vi.fn(async () => okResponse([{ text: 'Zahnarzt anrufen', date: '2026-11-17', time: null }]));
    const out = await parseNotes('  morgen Zahnarzt anrufen ', settings, fetchImpl);
    expect(out).toEqual([{ text: 'Zahnarzt anrufen', date: '2026-11-17', time: null }]);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'x-api-key': 'sk-ant-test', 'anthropic-version': '2023-06-01', 'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    });
    const body = JSON.parse(init.body);
    expect(body.model).toBe('claude-haiku-5-5');
    expect(body.messages).toEqual([{ role: 'user', content: 'morgen Zahnarzt anrufen' }]);
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'create_notes' });
    expect(body.tools[0].name).toBe('create_notes');
    expect(body.system).toContain('17:00');
    expect(body.system).toContain('Europe/Berlin');
  });

  it('ohne Schlüssel: klare Meldung, kein Netzwerkzugriff', async () => {
    const fetchImpl = vi.fn();
    for (const ai_key of ['', '   ', undefined]) {
      await expect(parseNotes('x', { ...settings, ai_key }, fetchImpl)).rejects.toThrow('Claude-Schlüssel fehlt. Bitte in den Einstellungen eintragen.');
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('leerer oder zu langer Text wird nicht gesendet', async () => {
    const fetchImpl = vi.fn();
    await expect(parseNotes('   ', settings, fetchImpl)).rejects.toThrow('Das konnte ich nicht verarbeiten.');
    await expect(parseNotes('x'.repeat(1001), settings, fetchImpl)).rejects.toThrow('Das konnte ich nicht verarbeiten.');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('401/403: Schlüssel abgelehnt', async () => {
    for (const status of [401, 403]) {
      await expect(parseNotes('x', settings, async () => failing(status))).rejects.toThrow('Der Claude-Schlüssel wurde abgelehnt.');
    }
  });
  it('429: Limit/überlastet', async () => {
    await expect(parseNotes('x', settings, async () => failing(429))).rejects.toThrow('Claude ist gerade überlastet oder das Limit ist erreicht. Bitte tippen.');
  });
  it('andere Fehler und Netzfehler: nicht erreichbar', async () => {
    await expect(parseNotes('x', settings, async () => failing(500))).rejects.toThrow('Claude ist gerade nicht erreichbar. Bitte tippen.');
    await expect(parseNotes('x', settings, async () => { throw new TypeError('Failed to fetch'); })).rejects.toThrow('Claude ist gerade nicht erreichbar. Bitte tippen.');
  });
  it('kaputte Antwort (kein JSON) → nicht erreichbar, nicht Absturz', async () => {
    await expect(parseNotes('x', settings, async () => ({ ok: true, status: 200, json: async () => { throw new Error('kein JSON'); } }))).rejects.toThrow('Claude ist gerade nicht erreichbar. Bitte tippen.');
  });
  it('Antwort ohne Werkzeugblock (z. B. Ablehnung) → leere Liste', async () => {
    expect(await parseNotes('x', settings, async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'Das kann ich nicht.' }] }) }))).toEqual([]);
  });
  it('Unbrauchbares aus Claude wird bereinigt (kaputtes Datum, mehr als 10)', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ text: 'n' + i, date: i === 0 ? '2026-02-30' : null, time: null }));
    const out = await parseNotes('x', settings, async () => okResponse(many));
    expect(out).toHaveLength(10);
    expect(out[0].date).toBeNull();
  });
});
