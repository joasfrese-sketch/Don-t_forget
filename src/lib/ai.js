// Aufruf der Edge Function parse-note und deutsche Fehlermeldungen.
import { supabase } from './supabase.js';

const MESSAGES = {
  not_configured: 'Claude ist noch nicht eingerichtet.',
  limit: 'Tageslimit für die KI erreicht. Bitte tippen.',
  invalid: 'Das konnte ich nicht verarbeiten.',
};
const UNAVAILABLE = 'Claude ist gerade nicht erreichbar. Bitte tippen.';

export const aiErrorMessage = (code) => MESSAGES[code] ?? UNAVAILABLE;

// supabase-js liefert bei Statuscodes ≠ 2xx einen Fehler; die Antwort der Funktion steckt in error.context.
async function errorCode(error) {
  try { return (await error.context.json()).error; } catch { return undefined; }
}

export async function parseNotes(text, settings) {
  let res;
  try {
    res = await supabase.functions.invoke('parse-note', {
      body: { text, now: new Date().toISOString(), timezone: settings.timezone, defaultTime: settings.default_time },
    });
  } catch { throw new Error(UNAVAILABLE); }
  if (res.error) throw new Error(aiErrorMessage(await errorCode(res.error)));
  return res.data?.notes ?? [];
}
