// Claude direkt aus der App: Der Text wird mit dem eigenen Schlüssel des Nutzers an die Anthropic-API geschickt.
import { TOOL, MAX_INPUT, buildSystemPrompt, describeNow, extractToolInput, validateParsed } from './ai-parse.js';

const MODEL = 'claude-haiku-5-5';
const URL = 'https://api.anthropic.com/v1/messages';
const MSG = {
  noKey: 'Claude-Schlüssel fehlt. Bitte in den Einstellungen eintragen.',
  rejected: 'Der Claude-Schlüssel wurde abgelehnt.',
  limit: 'Claude ist gerade überlastet oder das Limit ist erreicht. Bitte tippen.',
  invalid: 'Das konnte ich nicht verarbeiten.',
  unavailable: 'Claude ist gerade nicht erreichbar. Bitte tippen.',
};

// Windows-App: der Aufruf läuft über den Hauptprozess (der nur die Anthropic-API erlaubt); sonst direkt aus der App.
async function defaultFetch(url, init) {
  const bridge = globalThis.dtfDesktop;
  if (bridge?.fetch) {
    const r = await bridge.fetch(url, init);
    return new Response(r.body, { status: r.status });
  }
  return fetch(url, init);
}

export async function parseNotes(text, settings, fetchImpl = defaultFetch) {
  const key = String(settings.ai_key ?? '').trim();
  if (!key) throw new Error(MSG.noKey);
  const t = String(text ?? '').trim();
  if (!t || t.length > MAX_INPUT) throw new Error(MSG.invalid);

  let res;
  try {
    res = await fetchImpl(URL, {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true', // direkter Aufruf aus der App (Schlüssel gehört dem Nutzer)
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: buildSystemPrompt(describeNow(new Date().toISOString(), settings.timezone), settings.default_time),
        messages: [{ role: 'user', content: t }],
        tools: [TOOL],
        tool_choice: { type: 'tool', name: TOOL.name },
      }),
    });
  } catch { throw new Error(MSG.unavailable); }

  if (res.status === 401 || res.status === 403) throw new Error(MSG.rejected);
  if (res.status === 429) throw new Error(MSG.limit);
  if (!res.ok) throw new Error(MSG.unavailable);
  let json;
  try { json = await res.json(); } catch { throw new Error(MSG.unavailable); }
  return validateParsed(extractToolInput(json));
}
